-- =====================================================================
-- app_inscricoes → fan-out v3 · BATISMO + NEXT (2026-07-06)
-- =====================================================================
-- Auditoria pré-lançamento do app (App Store): inscrições de batismo feitas
-- pelo app caíam SÓ em app_inscricoes — invisíveis em todo o sistema (a fila
-- pedidos-app do Cuidados só lê aconselhamento/oracao/sos) — e o membro ainda
-- recebia WhatsApp de confirmação. Este fan-out cria o registro nativo:
--   batismo → batismo_inscricoes (aparece no módulo /batismo)
--   next    → next_inscricoes (rede de segurança · o fluxo vivo do app já usa
--             POST /app/next/inscrever; a tela órfã que usava tipo='next' virou
--             redirect no app, mas builds antigos podem ainda enviar)
-- Mantém voluntariado/grupos como estavam (agora com o bloco de dedup do
-- voluntariado TAMBÉM protegido — antes uma exceção ali quebrava o POST do app).
-- Todos os branches são best-effort: falha vira WARNING, nunca quebra o INSERT.
-- ADITIVA · idempotente (CREATE OR REPLACE + DROP/ADD CONSTRAINT).
-- =====================================================================

-- 1) origem 'app' passa a ser válida em batismo_inscricoes
ALTER TABLE public.batismo_inscricoes
  DROP CONSTRAINT IF EXISTS batismo_inscricoes_origem_check;
ALTER TABLE public.batismo_inscricoes
  ADD CONSTRAINT batismo_inscricoes_origem_check
  CHECK (origem = ANY (ARRAY['totem'::text, 'manual'::text, 'publico'::text, 'app'::text]));

-- 2) Próximo 4º domingo (espelha proximoQuartoDomingoISO do publicBatismo.js ·
--    data em BRT). 1º domingo do mês = dia 1 + ((7 - dow(dia 1)) % 7); 4º = +21.
CREATE OR REPLACE FUNCTION public.fn_proximo_quarto_domingo(
  p_hoje date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date
) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  WITH m AS (
    SELECT date_trunc('month', p_hoje)::date AS m1,
           (date_trunc('month', p_hoje) + interval '1 month')::date AS m2
  ), q AS (
    SELECT m1 + (((7 - EXTRACT(DOW FROM m1)::int) % 7) + 21) AS q_este,
           m2 + (((7 - EXTRACT(DOW FROM m2)::int) % 7) + 21) AS q_prox
      FROM m
  )
  SELECT CASE WHEN q_este >= p_hoje THEN q_este ELSE q_prox END FROM q;
$$;

-- 3) Fan-out v3
CREATE OR REPLACE FUNCTION public.fn_app_inscricoes_fanout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb := COALESCE(NEW.dados, '{}'::jsonb);
  v_labels text[];
  v_area text;
  v_nome text; v_sobre text; v_completo text;
  v_membro uuid; v_email text;
  v_cpf text; v_tel text;
  v_data_batismo date;
  v_evento uuid;
BEGIN
  IF NEW.tipo = 'voluntariado' THEN
    -- Branch INTEIRO protegido (antes o dedup/lookup ficava fora do handler e
    -- uma exceção ali abortava o INSERT em app_inscricoes = quebrava o app).
    BEGIN
      v_membro := NULLIF(d->>'membro_id','')::uuid;
      v_email  := NULLIF(d->>'email','');

      -- DEDUP · já existe inscrição em aberto pra essa pessoa?
      IF EXISTS (
        SELECT 1 FROM public.vol_inscricoes vi
         WHERE vi.status IN ('inscrito','enviado_ministerio')
           AND ( (v_membro IS NOT NULL AND vi.membro_id = v_membro)
              OR (v_email IS NOT NULL AND lower(vi.email) = lower(v_email)) )
      ) THEN
        UPDATE public.app_inscricoes SET status = 'duplicado' WHERE id = NEW.id AND status = 'pendente';
        RETURN NULL;
      END IF;

      SELECT array_agg(x) INTO v_labels
        FROM jsonb_array_elements_text(COALESCE(d->'areas', '[]'::jsonb)) x;
      v_area := COALESCE((
        SELECT o.area_canonica FROM public.vol_form_opcoes o
         WHERE o.label = ANY(v_labels) AND o.area_canonica IN ('kids','bridge','ami','online')
         ORDER BY CASE o.area_canonica WHEN 'kids' THEN 1 WHEN 'bridge' THEN 2 WHEN 'ami' THEN 3 ELSE 4 END
         LIMIT 1), 'sede');
      v_nome := COALESCE(NULLIF(d->>'nome',''), split_part(COALESCE(d->>'nome_completo',''),' ',1), 'Voluntário');
      v_sobre := COALESCE(NULLIF(d->>'sobrenome',''), '-');
      v_completo := COALESCE(NULLIF(d->>'nome_completo',''), trim(v_nome || ' ' || v_sobre));

      INSERT INTO public.vol_inscricoes
        (nome, sobrenome, nome_completo, cpf, email, telefone, nome_mae, data_inscricao,
         ministerios_interesse, area, status, primeiro_contato_em, membro_id, origem)
      VALUES
        (v_nome, v_sobre, v_completo,
         NULLIF(regexp_replace(COALESCE(d->>'cpf',''),'\D','','g'),''),
         v_email,
         NULLIF(regexp_replace(COALESCE(d->>'telefone',''),'\D','','g'),''),
         NULLIF(d->>'nome_mae',''),
         COALESCE(NEW.created_at, now()),
         NULLIF(array_to_string(v_labels, ', '), ''),
         v_area, 'inscrito', 'False',
         v_membro, 'app');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[app_inscricoes_fanout voluntariado] %', SQLERRM;
    END;

  ELSIF NEW.tipo = 'grupos' THEN
    IF NULLIF(d->>'grupo_id','') IS NOT NULL THEN
      BEGIN
        INSERT INTO public.mem_grupo_pedidos
          (grupo_id, membro_id, nome, email, telefone, origem, status, observacao)
        VALUES
          ((d->>'grupo_id')::uuid, NULLIF(d->>'membro_id','')::uuid,
           COALESCE(NULLIF(d->>'nome',''),'Membro'), NULLIF(d->>'email',''),
           NULLIF(regexp_replace(COALESCE(d->>'telefone',''),'\D','','g'),''),
           'app', 'pendente', NULLIF(d->>'observacao',''));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[app_inscricoes_fanout grupos] %', SQLERRM;
      END;
    END IF;

  ELSIF NEW.tipo = 'batismo' THEN
    BEGIN
      v_membro := NULLIF(d->>'membro_id','')::uuid;
      v_cpf    := NULLIF(regexp_replace(COALESCE(d->>'cpf',''), '\D', '', 'g'), '');
      v_tel    := NULLIF(regexp_replace(COALESCE(d->>'telefone',''), '\D', '', 'g'), '');
      v_data_batismo := public.fn_proximo_quarto_domingo();

      -- Vínculo por CPF quando o app não mandou membro_id (match forte · nunca cria membro)
      IF v_membro IS NULL AND v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
        SELECT id INTO v_membro FROM public.mem_membros
         WHERE regexp_replace(COALESCE(cpf,''), '\D', '', 'g') = v_cpf
           AND deleted_at IS NULL
         ORDER BY created_at LIMIT 1;
      END IF;

      -- DEDUP (regra do form público + telefone só combinado com nome):
      IF EXISTS (
        SELECT 1 FROM public.batismo_inscricoes bi
         WHERE bi.status IN ('pendente','confirmado')
           AND bi.deleted_at IS NULL
           AND (
                (v_membro IS NOT NULL AND bi.membro_id = v_membro)
             OR (v_cpf IS NOT NULL AND regexp_replace(COALESCE(bi.cpf,''), '\D','','g') = v_cpf)
             OR (v_tel IS NOT NULL
                 AND regexp_replace(COALESCE(bi.telefone,''), '\D','','g') = v_tel
                 AND lower(btrim(bi.nome)) = lower(btrim(COALESCE(d->>'nome',''))))
           )
      ) THEN
        UPDATE public.app_inscricoes SET status = 'duplicado' WHERE id = NEW.id AND status = 'pendente';
        RETURN NULL;
      END IF;

      INSERT INTO public.batismo_inscricoes
        (nome, sobrenome, data_nascimento, cpf, telefone, email,
         status, data_batismo, origem, membro_id,
         tamanho_camisa, possui_deficiencia, deficiencia_descricao,
         observacoes, area_kpi)
      VALUES
        (COALESCE(NULLIF(btrim(d->>'nome'),''), 'Membro'),
         COALESCE(NULLIF(btrim(d->>'sobrenome'),''), '-'),
         (CASE WHEN d->>'data_nascimento' ~ '^\d{4}-\d{2}-\d{2}$' THEN (d->>'data_nascimento')::date END),
         v_cpf, v_tel, NULLIF(lower(btrim(d->>'email')),''),
         'pendente', v_data_batismo, 'app', v_membro,
         (CASE WHEN upper(btrim(COALESCE(d->>'tamanho_camisa',''))) IN ('PP','P','M','G','GG','XG','XGG')
               THEN upper(btrim(d->>'tamanho_camisa')) END),
         COALESCE((d->>'possui_deficiencia')::boolean, false),
         NULLIF(btrim(COALESCE(d->>'deficiencia_descricao','')),''),
         NULLIF(btrim(COALESCE(d->>'observacoes','')),''),
         'sede'); -- fn_batismo_area_da_conversao (BEFORE) herda a área da conversão
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[app_inscricoes_fanout batismo] %', SQLERRM;
    END;

  ELSIF NEW.tipo = 'next' THEN
    -- Rede de segurança pra builds antigos do app (a tela órfã inscricao-next
    -- usava tipo='next'; o fluxo vivo usa POST /app/next/inscrever direto).
    BEGIN
      v_membro := NULLIF(d->>'membro_id','')::uuid;
      v_cpf    := NULLIF(regexp_replace(COALESCE(d->>'cpf',''), '\D','','g'), '');

      -- Evento: o enviado pelo form (se agendado e futuro), senão o próximo agendado
      SELECT id INTO v_evento FROM public.next_eventos
       WHERE id = NULLIF(d->>'evento_id','')::uuid AND status = 'agendado'
         AND data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
      IF v_evento IS NULL THEN
        SELECT id INTO v_evento FROM public.next_eventos
         WHERE status = 'agendado' AND data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
         ORDER BY data LIMIT 1;
      END IF;

      IF v_evento IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.next_inscricoes ni
         WHERE ni.evento_id = v_evento
           AND ( (v_membro IS NOT NULL AND ni.membro_id = v_membro)
              OR (v_cpf IS NOT NULL AND regexp_replace(COALESCE(ni.cpf,''),'\D','','g') = v_cpf) )
      ) THEN
        INSERT INTO public.next_inscricoes
          (evento_id, nome, sobrenome, cpf, email, telefone, membro_id, origem)
        VALUES (v_evento,
          COALESCE(NULLIF(btrim(d->>'nome'),''),'Membro'),
          NULLIF(btrim(COALESCE(d->>'sobrenome','')),''),
          v_cpf, NULLIF(lower(btrim(COALESCE(d->>'email',''))),''),
          NULLIF(regexp_replace(COALESCE(d->>'telefone',''),'\D','','g'),''),
          v_membro, 'app');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[app_inscricoes_fanout next] %', SQLERRM;
    END;
  END IF;

  UPDATE public.app_inscricoes SET status = 'processado' WHERE id = NEW.id AND status = 'pendente';
  RETURN NULL;
END;
$$;

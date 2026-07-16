-- ============================================================================
-- WiFi como semente de identidade por CPF (auditoria CPF · 2026-07-16)
--
-- O portal cativo é a MAIOR fonte de CPF do sistema: 4.535 cadastros com CPF
-- (todos com máscara · cpf_norm derivada digits-only), dos quais ~2.960 não
-- correspondem a nenhum membro. E o vínculo wifi→membro tinha 2 problemas:
--
--   a) step 5 ligava por TELEFONE SOZINHO (família compartilha número ·
--      viola a política do membroMatch e contamina a ficha de cruzamento);
--   b) o CPF do wifi nunca era aproveitado pra completar o cadastro do
--      membro — membro casado por telefone ficava sem CPF pra sempre.
--
-- Esta migration (depende da 20260716160000 · fn_identidade_nomes_compativeis):
--   1. fn_cpf_dv_valido · dígito verificador em SQL (wifi aceita qualquer
--      11 dígitos · CPF errado não pode virar identidade).
--   2. fn_wifi_processar_vinculos v2 · telefone exige NOME compatível +
--      passo novo de SEMENTE (preenche mem_membros.cpf vazio a partir do
--      wifi quando o par é inequívoco) + DV no auto-visitante + correção
--      contínua de vínculo morto/divergente.
--   3. Backfill one-time: repoint dos vínculos divergentes (resíduo das
--      fusões de julho) + semeadura inicial.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Dígito verificador de CPF em SQL
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cpf_dv_valido(p text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  d text; s int; dv int; i int;
BEGIN
  d := regexp_replace(COALESCE(p, ''), '\D', '', 'g');
  IF length(d) <> 11 OR d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..9 LOOP s := s + (substr(d, i, 1))::int * (11 - i); END LOOP;
  dv := ((s * 10) % 11) % 10;
  IF dv <> (substr(d, 10, 1))::int THEN RETURN false; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + (substr(d, i, 1))::int * (12 - i); END LOOP;
  dv := ((s * 10) % 11) % 10;
  RETURN dv = (substr(d, 11, 1))::int;
END $$;

COMMENT ON FUNCTION public.fn_cpf_dv_valido(text) IS
  'Valida os dígitos verificadores do CPF (rejeita sequências repetidas). Espelho SQL do cpfValido (backend/utils/cpf.js).';

-- ----------------------------------------------------------------------------
-- 2. fn_wifi_processar_vinculos v2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_wifi_processar_vinculos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vinc_membro integer := 0;
  v_criados     integer := 0;
  v_semeados    integer := 0;
BEGIN
  -- 1) normalizações (barato · recomputa sempre)
  UPDATE public.wifi_visitantes SET
    cpf_norm  = NULLIF(regexp_replace(COALESCE(cpf,''),'\D','','g'),''),
    tel_norm  = NULLIF(regexp_replace(COALESCE(telefone,''),'\D','','g'),''),
    nome_norm = NULLIF(lower(public.unaccent(trim(regexp_replace(COALESCE(nome,''),'\s+',' ','g')))),'')
  WHERE deleted_at IS NULL
    AND (cpf_norm IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(cpf,''),'\D','','g'),'')
      OR tel_norm IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(telefone,''),'\D','','g'),'')
      OR nome_norm IS NULL);

  -- 2) liga conexão → visitante pelo MAC (prefere o cadastro mais recente)
  WITH m AS (
    SELECT cx.id AS conexao_id, v.id AS visitante_id,
           row_number() OVER (PARTITION BY cx.id
             ORDER BY v.data_acesso DESC NULLS LAST) AS rn
    FROM public.wifi_conexoes cx
    JOIN public.wifi_visitantes v
      ON v.deleted_at IS NULL
     AND upper(v.mac_address) = upper(cx.mac_address)
    WHERE cx.wifi_visitante_id IS NULL
      AND COALESCE(cx.mac_address,'') <> ''
  )
  UPDATE public.wifi_conexoes x
     SET wifi_visitante_id = m.visitante_id
    FROM m WHERE m.conexao_id = x.id AND m.rn = 1;

  -- 3) resolve culto pela janela de horário (login mais próximo do início)
  WITH cand AS (
    SELECT cx.id AS conexao_id, c.id AS culto_id,
           row_number() OVER (PARTITION BY cx.id ORDER BY
             abs(EXTRACT(EPOCH FROM (
               (cx.timestamp_evento AT TIME ZONE 'America/Sao_Paulo')::time - st.recurrence_time
             )))) AS rn
    FROM public.wifi_conexoes cx
    JOIN public.cultos c
      ON c.deleted_at IS NULL
     AND c.data = (cx.timestamp_evento AT TIME ZONE 'America/Sao_Paulo')::date
    JOIN public.vol_service_types st
      ON st.id = c.service_type_id
     AND (cx.timestamp_evento AT TIME ZONE 'America/Sao_Paulo')::time
         BETWEEN st.recurrence_time - interval '30 min'
             AND st.recurrence_time + interval '120 min'
    WHERE cx.evento = 'login' AND cx.culto_id IS NULL
  )
  UPDATE public.wifi_conexoes x
     SET culto_id = cand.culto_id
    FROM cand WHERE cand.conexao_id = x.id AND cand.rn = 1;

  -- 4) match com membro · por CPF (mais confiável · normalizado dos 2 lados)
  UPDATE public.wifi_visitantes v
     SET membro_id = m.id, match_tipo = 'cpf', updated_at = now()
    FROM public.mem_membros m
   WHERE v.membro_id IS NULL
     AND v.deleted_at IS NULL
     AND v.cpf_norm ~ '^[0-9]{11}$'
     AND m.deleted_at IS NULL
     AND regexp_replace(COALESCE(m.cpf,''),'\D','','g') = v.cpf_norm;
  GET DIAGNOSTICS v_vinc_membro = ROW_COUNT;

  -- 4b) correção contínua: vínculo apontando pra membro DELETADO → repoint
  --     pro dono ativo do CPF (resíduo das fusões: o membro fundido morre e o
  --     CPF passa a pertencer ao sobrevivente). Vínculo VIVO com CPF
  --     divergente NÃO é re-apontado (o vínculo pode estar certo e o CPF do
  --     portal errado — ex.: esposa digitou o CPF do marido) → vira pendência
  --     humana (política: nunca auto-religar em cima de vínculo vivo).
  UPDATE public.wifi_visitantes v
     SET membro_id = dono.id, match_tipo = 'cpf', updated_at = now()
    FROM public.mem_membros lig, public.mem_membros dono
   WHERE lig.id = v.membro_id
     AND lig.deleted_at IS NOT NULL
     AND v.deleted_at IS NULL
     AND v.cpf_norm ~ '^[0-9]{11}$'
     AND dono.deleted_at IS NULL
     AND regexp_replace(COALESCE(dono.cpf,''),'\D','','g') = v.cpf_norm
     AND dono.id <> v.membro_id;

  -- 4c) pendência pros vínculos VIVOS divergentes (fila humana · módulo
  --     Entradas · tabela da 20260716150000; se ainda não existir, pula)
  BEGIN
    INSERT INTO public.identidade_pendencias (tipo, membro_id, membro_conflito_id, origem, detalhe)
    SELECT DISTINCT 'vinculo_divergente', lig.id, dono.id, 'wifi',
           'wifi_visitantes ligado a um membro vivo cujo CPF difere do CPF do portal.'
      FROM public.wifi_visitantes v
      JOIN public.mem_membros lig ON lig.id = v.membro_id AND lig.deleted_at IS NULL
      JOIN public.mem_membros dono
        ON dono.deleted_at IS NULL
       AND regexp_replace(COALESCE(dono.cpf,''),'\D','','g') = v.cpf_norm
       AND dono.id <> lig.id
     WHERE v.deleted_at IS NULL
       AND v.cpf_norm ~ '^[0-9]{11}$'
       AND lig.cpf IS NOT NULL
       AND regexp_replace(lig.cpf,'\D','','g') <> v.cpf_norm
    ON CONFLICT (tipo, membro_id, membro_conflito_id) WHERE status = 'pendente' DO NOTHING;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 5) match com membro · por telefone + NOME compatível (antes era telefone
  --    SOZINHO — família compartilha o número · política do membroMatch)
  UPDATE public.wifi_visitantes v
     SET membro_id = m.id, match_tipo = 'telefone', updated_at = now()
    FROM public.mem_membros m
   WHERE v.membro_id IS NULL
     AND v.deleted_at IS NULL
     AND v.tel_norm ~ '^[0-9]{10,11}$'
     AND m.deleted_at IS NULL
     AND regexp_replace(COALESCE(m.telefone,''),'\D','','g') = v.tel_norm
     AND public.fn_identidade_nomes_compativeis(m.nome, v.nome);

  -- 5b) SEMENTE: membro vivo SEM CPF vinculado a wifi com CPF DV-válido →
  --     preenche o CPF no membro. Gates: NOME compatível (vínculos legados
  --     por telefone-sozinho podem estar errados — não semear neles), par
  --     inequívoco (1 CPF distinto por membro E 1 membro por CPF) e CPF
  --     livre entre os vivos.
  WITH cand AS (
    SELECT DISTINCT m.id AS membro_id, v.cpf_norm
    FROM public.mem_membros m
    JOIN public.wifi_visitantes v
      ON v.membro_id = m.id
     AND v.deleted_at IS NULL
     AND v.cpf_norm ~ '^[0-9]{11}$'
     AND public.fn_identidade_nomes_compativeis(m.nome, v.nome)
    WHERE m.deleted_at IS NULL
      AND m.cpf IS NULL
  ),
  -- par inequívoco: 1 CPF distinto por membro E 1 membro por CPF
  -- (count(DISTINCT) não existe em window function · GROUP BY resolve)
  membro_unico AS (
    SELECT membro_id FROM cand GROUP BY membro_id HAVING count(DISTINCT cpf_norm) = 1
  ),
  cpf_unico AS (
    SELECT cpf_norm FROM cand GROUP BY cpf_norm HAVING count(DISTINCT membro_id) = 1
  ),
  gated AS (
    SELECT c.membro_id, c.cpf_norm
    FROM cand c
    JOIN membro_unico mu ON mu.membro_id = c.membro_id
    JOIN cpf_unico    cu ON cu.cpf_norm  = c.cpf_norm
    WHERE public.fn_cpf_dv_valido(c.cpf_norm)
      AND NOT EXISTS (
        SELECT 1 FROM public.mem_membros x
         WHERE x.deleted_at IS NULL
           AND regexp_replace(COALESCE(x.cpf,''),'\D','','g') = c.cpf_norm
      )
  ),
  semeados AS (
    UPDATE public.mem_membros m
       SET cpf = g.cpf_norm, updated_at = now()
      FROM gated g
     WHERE m.id = g.membro_id AND m.cpf IS NULL
    RETURNING m.id
  )
  -- rastro da semente (auditável · mesmo padrão do cpfReconciliar do backend)
  INSERT INTO public.mem_historico (membro_id, acao, observacao, created_at)
  SELECT se.id, 'cpf_recebido',
         'CPF consolidado a partir do cadastro do portal WiFi (par telefone+nome inequívoco).', now()
    FROM semeados se;
  GET DIAGNOSTICS v_semeados = ROW_COUNT;

  -- 5c) conflito descartado vira pendência (não jogar evidência fora ·
  --     política: conflito → fila humana)
  BEGIN
    INSERT INTO public.identidade_pendencias (tipo, membro_id, membro_conflito_id, origem, detalhe)
    SELECT DISTINCT 'cpf_conflito', m.id, dono.id, 'wifi',
           'Membro sem CPF vinculado a wifi cujo CPF já pertence a outro membro vivo — provável mesma pessoa em 2 cadastros (fundir).'
      FROM public.mem_membros m
      JOIN public.wifi_visitantes v
        ON v.membro_id = m.id AND v.deleted_at IS NULL
       AND v.cpf_norm ~ '^[0-9]{11}$'
       AND public.fn_identidade_nomes_compativeis(m.nome, v.nome)
      JOIN public.mem_membros dono
        ON dono.deleted_at IS NULL AND dono.id <> m.id
       AND regexp_replace(COALESCE(dono.cpf,''),'\D','','g') = v.cpf_norm
     WHERE m.deleted_at IS NULL AND m.cpf IS NULL
    ON CONFLICT (tipo, membro_id, membro_conflito_id) WHERE status = 'pendente' DO NOTHING;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 6) visitante automático · CPF DV-válido com ≥2 cultos distintos e sem membro
  WITH pessoas AS (
    SELECT v.cpf_norm,
           (array_agg(v.nome     ORDER BY v.data_acesso DESC NULLS LAST))[1] AS nome,
           (array_agg(v.email    ORDER BY v.data_acesso DESC NULLS LAST))[1] AS email,
           (array_agg(v.tel_norm ORDER BY v.data_acesso DESC NULLS LAST))[1] AS telefone
    FROM public.wifi_visitantes v
    JOIN public.wifi_conexoes cx
      ON cx.wifi_visitante_id = v.id AND cx.culto_id IS NOT NULL AND cx.deleted_at IS NULL
    WHERE v.deleted_at IS NULL AND v.membro_id IS NULL AND v.cpf_norm ~ '^[0-9]{11}$'
      AND public.fn_cpf_dv_valido(v.cpf_norm)
    GROUP BY v.cpf_norm
    HAVING count(DISTINCT cx.culto_id) >= 2
  ),
  novos AS (
    INSERT INTO public.mem_membros (cpf, nome, email, telefone, status, origem_cadastro, active)
    SELECT p.cpf_norm, COALESCE(p.nome,'Visitante WiFi'), NULLIF(p.email,''), p.telefone,
           'visitante', 'wifi', true
    FROM pessoas p
    WHERE NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.cpf = p.cpf_norm)
    RETURNING id, cpf
  )
  UPDATE public.wifi_visitantes v
     SET membro_id = n.id, match_tipo = 'auto_visitante', updated_at = now()
    FROM novos n WHERE v.cpf_norm = n.cpf AND v.membro_id IS NULL;
  GET DIAGNOSTICS v_criados = ROW_COUNT;

  -- 7) re-liga por CPF quem já tinha membro criado em execução anterior
  UPDATE public.wifi_visitantes v
     SET membro_id = m.id, match_tipo = COALESCE(v.match_tipo,'cpf'), updated_at = now()
    FROM public.mem_membros m
   WHERE v.membro_id IS NULL
     AND v.deleted_at IS NULL
     AND v.cpf_norm ~ '^[0-9]{11}$'
     AND m.deleted_at IS NULL
     AND regexp_replace(COALESCE(m.cpf,''),'\D','','g') = v.cpf_norm;

  RETURN jsonb_build_object(
    'vinculos_membro', v_vinc_membro,
    'visitantes_criados', v_criados,
    'membros_semeados_cpf', v_semeados
  );
END;
$$;

COMMENT ON FUNCTION public.fn_wifi_processar_vinculos() IS
  'Vincula wifi_visitantes a mem_membros. v2 (20260716170000): telefone exige NOME compatível (nunca telefone sozinho) · semeia mem_membros.cpf vazio a partir do CPF DV-válido do wifi quando o par é inequívoco · corrige vínculo morto/divergente · DV no auto-visitante.';

-- ----------------------------------------------------------------------------
-- 3. Backfill one-time (roda a v2 uma vez · os passos 4b e 5b fazem o
--    repoint dos divergentes e a semeadura inicial no próprio corpo)
-- ----------------------------------------------------------------------------
DO $$
DECLARE r jsonb;
BEGIN
  r := public.fn_wifi_processar_vinculos();
  RAISE NOTICE 'wifi identidade v2 · primeira execução: %', r::text;
END $$;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT fn_cpf_dv_valido('11111111111');            -- false
--   SELECT count(*) FROM wifi_visitantes v JOIN mem_membros l ON l.id=v.membro_id
--    WHERE l.deleted_at IS NOT NULL;                    -- deve tender a 0
--   SELECT count(*) FROM mem_membros WHERE cpf IS NOT NULL AND deleted_at IS NULL;
-- ============================================================================

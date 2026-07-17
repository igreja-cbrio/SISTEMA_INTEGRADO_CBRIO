-- ============================================================================
-- mem_contatos · contatos ACUMULADOS por pessoa (2026-07-17)
--
-- Decisão do Marcos: ninguém preenche "telefone secundário" em formulário —
-- quando a MESMA pessoa (provada por CPF ou pelo matcher canônico) usa um
-- contato DIFERENTE em portas diferentes (Kids com o telefone do trabalho,
-- batismo com o pessoal), o sistema ACUMULA em vez de perder. Efeitos:
--   1. Zero perda de dado: todo contato visto fica na ficha (fonte + data).
--   2. Menos duplicatas: o matcher passa a procurar candidatos também nos
--      contatos secundários — telefone pessoal × trabalho era a principal
--      fábrica de duplicatas que restava.
--   3. O contato PRINCIPAL (mem_membros.telefone/email) não muda sozinho:
--      fonte suja não sobrescreve dado bom · promoção é manual (ficha/censo).
--
-- A fusão (merge_membros v2 · 20260612120000) repointa FKs dinamicamente via
-- information_schema → os contatos do cadastro fundido migram sozinhos pro
-- sobrevivente (e valor repetido cai no UNIQUE → linha redundante é apagada).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_contatos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id      uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('telefone','email')),
  valor          text NOT NULL,   -- normalizado: telefone digits-only · e-mail lower/trim
  fonte          text,            -- porta que viu (kids · batismo · vol_ficha · decisao · wifi · backfill…)
  primeiro_visto timestamptz NOT NULL DEFAULT now(),
  ultimo_visto   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_contatos_valor
  ON public.mem_contatos (membro_id, tipo, valor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_contatos_lookup
  ON public.mem_contatos (tipo, valor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_contatos_membro
  ON public.mem_contatos (membro_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.mem_contatos IS
  'Contatos acumulados por pessoa: telefones/e-mails que a pessoa usou nas portas (Kids, batismo, voluntários, decisões, wifi…) além do principal do cadastro. Alimentada pelo funil de entrada (membroMatch/fn_registrar_contato) — nunca por formulário. O matcher busca candidatos aqui também (anti-duplicata). Principal não muda sozinho.';

-- ----------------------------------------------------------------------------
-- 2. Whitelist de soft-delete (+ mem_contatos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $function$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios',
    'kids_estoque','kpi_indicadores_taticos','kpi_metas','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','marketing_entregaveis','marketing_kanban_cards',
    'marketing_membros','mem_contribuicoes','mem_devocionais','mem_familias',
    'mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios',
    'mem_vinculos_familiares','next_matriculas','next_turmas','nsm_eventos',
    'pcs_progressoes','projects','rh_documentos','rh_funcionarios','solicitacoes',
    'usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes','log_compras',
    'fin_contas_pagar','cui_primeiro_contato_fila','cui_batismo_next_fila',
    'governance_meetings','governance_meeting_docs','governance_memoria',
    'apresentacao_criancas','ext_eventos','ext_inscricoes',
    'vol_email_disparos','vol_email_disparo_destinatarios',
    'nps_pesquisas','mem_contatos'
  ]::TEXT[]
$function$;

-- ----------------------------------------------------------------------------
-- 3. RLS (padrão mem_membros: próprio OR módulos de pessoas · write backend)
-- ----------------------------------------------------------------------------
ALTER TABLE public.mem_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mem_contatos_select ON public.mem_contatos;
CREATE POLICY mem_contatos_select ON public.mem_contatos
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.is_super_admin()
    OR public.current_user_module_level('membresia')  >= 1
    OR public.current_user_module_level('integracao') >= 1
    OR public.current_user_module_level('cuidados')   >= 1
  );

DROP POLICY IF EXISTS mem_contatos_insert ON public.mem_contatos;
CREATE POLICY mem_contatos_insert ON public.mem_contatos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.current_user_module_level('membresia') >= 3
  );

DROP POLICY IF EXISTS mem_contatos_update ON public.mem_contatos;
CREATE POLICY mem_contatos_update ON public.mem_contatos
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.current_user_module_level('membresia') >= 3)
  WITH CHECK (public.is_super_admin() OR public.current_user_module_level('membresia') >= 3);

DROP POLICY IF EXISTS mem_contatos_delete ON public.mem_contatos;
CREATE POLICY mem_contatos_delete ON public.mem_contatos
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS mem_contatos_service ON public.mem_contatos;
CREATE POLICY mem_contatos_service ON public.mem_contatos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. fn_registrar_contato · o registrador único (best-effort: NUNCA derruba a
--    porta que o chamou). Só grava o que DIFERE do principal do cadastro.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_registrar_contato(
  p_membro_id uuid,
  p_telefone text,
  p_email text,
  p_fonte text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tel text;
  v_email text;
  v_tel_princ text;
  v_email_princ text;
BEGIN
  IF p_membro_id IS NULL THEN RETURN; END IF;
  v_tel := nullif(regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'), '');
  v_email := nullif(lower(trim(coalesce(p_email,''))), '');
  IF v_tel IS NOT NULL AND length(v_tel) < 10 THEN v_tel := NULL; END IF;
  IF v_email IS NOT NULL AND position('@' in v_email) = 0 THEN v_email := NULL; END IF;
  IF v_tel IS NULL AND v_email IS NULL THEN RETURN; END IF;

  SELECT nullif(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), ''),
         nullif(lower(trim(coalesce(email,''))), '')
    INTO v_tel_princ, v_email_princ
    FROM public.mem_membros WHERE id = p_membro_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_tel IS NOT NULL AND v_tel IS DISTINCT FROM v_tel_princ THEN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    VALUES (p_membro_id, 'telefone', v_tel, p_fonte)
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL
    DO UPDATE SET ultimo_visto = now();
  END IF;
  IF v_email IS NOT NULL AND v_email IS DISTINCT FROM v_email_princ THEN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    VALUES (p_membro_id, 'email', v_email, p_fonte)
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL
    DO UPDATE SET ultimo_visto = now();
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- enriquecimento é best-effort: não pode derrubar a porta que chamou
  RAISE WARNING 'fn_registrar_contato: contato não registrado (%)', SQLERRM;
END $$;

COMMENT ON FUNCTION public.fn_registrar_contato(uuid, text, text, text) IS
  'Registra em mem_contatos o telefone/e-mail que uma porta viu, quando difere do principal do cadastro. Best-effort (warning, nunca erro). Chamada pelos matchers SQL e pelo backend (membroMatch).';

-- ----------------------------------------------------------------------------
-- 5. Matchers SQL passam a registrar o contato divergente ao LIGAR em membro
--    existente (recriações das versões da 20260716160000 · só o acréscimo)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_resolve_membro()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_membro_id uuid;
  v_cpf_limpo text;
  v_tel_limpo text;
  v_criado boolean := false;
BEGIN
  -- Normaliza CPF (so digitos)
  IF NEW.cpf IS NOT NULL THEN
    v_cpf_limpo := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF length(v_cpf_limpo) = 11 THEN
      NEW.cpf := v_cpf_limpo;
    ELSE
      NEW.cpf := NULL;
    END IF;
  END IF;

  -- Normaliza CPF do responsavel (so digitos)
  IF NEW.responsavel_cpf IS NOT NULL THEN
    v_cpf_limpo := regexp_replace(NEW.responsavel_cpf, '\D', '', 'g');
    IF length(v_cpf_limpo) = 11 THEN
      NEW.responsavel_cpf := v_cpf_limpo;
    ELSE
      NEW.responsavel_cpf := NULL;
    END IF;
  END IF;

  -- KIDS: NÃO cria mem_membros automaticamente (LGPD com menores).
  IF NEW.tipo_decisao = 'kids' THEN
    NEW.membro_id := NULL;
    RETURN NEW;
  END IF;

  -- Se já veio com membro_id explícito (via UI de busca), respeita
  IF NEW.membro_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) CPF exato (só cadastros vivos · o índice UNIQUE é parcial em vivos)
  IF NEW.cpf IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = NEW.cpf
       AND deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- 2) E-mail + NOME compatível (e-mail da família compartilhado não pode
  --    ligar sozinho · política membroMatch)
  IF v_membro_id IS NULL AND NEW.email IS NOT NULL AND length(NEW.email) > 3 THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE lower(email) = lower(NEW.email)
       AND deleted_at IS NULL
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 3) Telefone + NOME compatível (branch NOVO · a decisão típica traz só
  --    nome+telefone — sem este branch, quem já existia virava stub duplicado)
  v_tel_limpo := NULLIF(regexp_replace(COALESCE(NEW.telefone, ''), '\D', '', 'g'), '');
  IF v_membro_id IS NULL AND v_tel_limpo IS NOT NULL AND length(v_tel_limpo) >= 10 THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE deleted_at IS NULL
       AND regexp_replace(COALESCE(telefone, ''), '\D', '', 'g') = v_tel_limpo
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 4) Nome compatível + data_nascimento (criterio estavel)
  IF v_membro_id IS NULL AND NEW.data_nascimento IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE data_nascimento = NEW.data_nascimento
       AND deleted_at IS NULL
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 5) Cria membro novo (status visitante) com os dados disponíveis.
  --    Corrida 23505 no CPF (dois fluxos com o mesmo CPF novo) religa no
  --    vencedor em vez de estourar o INSERT da decisão.
  IF v_membro_id IS NULL THEN
    BEGIN
      INSERT INTO public.mem_membros (
        nome, email, telefone, cpf, data_nascimento, status
      ) VALUES (
        NEW.nome,
        NEW.email,
        NEW.telefone,
        NEW.cpf,
        NEW.data_nascimento,
        'visitante'
      ) RETURNING id INTO v_membro_id;
      v_criado := true;
    EXCEPTION WHEN unique_violation THEN
      IF NEW.cpf IS NOT NULL THEN
        SELECT id INTO v_membro_id
          FROM public.mem_membros
         WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = NEW.cpf
           AND deleted_at IS NULL
         LIMIT 1;
      END IF;
      IF v_membro_id IS NULL THEN
        RAISE;
      END IF;
    END;
  END IF;

  -- Contato divergente ACUMULA no cadastro (mem_contatos · nunca sobrescreve
  -- o principal). Só quando ligou em membro EXISTENTE — no criado, o contato
  -- da decisão JÁ é o principal.
  IF NOT v_criado THEN
    PERFORM public.fn_registrar_contato(v_membro_id, NEW.telefone, NEW.email, 'decisao');
  END IF;

  NEW.membro_id := v_membro_id;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_cultos_dec_pessoas_resolve_membro() IS
  'Resolve/cria mem_membros pra decisão de culto. Política canônica do membroMatch (20260716160000): CPF → e-mail+NOME → telefone+NOME → nascimento+NOME · nunca sinal fraco sozinho · corrida 23505 religa. Desde 20260717120000 registra contato divergente em mem_contatos ao ligar em membro existente. Kids fora (LGPD).';

CREATE OR REPLACE FUNCTION public.fn_link_or_create_membro(
  p_cpf text,
  p_telefone text,
  p_email text,
  p_nome text,
  p_status_inicial text DEFAULT 'visitante',
  p_fonte text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_membro_id uuid;
  v_cpf text;
  v_tel text;
  v_email text;
BEGIN
  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  -- 1) CPF exato (só vivos · normalizado dos dois lados)
  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
       AND active = true AND deleted_at IS NULL
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 2) Telefone + NOME compatível (antes ligava por telefone SOZINHO —
  --    família compartilha o número · política membroMatch). Sem nome, não
  --    liga por telefone.
  IF v_tel IS NOT NULL AND length(v_tel) >= 10 AND p_nome IS NOT NULL AND trim(p_nome) <> '' THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_tel
       AND public.fn_identidade_nomes_compativeis(nome, p_nome)
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 3) E-mail + NOME compatível quando há nome (sem nome, mantém o legado
  --    e-mail sozinho · mesmo contrato do membroMatch)
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND lower(trim(email)) = v_email
       AND (p_nome IS NULL OR trim(p_nome) = '' OR public.fn_identidade_nomes_compativeis(nome, p_nome))
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.mem_membros (nome, cpf, telefone, email, status, active, created_at, updated_at)
    VALUES (
      trim(p_nome),
      v_cpf,
      nullif(p_telefone, ''),
      v_email,
      coalesce(p_status_inicial, 'visitante'),
      true,
      now(),
      now()
    )
    RETURNING id INTO v_membro_id;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida no CPF: religa no vencedor
    IF v_cpf IS NOT NULL THEN
      SELECT id INTO v_membro_id FROM public.mem_membros
       WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
         AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_membro_id IS NULL THEN RAISE; END IF;
    PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
    RETURN v_membro_id;
  END;

  -- Rastro de auditoria: mem_historico só tem `descricao` (NOT NULL) — não
  -- existem colunas acao/observacao (o insert antigo falhava 100% das vezes e
  -- o EXCEPTION WHEN OTHERS engolia · nenhum criado_auto ficava rastreável).
  -- O handler agora é específico e AVISA em vez de falhar mudo.
  BEGIN
    INSERT INTO public.mem_historico (membro_id, descricao, created_at)
    VALUES (
      v_membro_id,
      '[criado_auto] Criado automaticamente via ' || coalesce(p_fonte, 'fluxo'),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_link_or_create_membro: rastro criado_auto não gravado (%)', SQLERRM;
  END;

  RETURN v_membro_id;
END;
$$;

COMMENT ON FUNCTION public.fn_link_or_create_membro(text, text, text, text, text, text) IS
  'Link-ou-cria mem_membros. Política do membroMatch (20260716160000): CPF → telefone+NOME → e-mail(+NOME quando há nome) · nunca telefone sozinho · só cadastros vivos · corrida 23505 religa. Desde 20260717120000 registra contato divergente em mem_contatos ao ligar em membro existente.';

-- ----------------------------------------------------------------------------
-- 6. Wifi · coleta contínua dos contatos das linhas vinculadas (chamada pelo
--    wifiSync após fn_wifi_processar_vinculos · e uma vez aqui como backfill)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_wifi_coletar_contatos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_parcial integer := 0;
BEGIN
  -- telefones do portal que diferem do principal do membro vinculado
  INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
  SELECT DISTINCT v.membro_id, 'telefone', v.tel_norm, 'wifi'
    FROM public.wifi_visitantes v
    JOIN public.mem_membros m ON m.id = v.membro_id AND m.deleted_at IS NULL
   WHERE v.deleted_at IS NULL
     AND v.tel_norm ~ '^[0-9]{10,11}$'
     AND regexp_replace(coalesce(m.telefone,''), '\D', '', 'g') <> v.tel_norm
  ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
  GET DIAGNOSTICS v_parcial = ROW_COUNT;
  v_count := v_count + v_parcial;

  -- e-mails do portal que diferem do principal
  INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
  SELECT DISTINCT v.membro_id, 'email', lower(trim(v.email)), 'wifi'
    FROM public.wifi_visitantes v
    JOIN public.mem_membros m ON m.id = v.membro_id AND m.deleted_at IS NULL
   WHERE v.deleted_at IS NULL
     AND coalesce(v.email,'') <> ''
     AND position('@' in v.email) > 0
     AND lower(trim(coalesce(m.email,''))) <> lower(trim(v.email))
  ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
  GET DIAGNOSTICS v_parcial = ROW_COUNT;
  v_count := v_count + v_parcial;

  RETURN v_count;
END $$;

COMMENT ON FUNCTION public.fn_wifi_coletar_contatos() IS
  'Acumula em mem_contatos os telefones/e-mails do portal cativo que diferem do principal do membro vinculado. Chamada pelo wifiSync após fn_wifi_processar_vinculos.';

-- ----------------------------------------------------------------------------
-- 7. Backfill one-time · contatos que já estão nas linhas-satélite vinculadas
--    (guardado por tabela: ausência de tabela/coluna não aborta a migration)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_total integer := 0;
  v_parcial integer := 0;
BEGIN
  -- batismo_inscricoes
  BEGIN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'telefone', regexp_replace(b.telefone, '\D', '', 'g'), 'backfill_batismo'
      FROM public.batismo_inscricoes b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.telefone,'') <> ''
       AND length(regexp_replace(b.telefone, '\D', '', 'g')) >= 10
       AND regexp_replace(coalesce(m.telefone,''), '\D', '', 'g') <> regexp_replace(b.telefone, '\D', '', 'g')
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;

    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'email', lower(trim(b.email)), 'backfill_batismo'
      FROM public.batismo_inscricoes b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.email,'') <> '' AND position('@' in b.email) > 0
       AND lower(trim(coalesce(m.email,''))) <> lower(trim(b.email))
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- vol_inscricoes
  BEGIN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'telefone', regexp_replace(b.telefone, '\D', '', 'g'), 'backfill_vol'
      FROM public.vol_inscricoes b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE coalesce(b.telefone,'') <> ''
       AND length(regexp_replace(b.telefone, '\D', '', 'g')) >= 10
       AND regexp_replace(coalesce(m.telefone,''), '\D', '', 'g') <> regexp_replace(b.telefone, '\D', '', 'g')
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;

    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'email', lower(trim(b.email)), 'backfill_vol'
      FROM public.vol_inscricoes b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE coalesce(b.email,'') <> '' AND position('@' in b.email) > 0
       AND lower(trim(coalesce(m.email,''))) <> lower(trim(b.email))
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- next_matriculas
  BEGIN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'telefone', regexp_replace(b.telefone, '\D', '', 'g'), 'backfill_next'
      FROM public.next_matriculas b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.telefone,'') <> ''
       AND length(regexp_replace(b.telefone, '\D', '', 'g')) >= 10
       AND regexp_replace(coalesce(m.telefone,''), '\D', '', 'g') <> regexp_replace(b.telefone, '\D', '', 'g')
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;

    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'email', lower(trim(b.email)), 'backfill_next'
      FROM public.next_matriculas b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.email,'') <> '' AND position('@' in b.email) > 0
       AND lower(trim(coalesce(m.email,''))) <> lower(trim(b.email))
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- cultos_decisoes_pessoas
  BEGIN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'telefone', regexp_replace(b.telefone, '\D', '', 'g'), 'backfill_decisao'
      FROM public.cultos_decisoes_pessoas b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.telefone,'') <> ''
       AND length(regexp_replace(b.telefone, '\D', '', 'g')) >= 10
       AND regexp_replace(coalesce(m.telefone,''), '\D', '', 'g') <> regexp_replace(b.telefone, '\D', '', 'g')
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;

    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membro_id, 'email', lower(trim(b.email)), 'backfill_decisao'
      FROM public.cultos_decisoes_pessoas b
      JOIN public.mem_membros m ON m.id = b.membro_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.email,'') <> '' AND position('@' in b.email) > 0
       AND lower(trim(coalesce(m.email,''))) <> lower(trim(b.email))
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- int_visitantes (vínculo é membresia_id)
  BEGIN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membresia_id, 'telefone', regexp_replace(b.telefone, '\D', '', 'g'), 'backfill_visitante'
      FROM public.int_visitantes b
      JOIN public.mem_membros m ON m.id = b.membresia_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.telefone,'') <> ''
       AND length(regexp_replace(b.telefone, '\D', '', 'g')) >= 10
       AND regexp_replace(coalesce(m.telefone,''), '\D', '', 'g') <> regexp_replace(b.telefone, '\D', '', 'g')
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;

    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    SELECT DISTINCT b.membresia_id, 'email', lower(trim(b.email)), 'backfill_visitante'
      FROM public.int_visitantes b
      JOIN public.mem_membros m ON m.id = b.membresia_id AND m.deleted_at IS NULL
     WHERE b.deleted_at IS NULL AND coalesce(b.email,'') <> '' AND position('@' in b.email) > 0
       AND lower(trim(coalesce(m.email,''))) <> lower(trim(b.email))
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL DO NOTHING;
    GET DIAGNOSTICS v_parcial = ROW_COUNT; v_total := v_total + v_parcial;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- wifi (a mesma função que o cron vai chamar)
  v_total := v_total + public.fn_wifi_coletar_contatos();

  RAISE NOTICE 'mem_contatos · backfill inicial: % contatos acumulados', v_total;
END $$;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT tipo, fonte, count(*) FROM mem_contatos GROUP BY 1,2 ORDER BY 3 DESC;
--   SELECT count(DISTINCT membro_id) FROM mem_contatos;  -- pessoas com contato extra
-- ============================================================================

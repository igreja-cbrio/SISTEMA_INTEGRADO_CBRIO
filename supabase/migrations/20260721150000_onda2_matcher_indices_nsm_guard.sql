-- ============================================================================
-- Onda 2 da auditoria de performance (2026-07-21) · matcher + NSM
--
-- Idempotente e backwards-compatible (mesmos resultados, só mais barato).
-- Três frentes:
--
-- 1. fn_link_or_create_membro NÃO consegue usar o índice único de CPF criado
--    em 20260715120000: o índice é sobre regexp_replace(cpf, ...) e a função
--    filtra por regexp_replace(coalesce(cpf, ''), ...) — pro planner,
--    expressão diferente = índice ignorado → seq scan em TODA decisão/cadastro
--    com CPF. Fix: tirar o coalesce do predicado (CPF nulo nunca é igual aos
--    dígitos buscados — semântica idêntica) e explicitar cpf IS NOT NULL pra
--    casar com o predicado parcial do índice. Hoje (~3,7k membros) custa
--    milissegundos; a correção é pela trajetória (50k) + rajada de domingo.
--
-- 2. Telefone e e-mail não tinham índice NENHUM — os ramos 2 e 3 do matcher
--    varriam a tabela. Índices funcionais com a MESMA expressão da função
--    (lição do item 1). + batismo_inscricoes(membro_id) pros EXISTS da NSM.
--
-- 3. recalcular_nsm() (pesado: engajamento real por convertido) dispara em
--    CASCATA a cada decisão: o INSERT em cui_convertidos e em nsm_eventos
--    (ambos vindos de triggers · depth >= 2) recalculava a NSM 2x+ por
--    decisão na rajada de domingo. Guarda pg_trigger_depth() > 1: escrita
--    vinda de dentro de cascata NÃO recalcula inline — quem cobre é o
--    trigger de cultos (depth 0 · quando a Integração lança os números),
--    o cron horário da NSM e o recálculo manual. Escrita DIRETA (serviço,
--    backfill, importador · depth 1) segue recalculando na hora.
--    Comportamento do card já documentado no CLAUDE.md: sinais refletem no
--    cron horário — a guarda alinha o custo a isso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1+2. Índices funcionais do matcher (expressão IGUAL à da função)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mem_membros_telefone_digits
  ON public.mem_membros ((regexp_replace(telefone, '\D', '', 'g')))
  WHERE telefone IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_mem_membros_telefone_digits IS
  'Ramo telefone+nome do matcher canônico (fn_link_or_create_membro / membroMatch). Expressão precisa ser idêntica à do predicado da função — regexp_replace SEM coalesce (Onda 2 · 2026-07-21).';

CREATE INDEX IF NOT EXISTS idx_mem_membros_email_lower
  ON public.mem_membros ((lower(trim(email))))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.idx_mem_membros_email_lower IS
  'Ramo e-mail(+nome) do matcher canônico. Mesma expressão lower(trim(email)) da função (Onda 2 · 2026-07-21).';

CREATE INDEX IF NOT EXISTS idx_batismo_inscricoes_membro
  ON public.batismo_inscricoes (membro_id)
  WHERE membro_id IS NOT NULL;

COMMENT ON INDEX public.idx_batismo_inscricoes_membro IS
  'EXISTS por membro nos cálculos de engajamento da NSM (fn_nsm_valores_engajados) e coortes batismo-90d (Onda 2 · 2026-07-21).';

-- ----------------------------------------------------------------------------
-- 1. fn_link_or_create_membro · predicados compatíveis com os índices.
--    Base = 20260717150000 (versão viva); MUDAM SÓ os predicados dos ramos
--    1 (CPF), 2 (telefone), 3 (e-mail) e do handler de corrida — coluna crua
--    (sem coalesce) + IS NOT NULL explícito pro índice parcial casar.
--    A normalização dos PARÂMETROS (coalesce(p_cpf, '') etc.) fica como está.
-- ----------------------------------------------------------------------------
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

  -- 1) CPF exato (só vivos · normalizado dos dois lados · usa o índice único
  --    uniq_mem_membros_cpf_ativo: expressão sem coalesce + cpf IS NOT NULL)
  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE cpf IS NOT NULL
       AND regexp_replace(cpf, '\D', '', 'g') = v_cpf
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
       AND telefone IS NOT NULL
       AND regexp_replace(telefone, '\D', '', 'g') = v_tel
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
       AND email IS NOT NULL
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
       WHERE cpf IS NOT NULL
         AND regexp_replace(cpf, '\D', '', 'g') = v_cpf
         AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_membro_id IS NULL THEN RAISE; END IF;
    PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
    RETURN v_membro_id;
  END;

  -- Rastro de auditoria: o schema VIVO exige `tipo` (NOT NULL + CHECK que
  -- aceita 'outro'). Handler específico AVISA em vez de falhar mudo.
  BEGIN
    INSERT INTO public.mem_historico (membro_id, tipo, descricao, created_at)
    VALUES (
      v_membro_id,
      'outro',
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
  'Link-ou-cria mem_membros. Política do membroMatch (20260716160000): CPF → telefone+NOME → e-mail(+NOME quando há nome) · nunca telefone sozinho · só cadastros vivos · corrida 23505 religa. Registra contato divergente em mem_contatos (20260717120000) e rastro criado_auto com tipo ''outro'' (20260717150000). Predicados sem coalesce + IS NOT NULL explícito pra usar os índices funcionais (Onda 2 · 20260721150000).';

-- ----------------------------------------------------------------------------
-- 3. Guarda de profundidade nos recálculos da NSM disparados por cascata.
--    Só recria as FUNÇÕES — os triggers existentes (tg_nsm_eventos_auto_recalc
--    em nsm_eventos · tg_cui_convertidos_recalc_nsm em cui_convertidos)
--    continuam apontando pra elas. O trigger de cultos (cultos_recalcular_nsm)
--    já tinha WHEN (pg_trigger_depth() = 0) e não muda.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_eventos_recalc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Escrita vinda de DENTRO de cascata de triggers (decisão → convertido →
  -- trilha → nsm_eventos · depth > 1) não recalcula inline: cobre o trigger
  -- de cultos (depth 0), o cron horário e o recálculo manual. Escrita direta
  -- (serviço/backfill · depth 1) recalcula na hora, 1x por statement.
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public.recalcular_nsm();
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_trigger_recalcular_nsm()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Mesma guarda do tg_nsm_eventos_recalc (cui_convertidos é populada por
  -- trigger a cada decisão adulta — recalcular aqui dobrava o custo).
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  PERFORM public.recalcular_nsm();
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.tg_nsm_eventos_recalc() IS
  'Recalcula nsm_estado após mudança DIRETA em nsm_eventos (statement-level). Guarda pg_trigger_depth() > 1: cascata de decisão não recalcula inline (cobre trigger de cultos + cron horário) — Onda 2 · 20260721150000.';

COMMENT ON FUNCTION public.fn_trigger_recalcular_nsm() IS
  'Recalcula nsm_estado após mudança DIRETA em cui_convertidos (statement-level). Guarda pg_trigger_depth() > 1 — Onda 2 · 20260721150000.';

-- ----------------------------------------------------------------------------
-- Conferência (colar depois de aplicar):
--
--   -- os 3 índices novos + o único de CPF devem aparecer:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename IN ('mem_membros', 'batismo_inscricoes')
--      AND indexname IN ('uniq_mem_membros_cpf_ativo',
--                        'idx_mem_membros_telefone_digits',
--                        'idx_mem_membros_email_lower',
--                        'idx_batismo_inscricoes_membro');
--
--   -- o ramo de CPF deve usar Index Scan (não Seq Scan):
--   EXPLAIN SELECT id FROM mem_membros
--    WHERE cpf IS NOT NULL
--      AND regexp_replace(cpf, '\D', '', 'g') = '00000000000'
--      AND active = true AND deleted_at IS NULL LIMIT 1;
-- ============================================================================

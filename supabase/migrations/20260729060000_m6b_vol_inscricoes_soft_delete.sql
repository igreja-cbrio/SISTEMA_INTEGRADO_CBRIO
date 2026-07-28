-- ============================================================================
-- M6b · vol_inscricoes entra na whitelist de soft-delete (F1 §4.6 · 2ª etapa)
--
-- A M6a (20260728210000) criou deleted_at + pôs TODOS os leitores JS filtrando.
-- Esta etapa fecha o que faltava pra soft-delete ser seguro:
--   1. whitelist app_soft_deletable_tables() += vol_inscricoes
--   2. contadores/dedup SQL passam a ignorar linha soft-deletada — patch
--      DINÂMICO na definição VIVA (pg_get_functiondef + regexp_replace, mesma
--      técnica da 20260722250000), imune a drift git↔prod:
--      · _kpi_agregar_dado: ramos solicitacoes_servir_recebidas/alocadas
--      · fn_app_inscricoes_fanout: dedup do fluxo de voluntariado do app
--
-- Idempotente (re-rodar detecta o patch aplicado e pula). Falha ALTO se a
-- definição viva não tiver o texto esperado (nunca aplica silenciosamente errado).
-- ============================================================================
SET lock_timeout = '10s';

-- ── 1. whitelist (padrão array_append · NUNCA `arr || 'literal'` — lição 22P02) ──
DO $$
DECLARE atual TEXT[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO atual;
  IF NOT ('vol_inscricoes' = ANY(atual)) THEN
    atual := array_append(atual, 'vol_inscricoes'::text);
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
      atual
    );
    RAISE NOTICE 'whitelist: vol_inscricoes adicionada';
  ELSE
    RAISE NOTICE 'whitelist: vol_inscricoes já estava';
  END IF;
END $$;

-- ── 2. _kpi_agregar_dado · ramos solicitacoes_servir_* ignoram soft-deletadas ──
DO $$
DECLARE src TEXT; novo TEXT;
BEGIN
  src := pg_get_functiondef('public._kpi_agregar_dado(text,text,date,date)'::regprocedure);
  IF src LIKE '%WHERE deleted_at IS NULL AND data_inscricao%' THEN
    RAISE NOTICE '_kpi_agregar_dado: patch já aplicado';
    RETURN;
  END IF;
  IF src NOT LIKE '%FROM public.vol_inscricoes%' THEN
    RAISE EXCEPTION '_kpi_agregar_dado vivo não lê vol_inscricoes — revisar antes de aplicar';
  END IF;
  novo := regexp_replace(
    src,
    'FROM public\.vol_inscricoes(\s+)WHERE data_inscricao',
    'FROM public.vol_inscricoes\1WHERE deleted_at IS NULL AND data_inscricao',
    'g'
  );
  -- os DOIS ramos (recebidas + alocadas) precisam ter sido atingidos
  IF (length(novo) - length(replace(novo, 'WHERE deleted_at IS NULL AND data_inscricao', ''))) / length('WHERE deleted_at IS NULL AND data_inscricao') <> 2 THEN
    RAISE EXCEPTION '_kpi_agregar_dado: esperava exatamente 2 ocorrências do patch (recebidas+alocadas) — texto vivo mudou, revisar';
  END IF;
  EXECUTE novo;
  RAISE NOTICE '_kpi_agregar_dado: solicitacoes_servir_* agora filtram deleted_at';
END $$;

-- ── 3. fn_app_inscricoes_fanout · dedup de voluntariado ignora soft-deletadas ──
-- (inscrição excluída não pode bloquear a pessoa de se inscrever de novo pelo app)
DO $$
DECLARE src TEXT; novo TEXT;
BEGIN
  src := pg_get_functiondef('public.fn_app_inscricoes_fanout()'::regprocedure);
  IF src LIKE '%vi.deleted_at IS NULL%' THEN
    RAISE NOTICE 'fn_app_inscricoes_fanout: patch já aplicado';
    RETURN;
  END IF;
  IF src NOT LIKE '%FROM public.vol_inscricoes vi%' THEN
    RAISE EXCEPTION 'fn_app_inscricoes_fanout vivo não tem o dedup esperado em vol_inscricoes — revisar antes de aplicar';
  END IF;
  novo := regexp_replace(
    src,
    'FROM public\.vol_inscricoes vi(\s+)WHERE vi\.status',
    'FROM public.vol_inscricoes vi\1WHERE vi.deleted_at IS NULL AND vi.status',
    'g'
  );
  IF novo NOT LIKE '%vi.deleted_at IS NULL AND vi.status%' THEN
    RAISE EXCEPTION 'fn_app_inscricoes_fanout: replace não casou — texto vivo mudou, revisar';
  END IF;
  EXECUTE novo;
  RAISE NOTICE 'fn_app_inscricoes_fanout: dedup agora filtra deleted_at';
END $$;

COMMENT ON COLUMN public.vol_inscricoes.deleted_at IS
  'Soft-delete habilitado na M6b (20260729060000): whitelist + leitores JS (M6a) + contadores SQL filtrando. Excluir SEMPRE via app_soft_delete.';

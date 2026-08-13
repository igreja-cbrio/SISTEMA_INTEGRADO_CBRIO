-- ============================================================================
-- 20260813120000 · régua do voluntariado aprende 'Domingo 09%' (Lote 2 · F1)
-- ============================================================================
-- Mudança dos cultos de DOMINGO (corte 24/08/2026 · docs/cultos-domingo/ na
-- branch claude/cultos-domingo-handoff). A régua dos dashboards de voluntariado
-- classifica check-in por PREFIXO DO NOME do culto ('Domingo 08%' / 'Domingo
-- 10%' / 'Domingo 11%'…) e DESCARTA culto desconhecido — sem 'Domingo 09%',
-- todo check-in do culto novo sumiria dos dashboards SEM erro, SEM log e SEM
-- zero visível (achado nº 1 da varredura de 11/08). Por isso esta migration
-- vai ao ar ANTES de o tipo "Domingo 09:30" existir.
--
-- ⚠️ APLICAR ANTES DE 24/08/2026 (antes de o tipo nascer no script do corte).
--
-- PATCH DINÂMICO (técnica da casa · 20260722250000/20260729060000/20260806160000):
-- lê a definição VIVA via pg_get_functiondef/pg_get_viewdef e acrescenta
-- «OR <ident> ~~* 'Domingo 09%'» logo após CADA comparação com 'Domingo 08%'.
-- NUNCA colar aqui um corpo estático do repo: CREATE OR REPLACE a partir de
-- arquivo reverteria patch aplicado só em produção (drift real neste conjunto).
--
-- 100% INVISÍVEL até o corte: 'Domingo 09%' não casa com nenhum culto enquanto
-- o tipo não existir. Idempotente: definição que já contém 'Domingo 09' é
-- pulada com NOTICE. Aborta (rollback total) se a forma viva divergir do
-- esperado — nunca aplicar às cegas.
--
-- ⚠️ O que esta migration NÃO faz, de propósito (fica pro script do corte,
-- Lote 5): mudar o anchor do bloco 'Domingo Manhã' (recurrence_time
-- '08:30:00' → '09:30:00' no VALUES da view) — isso mexe em ordenação/rótulo
-- visível nos dashboards e violaria a regra "nada fica à vista até 24/08".
-- ============================================================================

DO $mig$
DECLARE
  -- identificador (pode ser qualificado: p_nome, s.service_type_name) + ~~* + literal.
  -- (::text)? tolera o cast que o deparse do pg_get_viewdef acrescenta.
  v_regex  constant text := '([A-Za-z_][A-Za-z0-9_."]*)\s*~~\*\s*''Domingo 08%''(::text)?';
  v_troca  constant text := '\1 ~~* ''Domingo 08%''\2 OR \1 ~~* ''Domingo 09%''\2';
  v_fn     text;
  v_oid    oid;
  v_def    text;
  v_codigo text;
  v_novo   text;
  v_antes  int;
  v_depois int;
  v_achou  boolean;
BEGIN
  ---------------------------------------------------------------------------
  -- 1 · FUNÇÕES (todas as overloads de cada nome, pelo catálogo)
  --     · fn_dash_vol_service_no_bloco  = o GATE (lista própria OBRIGATÓRIA)
  --     · composicao/resumo/pessoas     = podem ter lista própria (versões
  --       antigas) ou delegar ao gate (versões novas) — o vivo decide.
  ---------------------------------------------------------------------------
  FOREACH v_fn IN ARRAY ARRAY[
    'fn_dash_vol_service_no_bloco',
    'fn_dashboard_voluntariado_composicao',
    'fn_dashboard_voluntariado_resumo',
    'fn_dashboard_voluntariado_pessoas'
  ] LOOP
    v_achou := false;

    FOR v_oid IN
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
    LOOP
      v_achou := true;
      v_def   := pg_get_functiondef(v_oid);
      -- checagem por texto IGNORA comentário (régua 2026-08-06: pg_get_functiondef
      -- devolve o corpo COM comentários, e explicação em comentário não é código)
      v_codigo := regexp_replace(v_def, '--[^\n]*', '', 'g');

      IF position('Domingo 09' in v_codigo) > 0 THEN
        RAISE NOTICE '[0930] %: já contém ''Domingo 09'' — nada a fazer (idempotente)', v_fn;
        CONTINUE;
      END IF;

      IF position('Domingo 08' in v_codigo) = 0 THEN
        IF v_fn = 'fn_dash_vol_service_no_bloco' THEN
          RAISE EXCEPTION '[0930] %: a lista ''Domingo 08%%'' não está na definição viva — a régua mudou de forma; investigar antes de aplicar', v_fn;
        END IF;
        RAISE NOTICE '[0930] %: sem lista própria (delega ao gate) — ok', v_fn;
        CONTINUE;
      END IF;

      SELECT count(*) INTO v_antes FROM regexp_matches(v_def, v_regex, 'g');
      v_novo := regexp_replace(v_def, v_regex, v_troca, 'g');

      IF v_antes = 0 OR v_novo = v_def THEN
        RAISE EXCEPTION '[0930] %: contém ''Domingo 08'' mas o regex não casou — a forma da comparação mudou; ajustar o patch, nunca aplicar às cegas', v_fn;
      END IF;

      EXECUTE v_novo;  -- pg_get_functiondef devolve o CREATE OR REPLACE completo (mesmo oid, grants preservados)

      -- verificação pós-patch: reler o VIVO, não confiar no EXECUTE
      v_def := pg_get_functiondef(v_oid);
      SELECT count(*) INTO v_depois FROM regexp_matches(v_def, '~~\*\s*''Domingo 09%''', 'g');
      IF v_depois < v_antes THEN
        RAISE EXCEPTION '[0930] %: patch executado mas a releitura achou % ocorrência(s) de ''Domingo 09%%'' (esperado >= %)', v_fn, v_depois, v_antes;
      END IF;
      RAISE NOTICE '[0930] %: % comparação(ões) com ''Domingo 08%%'' ganharam o OR de ''Domingo 09%%''', v_fn, v_antes;
    END LOOP;

    IF NOT v_achou THEN
      IF v_fn = 'fn_dash_vol_service_no_bloco' THEN
        RAISE EXCEPTION '[0930] % não existe neste banco — o gate da régua é obrigatório', v_fn;
      END IF;
      RAISE NOTICE '[0930] %: não existe neste banco — nada a fazer', v_fn;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 2 · VIEW vw_dashboard_voluntariado (CASE de blocos com lista própria)
  ---------------------------------------------------------------------------
  IF to_regclass('public.vw_dashboard_voluntariado') IS NULL THEN
    RAISE EXCEPTION '[0930] vw_dashboard_voluntariado não existe neste banco';
  END IF;

  v_def    := pg_get_viewdef('public.vw_dashboard_voluntariado'::regclass, true);
  v_codigo := regexp_replace(v_def, '--[^\n]*', '', 'g');

  IF position('Domingo 09' in v_codigo) > 0 THEN
    RAISE NOTICE '[0930] vw_dashboard_voluntariado: já contém ''Domingo 09'' — nada a fazer (idempotente)';
  ELSE
    IF position('Domingo 08' in v_codigo) = 0 THEN
      RAISE EXCEPTION '[0930] vw_dashboard_voluntariado: o CASE com ''Domingo 08%%'' não está na definição viva — investigar antes de aplicar';
    END IF;

    SELECT count(*) INTO v_antes FROM regexp_matches(v_def, v_regex, 'g');
    v_novo := regexp_replace(v_def, v_regex, v_troca, 'g');

    IF v_antes = 0 OR v_novo = v_def THEN
      RAISE EXCEPTION '[0930] vw_dashboard_voluntariado: contém ''Domingo 08'' mas o regex não casou — a forma mudou; ajustar o patch';
    END IF;

    -- CREATE OR REPLACE VIEW preserva colunas/grants (o patch só toca condições do CASE)
    EXECUTE 'CREATE OR REPLACE VIEW public.vw_dashboard_voluntariado AS ' || v_novo;

    v_def := pg_get_viewdef('public.vw_dashboard_voluntariado'::regclass, true);
    SELECT count(*) INTO v_depois FROM regexp_matches(v_def, '~~\*\s*''Domingo 09%''', 'g');
    IF v_depois < v_antes THEN
      RAISE EXCEPTION '[0930] vw_dashboard_voluntariado: patch executado mas releitura achou % (esperado >= %)', v_depois, v_antes;
    END IF;
    RAISE NOTICE '[0930] vw_dashboard_voluntariado: % comparação(ões) patchada(s)', v_antes;
  END IF;

  ---------------------------------------------------------------------------
  -- 3 · SMOKE funcional: a régua aceita o culto novo E não perdeu os atuais
  ---------------------------------------------------------------------------
  IF NOT public.fn_dash_vol_service_no_bloco('Domingo 09:30') THEN
    RAISE EXCEPTION '[0930] smoke: fn_dash_vol_service_no_bloco(''Domingo 09:30'') devolveu false depois do patch';
  END IF;
  IF NOT public.fn_dash_vol_service_no_bloco('Domingo 08:30') THEN
    RAISE EXCEPTION '[0930] smoke: fn_dash_vol_service_no_bloco(''Domingo 08:30'') deixou de aceitar o culto ATUAL — regressão';
  END IF;
  IF NOT public.fn_dash_vol_service_no_bloco('Domingo 11:30') THEN
    RAISE EXCEPTION '[0930] smoke: fn_dash_vol_service_no_bloco(''Domingo 11:30'') deixou de aceitar o culto ATUAL — regressão';
  END IF;
END $mig$;

-- ============================================================================
-- Conferência no CATÁLOGO (o SQL Editor não mostra NOTICE · lei da casa):
--
--   select p.proname,
--          position('Domingo 09' in regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g')) > 0 as tem_0930
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('fn_dash_vol_service_no_bloco',
--                        'fn_dashboard_voluntariado_composicao',
--                        'fn_dashboard_voluntariado_resumo',
--                        'fn_dashboard_voluntariado_pessoas');
--   -- gate = true obrigatório; composicao/resumo/pessoas true OU delegam ao gate
--
--   select position('Domingo 09' in pg_get_viewdef('public.vw_dashboard_voluntariado'::regclass, true)) > 0;
--   -- true obrigatório
--
--   select public.fn_dash_vol_service_no_bloco('Domingo 09:30');  -- true
--   select public.fn_dash_vol_service_no_bloco('Domingo 08:30');  -- true (atual segue)
-- ============================================================================

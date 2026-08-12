-- ============================================================================
-- ⚠️⚠️ GATILHO EM TABELA QUE O APP ESCREVE DIRETO PRECISA SER SECURITY DEFINER
--
-- Reportado pelo Matheus em 12/08: apertar "li o devocional de hoje" no app de
-- membros dá erro.
--
-- CAUSA (mesma família do "QR indisponível" de 10/08 · migration
-- 20260810120000): o check-in do devocional NÃO passa pelo backend — o app
-- grava direto em `mem_devocionais` com a chave pública + o JWT da pessoa
-- (papel `authenticated`), em `lib/devocional.ts:99`. A tabela tem DOIS
-- gatilhos e nenhum deles era SECURITY DEFINER, então eles rodavam com o
-- privilégio de QUEM APERTOU O BOTÃO:
--
--   tg_nsm_devocional_investir()  → nsm_inserir_evento(...)
--   tg_kpi_recalc_nativo()        → fn_kpi_recalc_dado_tipos(text[])
--                                        → recalcular_kpi(...)
--
-- `fn_kpi_recalc_dado_tipos` nasceu (20260610180000) com GRANT EXECUTE apenas
-- para `service_role`. Isso funcionou por dois meses porque no PostgreSQL toda
-- função nasce com EXECUTE para PUBLIC e um GRANT explícito NÃO revoga esse
-- default. A varredura de segurança que revogou anon/authenticated de ~114
-- funções SECURITY DEFINER derrubou esse acesso, e o INSERT inteiro passou a
-- falhar com 42501 (permission denied for function) — exceção em trigger AFTER
-- aborta o statement, então o check-in não grava nada.
--
-- ⚠️ O RAIO É MAIOR QUE O DEVOCIONAL: `tg_kpi_recalc_nativo` está em 11 tabelas
-- (mem_grupos, mem_grupo_membros, mem_voluntarios, mem_devocionais,
-- cui_jornada180, cui_acompanhamentos, cui_convertidos, next_inscricoes,
-- vol_check_ins, vol_inscricoes, grupo_supervisao_visitas, batismo_inscricoes).
-- Qualquer escrita de cliente `authenticated` em qualquer uma delas quebra pelo
-- mesmo motivo. Consertar a FUNÇÃO conserta as 11 de uma vez.
--
-- ⚠️ POR QUE SECURITY DEFINER E NÃO `GRANT ... TO authenticated`:
-- conceder EXECUTE dessas funções a `authenticated` deixaria qualquer pessoa
-- logada disparar recálculo de KPI da igreja inteira à vontade. SECURITY
-- DEFINER não concede NADA a ninguém — o gatilho passa a rodar como o dono da
-- função, que é exatamente o padrão que a lei nº 9 das regras de segurança já
-- manda usar em helper chamado de dentro de policy/trigger.
--
-- ⚠️ NÃO HÁ ESCALAÇÃO DE PRIVILÉGIO AQUI (auditado antes de escrever):
--  · tg_kpi_recalc_nativo NÃO recebe nada do usuário — o único argumento é
--    TG_ARGV[0], que está fixo na DEFINIÇÃO do trigger, não no INSERT.
--  · tg_nsm_devocional_investir repassa NEW.membro_id, e a policy
--    `mem_devocionais_write` já exige `membro_id = current_user_membro_id()`
--    no WITH CHECK — a pessoa só consegue gerar evento NSM de si mesma.
--
-- ⚠️ ALTER FUNCTION, nunca CREATE OR REPLACE: o corpo vivo em produção pode ter
-- ajuste que o arquivo do repo não tem (lição do patch dinâmico do
-- fn_app_inscricoes_fanout, 20260729060000). Aqui só o atributo muda.
--
-- Aditiva e idempotente. Rodar de novo não altera nada além do já alterado.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guarda de DRIFT: as duas funções precisam existir e ser únicas (sem
-- overload). ALTER numa assinatura errada passaria em silêncio e deixaria a
-- versão realmente usada pelo gatilho intocada.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_kpi int;
  n_nsm int;
BEGIN
  SELECT count(*) INTO n_kpi
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'tg_kpi_recalc_nativo';

  SELECT count(*) INTO n_nsm
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'tg_nsm_devocional_investir';

  IF n_kpi <> 1 THEN
    RAISE EXCEPTION
      'Esperava exatamente 1 public.tg_kpi_recalc_nativo, encontrei %. Conferir drift antes de aplicar.', n_kpi;
  END IF;
  IF n_nsm <> 1 THEN
    RAISE EXCEPTION
      'Esperava exatamente 1 public.tg_nsm_devocional_investir, encontrei %. Conferir drift antes de aplicar.', n_nsm;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- O conserto
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.tg_kpi_recalc_nativo()
  SECURITY DEFINER
  SET search_path = public;

ALTER FUNCTION public.tg_nsm_devocional_investir()
  SECURITY DEFINER
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- A marca fica no CATÁLOGO, não só neste arquivo: a varredura de segurança é
-- feita à mão no SQL Editor, e quem varrer de novo precisa ver o motivo no
-- próprio objeto (mesma convenção do "[GRANT authenticated OBRIGATÓRIO]" da
-- migration 20260810120000).
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.tg_kpi_recalc_nativo() IS
  '[SECURITY DEFINER OBRIGATÓRIO] Gatilho statement-level em 11 tabelas, várias '
  'delas escritas DIRETO pelo app de membros com a chave pública (papel '
  'authenticated): mem_devocionais, mem_grupo_membros, batismo_inscricoes... '
  'Chama fn_kpi_recalc_dado_tipos, que é restrita a service_role. Sem SECURITY '
  'DEFINER, o INSERT do cliente aborta com 42501 e o check-in nem grava '
  '(incidente do devocional em 12/08/2026). TG_ARGV[0] = CSV de dado_tipos, '
  'fixo na definição do trigger — nada aqui vem do usuário.';

COMMENT ON FUNCTION public.tg_nsm_devocional_investir() IS
  '[SECURITY DEFINER OBRIGATÓRIO] Gatilho AFTER INSERT em mem_devocionais, que '
  'o app de membros escreve direto com a chave pública. Chama '
  'nsm_inserir_evento. A policy mem_devocionais_write já exige '
  'membro_id = current_user_membro_id(), então a pessoa só gera evento NSM de '
  'si mesma — SECURITY DEFINER aqui não amplia alcance, só evita 42501.';

COMMIT;

-- ============================================================================
-- Conferência (rodar à parte · o SQL Editor não mostra RAISE NOTICE)
--
-- a) as duas funções ficaram SECURITY DEFINER, com search_path fixo:
--    SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname IN ('tg_kpi_recalc_nativo','tg_nsm_devocional_investir');
--    -- esperado: security_definer = true e proconfig = {search_path=public}
--
-- b) o check-in do devocional volta a passar como a pessoa faz (transação
--    revertida — não grava nada):
--    BEGIN;
--      DO $$
--      DECLARE v_membro uuid;
--      BEGIN
--        SELECT membro_id INTO v_membro FROM public.profiles
--         WHERE membro_id IS NOT NULL LIMIT 1;
--        SET LOCAL role authenticated;
--        INSERT INTO public.mem_devocionais (membro_id, data_devocional, tipo, concluida)
--        VALUES (v_membro, current_date, 'pessoal', true);
--        RAISE NOTICE 'INSERT PASSOU';
--      EXCEPTION WHEN OTHERS THEN
--        RAISE NOTICE 'AINDA FALHA % / %', SQLSTATE, SQLERRM;
--      END $$;
--    ROLLBACK;
--    ⚠️ Este bloco entra pela RLS com o papel authenticated mas SEM um JWT, então
--    current_user_membro_id() devolve NULL e a policy recusa por RLS (42501
--    citando "row-level security"). Isso é ESPERADO e não invalida o teste: o
--    que interessa é se a mensagem cita FUNÇÃO (bug de permissão de execução,
--    ainda aberto) ou RLS (a cadeia de funções passou, e o caminho real do app
--    — que leva JWT — funciona). O teste de verdade é apertar o botão no app.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
--  ⚠️⚠️ O FAN-OUT DO APP DESCARTAVA A DATA ESCOLHIDA, EM SILÊNCIO.
--
--  A inscrição de batismo pelo app de membros NÃO passa pelo endpoint: ela
--  grava em `app_inscricoes` e o gatilho `fn_app_inscricoes_fanout` cria a
--  linha em `batismo_inscricoes`. E ele fazia, fixo:
--
--      v_data_batismo := public.fn_proximo_quarto_domingo();
--
--  Ou seja: por mais que a tela mandasse novembro, o banco gravava setembro —
--  sem erro, sem aviso. É a mesma classe do defeito que a migration
--  20260813120000 existiu para consertar ("horário validado e descartado em
--  silêncio"). Sem esta migration, a escolha de mês nasceria mentindo.
--
--  ⚠️⚠️ PATCH DINÂMICO, NÃO `CREATE OR REPLACE` DO ARQUIVO. A definição VIVA
--  desta função diverge do repositório — ela já foi reescrita em produção mais
--  de uma vez. Recriá-la a partir do arquivo reverteria essas correções em
--  silêncio. Por isso: lê a definição viva, confere que a âncora aparece
--  EXATAMENTE UMA VEZ, e só então troca. Âncora ausente ou repetida ABORTA.
--
--  ⚠️ Payload SEM data continua funcionando, de propósito: é o app em campo,
--  que não sabe mandar data. Se ausência fosse erro, o OTA trancaria a
--  inscrição de quem não atualizou — o mesmo portão que travou a frota em
--  06/08.
-- ════════════════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_def  text;
  v_anc  text := '      v_data_batismo := public.fn_proximo_quarto_domingo();';
  v_novo text;
  v_n    int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_app_inscricoes_fanout';
  IF v_def IS NULL THEN RAISE EXCEPTION 'fn_app_inscricoes_fanout nao existe'; END IF;

  -- Já aplicada? Sai quieto (migration idempotente).
  IF v_def ILIKE '%fn_batismo_datas_abertas%' THEN
    RAISE NOTICE 'fan-out ja respeita a data escolhida — nada a fazer';
    RETURN;
  END IF;

  v_n := (length(v_def) - length(replace(v_def, v_anc, ''))) / length(v_anc);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ancora encontrada % vez(es), esperado 1 — abortando', v_n;
  END IF;

  v_novo := replace(v_def, v_anc,
'      -- ⚠️⚠️ A DATA ESCOLHIDA PELA PESSOA PASSA A VALER (25/09/2026).' || E'\n' ||
'      -- Antes era `fn_proximo_quarto_domingo()` fixo: o app mostrava uma data,' || E'\n' ||
'      -- a pessoa escolhia, e o banco gravava OUTRA, calado. Só vale data que' || E'\n' ||
'      -- está na janela aberta — fora dela, cai na próxima (falha fechada).' || E'\n' ||
'      -- ⚠️ Payload SEM data continua funcionando: é o app antigo, em campo.' || E'\n' ||
'      v_data_batismo := COALESCE(' || E'\n' ||
'        (SELECT x.data FROM public.fn_batismo_datas_abertas(3) x' || E'\n' ||
'          WHERE x.data = public.fn_data_iso_segura(d->>''data_batismo'') LIMIT 1),' || E'\n' ||
'        public.fn_batismo_proxima_data()' || E'\n' ||
'      );');

  EXECUTE v_novo;
  RAISE NOTICE 'fan-out corrigido: a data escolhida passa a valer';
END
$mig$;

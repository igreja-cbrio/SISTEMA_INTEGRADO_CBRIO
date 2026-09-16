-- ════════════════════════════════════════════════════════════════════════════
-- E05 da auditoria do banco · as cópias de backup saem do schema que a API serve
-- 16/09/2026 · MEDIDO no dia: 45 tabelas `_bk_*`, 20.152 linhas, no `public`.
--
-- O QUE É: toda vez que um reparo de dado roda, a gente tira uma foto do estado
-- anterior numa tabela `_bk_<data>_<assunto>`. É a rede de segurança certa — e
-- ela foi parar no ÚNICO schema que o PostgREST publica. Resultado: a foto
-- herda a superfície de API da tabela viva, mas nenhuma das políticas dela.
--
-- ⚠️⚠️ 13 das 45 guardam dado sensível, entre elas:
--   · `_bk_20260824_cpf_backfill` ....... 3.946 CPFs
--   · `_bk_20260810_senha_reset` ........ `encrypted_password` (hash bcrypt do auth)
--   · `_bk_20260728_grupo_pedidos_telefone` .. 103 telefones
--   · 3 tabelas de culto ................ `online_chat_page_token` (53 linhas · SEG04)
--
-- ⚠️ E NÃO PAROU: `_bk_20260913_*` e `_bk_20260915_*` nasceram DEPOIS da
-- varredura. Não é um passivo fechado, é uma torneira aberta — por isso a
-- correção é estrutural (um schema fora da API) e não uma faxina de 45 nomes.
--
-- NÃO APAGA NADA. Só muda de schema: o dado continua inteiro, consultável pelo
-- SQL Editor e pelo `service_role`, e some da superfície pública. Reversível
-- com um `ALTER ... SET SCHEMA public`.
--
-- Por que UMA colagem só, contra a lei do "1 tabela por colagem" (deadlock
-- 40P01): aquela lei protege DDL que disputa tabela com o tráfego vivo.
-- Nenhuma consulta do ERP toca `_bk_*` — `fusaoVerificacao.js` as exclui de
-- propósito e o grep não acha leitor nenhum no código. Sem leitor concorrente
-- não há ciclo de espera. O `lock_timeout` fica assim mesmo, por garantia.
-- ════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PASSO 0 · CONFERÊNCIA — rode SOZINHO primeiro. Não altera nada.          │
-- │ Devolve o que vai sair do ar. Salve a saída: é a única cópia da lista.   │
-- └──────────────────────────────────────────────────────────────────────────┘
-- SELECT c.relname AS tabela,
--        pg_size_pretty(pg_total_relation_size(c.oid)) AS tamanho,
--        (SELECT count(*) FROM information_schema.columns k
--          WHERE k.table_schema = 'public' AND k.table_name = c.relname
--            AND k.column_name ~* 'cpf|telefone|celular|email|senha|password|hash|token|nascimento|endereco') AS colunas_sensiveis
--   FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relname LIKE '\_bk\_%' AND c.relkind IN ('r','p','v','m')
--  ORDER BY 3 DESC, 1;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PASSO 1 · A MUDANÇA — uma colagem só. Idempotente: re-rodar não dói.     │
-- └──────────────────────────────────────────────────────────────────────────┘
SET lock_timeout = '10s';

CREATE SCHEMA IF NOT EXISTS backups;

COMMENT ON SCHEMA backups IS
  'Fotos de estado anterior tiradas por reparos de dado (_bk_<data>_<assunto>). '
  'FORA da API: o PostgREST publica só `public`. Todo backup novo nasce AQUI. '
  'Auditoria do banco · E05 · 16/09/2026.';

-- Fora do alcance de quem fala com o banco pelo PostgREST, por garantia dupla:
-- o schema já não é publicado, e mesmo assim ninguém ganha USAGE nele.
REVOKE ALL ON SCHEMA backups FROM PUBLIC;
REVOKE ALL ON SCHEMA backups FROM anon, authenticated;
GRANT USAGE ON SCHEMA backups TO service_role;

DO $$
DECLARE
  r record;
  movidas int := 0;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname LIKE '\_bk\_%'
       AND c.relkind IN ('r','p','v','m')
     ORDER BY c.relname
  LOOP
    EXECUTE format(
      'ALTER %s public.%I SET SCHEMA backups',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
      r.relname
    );
    movidas := movidas + 1;
  END LOOP;
  RAISE NOTICE 'backups movidos para o schema backups: %', movidas;
END $$;

-- Cinto e suspensório: nenhum privilégio de leitura sobrevive à mudança.
REVOKE ALL ON ALL TABLES IN SCHEMA backups FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA backups FROM anon, authenticated;

-- O PostgREST guarda o desenho do schema em cache; sem isto, os nomes velhos
-- continuam aparecendo na API até o próximo reload dele.
NOTIFY pgrst, 'reload schema';

-- ⚠️ TERMINA NA CONFERÊNCIA de propósito: o SQL Editor mostra só o resultado do
-- ÚLTIMO comando. Esperado: ainda_no_public = 0 · agora_em_backups = 45.
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'  AND c.relname LIKE '\_bk\_%') AS ainda_no_public,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'backups' AND c.relkind IN ('r','p','v','m'))  AS agora_em_backups;

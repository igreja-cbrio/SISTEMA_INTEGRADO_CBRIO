-- ============================================================================
-- DEVOCIONAL · o APP lê e grava DIRETO nestas tabelas (supabase-js com o JWT do
-- membro) — devolve os grants ao papel `authenticated` e fecha por RLS (23/09/2026)
--
-- Contexto. Em 23/09 a casa nova do Devocional voltou ao ar no app (PRs #164/#165
-- do Aplicativo-CBRio) e o Marcos, logado como membro, recebeu
-- `42501 permission denied for table devocional_planos` (e o mesmo em
-- devocional_leituras_biblia e devocional_registros_pessoais). 42501 é GRANT de
-- tabela, não RLS: o aperto do papel `authenticated` feito na auditoria de 06/09
-- (aplicado fora do git) revogou o acesso, e as 5 tabelas novas do devocional
-- (criadas pelo Codex em 02/09, também fora do git) nunca tiveram grant nem
-- migration. Esta migration é a PRIMEIRA vez que o schema de acesso delas entra no repo.
--
-- Régua: grant só do que o app usa · RLS por membro (`current_user_membro_id()`,
-- molde de `20260521270000_rls_mem_operacionais.sql`) · service_role passa · anon
-- nunca. Idempotente: pode rodar de novo.
--
-- O que cada tela do app faz (lib/devocional.ts):
--   devocional_planos / devocional_itens ............ SELECT (planos ativos e itens do ciclo)
--   devocional_leituras_planos ...................... INSERT (upsert ON CONFLICT DO NOTHING) + SELECT próprio
--   devocional_leituras_biblia ...................... INSERT (idem) + SELECT próprio
--   devocional_registros_pessoais ................... INSERT + SELECT + DELETE próprios (marcações/anotações)
--   devocional_mural ................................ INSERT + SELECT + DELETE próprios (feed vem pela RPC)
--   devocional_inscricoes ........................... INSERT + SELECT próprios
--   mem_devocionais ................................. upsert do check-in (é o KPI do valor Investir)
--   RPC listar_devocional_mural(int) · resumo_meus_planos_devocionais() .... EXECUTE
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · GRANTS de tabela (o que faltava — causa do 42501)
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.devocional_planos, public.devocional_itens, public.devocional_inscricoes,
  public.devocional_mural, public.devocional_registros_pessoais,
  public.devocional_leituras_biblia, public.devocional_leituras_planos
FROM anon, public;

GRANT SELECT ON TABLE public.devocional_planos, public.devocional_itens TO authenticated;
-- ⚠️ devocional_itens carregava grant ANTIGO de tudo pra authenticated (inclusive
-- TRUNCATE, que NÃO passa pela RLS) — conferido em 23/09 depois da 1ª aplicação.
-- Conteúdo é só leitura pra logado; quem escreve é o backend (service_role).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.devocional_planos, public.devocional_itens
FROM authenticated;
GRANT SELECT, INSERT ON TABLE
  public.devocional_leituras_biblia, public.devocional_leituras_planos, public.devocional_inscricoes
TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE
  public.devocional_registros_pessoais, public.devocional_mural
TO authenticated;
-- check-in do KPI (upsert = INSERT ... ON CONFLICT DO UPDATE => precisa de UPDATE)
GRANT SELECT, INSERT, UPDATE ON TABLE public.mem_devocionais TO authenticated;

GRANT ALL ON TABLE
  public.devocional_planos, public.devocional_itens, public.devocional_inscricoes,
  public.devocional_mural, public.devocional_registros_pessoais,
  public.devocional_leituras_biblia, public.devocional_leituras_planos
TO service_role;

-- ---------------------------------------------------------------------------
-- 2 · RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.devocional_planos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devocional_itens              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devocional_inscricoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devocional_mural              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devocional_registros_pessoais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devocional_leituras_biblia    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devocional_leituras_planos    ENABLE ROW LEVEL SECURITY;

-- 2a · conteúdo (planos e itens): qualquer logado lê; ninguém logado escreve
--     (o ERP escreve pelo backend com service_role). Sai a policy FOR ALL
--     USING (true) de 20260519140000 — era do tempo em que o portão era o grant.
DROP POLICY IF EXISTS "auth_read_devocional_planos"  ON public.devocional_planos;
DROP POLICY IF EXISTS "auth_write_devocional_planos" ON public.devocional_planos;
DROP POLICY IF EXISTS devocional_planos_select       ON public.devocional_planos;
DROP POLICY IF EXISTS devocional_planos_service      ON public.devocional_planos;
CREATE POLICY devocional_planos_select  ON public.devocional_planos FOR SELECT TO authenticated USING (true);
CREATE POLICY devocional_planos_service ON public.devocional_planos FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_read_devocional_itens"  ON public.devocional_itens;
DROP POLICY IF EXISTS "auth_write_devocional_itens" ON public.devocional_itens;
DROP POLICY IF EXISTS devocional_itens_select       ON public.devocional_itens;
DROP POLICY IF EXISTS devocional_itens_service      ON public.devocional_itens;
CREATE POLICY devocional_itens_select  ON public.devocional_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY devocional_itens_service ON public.devocional_itens FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2b · o que é DA PESSOA: só a própria linha (membro_id = quem está logado)
DROP POLICY IF EXISTS devocional_leituras_planos_select  ON public.devocional_leituras_planos;
DROP POLICY IF EXISTS devocional_leituras_planos_insert  ON public.devocional_leituras_planos;
DROP POLICY IF EXISTS devocional_leituras_planos_service ON public.devocional_leituras_planos;
CREATE POLICY devocional_leituras_planos_select  ON public.devocional_leituras_planos FOR SELECT TO authenticated USING (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_leituras_planos_insert  ON public.devocional_leituras_planos FOR INSERT TO authenticated WITH CHECK (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_leituras_planos_service ON public.devocional_leituras_planos FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS devocional_leituras_biblia_select  ON public.devocional_leituras_biblia;
DROP POLICY IF EXISTS devocional_leituras_biblia_insert  ON public.devocional_leituras_biblia;
DROP POLICY IF EXISTS devocional_leituras_biblia_service ON public.devocional_leituras_biblia;
CREATE POLICY devocional_leituras_biblia_select  ON public.devocional_leituras_biblia FOR SELECT TO authenticated USING (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_leituras_biblia_insert  ON public.devocional_leituras_biblia FOR INSERT TO authenticated WITH CHECK (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_leituras_biblia_service ON public.devocional_leituras_biblia FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS devocional_inscricoes_select  ON public.devocional_inscricoes;
DROP POLICY IF EXISTS devocional_inscricoes_insert  ON public.devocional_inscricoes;
DROP POLICY IF EXISTS devocional_inscricoes_service ON public.devocional_inscricoes;
CREATE POLICY devocional_inscricoes_select  ON public.devocional_inscricoes FOR SELECT TO authenticated USING (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_inscricoes_insert  ON public.devocional_inscricoes FOR INSERT TO authenticated WITH CHECK (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_inscricoes_service ON public.devocional_inscricoes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS devocional_registros_pessoais_select  ON public.devocional_registros_pessoais;
DROP POLICY IF EXISTS devocional_registros_pessoais_insert  ON public.devocional_registros_pessoais;
DROP POLICY IF EXISTS devocional_registros_pessoais_delete  ON public.devocional_registros_pessoais;
DROP POLICY IF EXISTS devocional_registros_pessoais_service ON public.devocional_registros_pessoais;
CREATE POLICY devocional_registros_pessoais_select  ON public.devocional_registros_pessoais FOR SELECT TO authenticated USING (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_registros_pessoais_insert  ON public.devocional_registros_pessoais FOR INSERT TO authenticated WITH CHECK (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_registros_pessoais_delete  ON public.devocional_registros_pessoais FOR DELETE TO authenticated USING (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_registros_pessoais_service ON public.devocional_registros_pessoais FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2c · mural: a pessoa escreve/apaga o que é dela; leitura direta só do próprio
--     (a tela "Anotações e Marcações" lista os comentários que EU publiquei). O
--     FEED da comunidade — com nome do autor e alcance grupo/servir/igreja — vem
--     pela RPC listar_devocional_mural, que é quem sabe quem pode ver o quê.
DROP POLICY IF EXISTS devocional_mural_select  ON public.devocional_mural;
DROP POLICY IF EXISTS devocional_mural_insert  ON public.devocional_mural;
DROP POLICY IF EXISTS devocional_mural_delete  ON public.devocional_mural;
DROP POLICY IF EXISTS devocional_mural_service ON public.devocional_mural;
CREATE POLICY devocional_mural_select  ON public.devocional_mural FOR SELECT TO authenticated USING (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_mural_insert  ON public.devocional_mural FOR INSERT TO authenticated
  WITH CHECK (membro_id = public.current_user_membro_id() AND status = 'publicado' AND alcance IN ('igreja','grupo','servir'));
CREATE POLICY devocional_mural_delete  ON public.devocional_mural FOR DELETE TO authenticated USING (membro_id = public.current_user_membro_id());
CREATE POLICY devocional_mural_service ON public.devocional_mural FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3 · RPCs que o app chama
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.listar_devocional_mural(integer)    FROM anon, public;
REVOKE ALL ON FUNCTION public.resumo_meus_planos_devocionais()    FROM anon, public;
GRANT EXECUTE ON FUNCTION public.listar_devocional_mural(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resumo_meus_planos_devocionais() TO authenticated, service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA (rodar depois, no SQL editor · tem que dar 7 linhas com
-- authenticated e ZERO com anon)
-- ---------------------------------------------------------------------------
-- select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--  where table_schema='public' and table_name like 'devocional_%' and grantee in ('anon','authenticated')
--  group by 1,2 order by 1,2;
-- select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and proname in ('listar_devocional_mural','resumo_meus_planos_devocionais');
-- Se `prosecdef` = false em listar_devocional_mural, o feed sai sem o nome do autor
-- (mem_membros é fechada pra membro comum) — aí ela precisa virar SECURITY DEFINER.

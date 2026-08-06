-- ============================================================================
-- 2026-08-06 · O CLIENTE PARA DE PODER ESCREVER O QUE NÃO É DELE
-- Auditoria do app · Onda 1, item 2 (+ um achado NOVO, mais grave, na parte 3)
-- ============================================================================
--
-- PARTE 1+2 · `app_inscricoes` tinha policy `FOR ALL` do dono
-- ----------------------------------------------------------
-- `app_inscricoes_own` (20260418120000:31) é
-- `FOR ALL USING (auth.uid() = auth_user_id)` — sem `TO`, sem `WITH CHECK`.
-- `FOR ALL` cobre UPDATE e DELETE, e sem WITH CHECK próprio o INSERT herda o
-- USING (que não restringe `membro_id`, `status` nem `tratamento_status`).
-- Com a chave pública (que vai dentro do app) + o próprio JWT, dava pra:
--   · marcar o próprio SOS como `concluido` — ele SAI da fila pastoral;
--   · apagar a linha (`deleted_at`);
--   · inserir pedido com `membro_id` de OUTRA pessoa.
-- Medido na auditoria: 13 pedidos pastorais vivos, 3 pendentes.
--
-- ⚠️⚠️ E O CLIENTE NÃO PRECISA DE NADA DISSO. Varredura exaustiva dos dois
-- repos: o app toca `app_inscricoes` em **UM** lugar e é LEITURA
-- (`lib/meusPedidos.ts:18`); quem escreve é `POST /api/app/inscricoes` com
-- **service_role** (`backend/routes/app.js`), e o front do ERP nunca toca a
-- tabela (passa por `backend/routes/cuidados.js`). Então SELECT do dono é tudo
-- o que fica.
--
-- ⚠️⚠️ POR QUE DESCOBRIR AS POLICIES NO CATÁLOGO E NÃO PELO NOME DO ARQUIVO:
-- policies permissivas são **OR'eadas**. Existe indício de uma SEGUNDA policy
-- `own` que **não está em nenhuma migration do repo** (a 20260701030000 revela
-- duas ao embrulhar `auth.uid()` em `(select auth.uid())`). Dropar só a que o
-- git conhece deixaria a duplicata com `FOR ALL` viva — a migration passaria, o
-- lint ficaria verde e **o furo continuaria aberto**. Esta migration varre
-- `pg_policies` e derruba toda policy que dê ESCRITA a authenticated/anon.
--
-- ⚠️ O `(select auth.uid())` é obrigatório na policy nova: `auth.uid()` cru
-- reavalia a função POR LINHA e desfaz o initplan que a 20260701030000 montou.
--
-- ⚠️ O que isto NÃO resolve, e está declarado: o `dados` jsonb continua sendo
-- decidido pelo backend, e o fanout é SECURITY DEFINER. Se algum dia o cliente
-- voltar a poder inserir, WITH CHECK em COLUNA não impede payload de terceiro
-- dentro do jsonb. É mais uma razão pra escrita ficar só no backend.
--
-- ⚠️ NÃO é trigger e NÃO toca `fn_app_inscricoes_fanout`: qualquer coisa nova no
-- caminho do INSERT pode abortar o pedido da pessoa. Endurecer por policy/GRANT
-- não corre esse risco.
--
-- IDEMPOTENTE. Sem DDL de coluna.
-- ============================================================================
SET lock_timeout = '10s';

-- ── PARTE 1 · derruba toda policy que dá ESCRITA ao cliente ─────────────────
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT policyname, cmd, roles::text AS roles
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'app_inscricoes'
  LOOP
    -- Mantém o que é exclusivo de service_role (o backend). Derruba tudo que dá
    -- ALL/INSERT/UPDATE/DELETE pra authenticated, anon ou public — inclusive
    -- policy que não existe no repo (é justamente o caso).
    IF r.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
       AND (r.roles LIKE '%authenticated%' OR r.roles LIKE '%anon%' OR r.roles = '{public}')
    THEN
      EXECUTE format('DROP POLICY %I ON public.app_inscricoes', r.policyname);
      RAISE NOTICE 'PARTE 1: policy % (% · %) derrubada', r.policyname, r.cmd, r.roles;
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'PARTE 1: % policies de escrita removidas', n;
END $$;

-- ── PARTE 2 · o dono LÊ o que é dele; escrever é só do backend ──────────────
DROP POLICY IF EXISTS app_inscricoes_select_own ON public.app_inscricoes;
CREATE POLICY app_inscricoes_select_own ON public.app_inscricoes
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = auth_user_id);

-- Rede de segurança: o backend usa service_role. Ela normalmente ignora RLS,
-- mas o padrão da casa é a policy existir explicitamente (as tabelas app_* têm
-- `_service`), pra não depender de atributo de role.
DROP POLICY IF EXISTS app_inscricoes_service ON public.app_inscricoes;
CREATE POLICY app_inscricoes_service ON public.app_inscricoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- E o privilégio de tabela acompanha a policy: sem GRANT de escrita, nem policy
-- nova reabre o furo por engano.
REVOKE INSERT, UPDATE, DELETE ON public.app_inscricoes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, SELECT ON public.app_inscricoes FROM anon;

-- ============================================================================
-- ⚠️⚠️ PARTE 3 · ACHADO NOVO (não estava nos 12 da auditoria) E MAIS GRAVE
-- ============================================================================
-- `app_soft_delete(text,text,uuid)` e `app_restore(text,text)` são
-- **SECURITY DEFINER** (bypassam RLS por desenho) e têm
-- `GRANT EXECUTE ... TO authenticated` (20260521180000:174 e :207). A ÚNICA
-- validação dentro delas é "a tabela está na whitelist" — **não há checagem de
-- dono, de permissão, de módulo ou de nível**.
--
-- Efeito: qualquer pessoa logada (inclusive qualquer membro pelo app, com a
-- chave pública que vai no bundle) podia chamar
--   select app_soft_delete('mem_membros', '<uuid de qualquer pessoa>')
-- e apagar por soft-delete QUALQUER linha das ~30 tabelas da whitelist —
-- pessoas, grupos, contribuições, dados de Kids — sabendo só o id. E
-- `app_restore` desfaz, o que também serve pra ressuscitar o que a equipe
-- apagou de propósito.
--
-- ⚠️ O REVOKE é seguro e NÃO muda comportamento: varredura dos dois repos
-- mostra **17 arquivos de rota do backend** chamando `app_soft_delete` — todos
-- com service_role (`backend/utils/supabase.js`) — e **ZERO** chamadores no
-- frontend do ERP (`src/`), no app mobile e nas Edge Functions (que também usam
-- service_role). Nenhum cliente perde nada. O super-admin no SQL Editor conecta
-- como owner e segue podendo.
--
-- Reverter, se algum dia precisar: `GRANT EXECUTE ON FUNCTION ... TO authenticated`.
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS assinatura
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN ('app_soft_delete', 'app_restore')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.assinatura);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.assinatura);
    -- service_role continua com EXECUTE (é quem o backend usa).
    RAISE NOTICE 'PARTE 3: EXECUTE de % revogado de authenticated/anon', r.assinatura;
    n := n + 1;
  END LOOP;
  IF n = 0 THEN
    RAISE EXCEPTION 'PARTE 3: não achei app_soft_delete/app_restore no catálogo — revisar antes de seguir';
  END IF;
END $$;

-- ── Conferência (rodar DEPOIS · o SQL Editor não mostra RAISE NOTICE) ────────
-- 1) sobrou só leitura do dono + service_role:
--    select policyname, cmd, roles, qual from pg_policies
--     where schemaname='public' and tablename='app_inscricoes' order by policyname;
--
-- 2) o cliente não tem mais escrita na tabela (deve devolver 0 linhas):
--    select grantee, privilege_type from information_schema.role_table_grants
--     where table_schema='public' and table_name='app_inscricoes'
--       and grantee in ('authenticated','anon')
--       and privilege_type in ('INSERT','UPDATE','DELETE');
--
-- 3) o soft-delete não é mais chamável pelo cliente (deve devolver 0 linhas):
--    select p.proname, a.rolname
--      from pg_proc p
--      join pg_namespace ns on ns.oid = p.pronamespace
--      cross join lateral aclexplode(p.proacl) acl
--      join pg_roles a on a.oid = acl.grantee
--     where ns.nspname='public' and p.proname in ('app_soft_delete','app_restore')
--       and a.rolname in ('authenticated','anon') and acl.privilege_type='EXECUTE';
--
-- 4) ⚠️ TESTE DE FUMAÇA com token de USUÁRIO REAL, não com a anon key pura: o
--    supabase-js manda a anon key em `apikey` e o JWT do usuário em
--    `Authorization`, e o papel efetivo é `authenticated`. Testar só com a anon
--    key devolve "permission denied" (correto) e se lê como "quebrei o app".
--    O que tem que continuar funcionando: a tela "Meus pedidos" do app
--    (lib/meusPedidos.ts) listando os pedidos DA PRÓPRIA pessoa.

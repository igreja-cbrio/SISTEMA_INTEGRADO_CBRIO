-- ============================================================================
-- CRÍTICO · Fecha o escalonamento de privilégio em public.profiles
-- Auditoria de 16/08/2026 · confirmado em produção (transação revertida)
-- APLICADA EM PRODUÇÃO EM 16/08/2026 (versão 20260816194649)
-- ============================================================================
-- O QUE ESTAVA ABERTO
--   `anon` e `authenticated` tinham GRANT UPDATE nas 23 colunas de profiles.
--   RLS não é por coluna: a policy `profiles_update_own` (auth.uid() = id) só
--   diz QUAL LINHA pode ser escrita, nunca QUAL COLUNA. Como a anon key está
--   embutida no bundle do app de membros (qualquer pessoa baixa e cria conta),
--   qualquer conta autenticada rodava, com o próprio JWT:
--       update profiles set role = 'diretor' where id = auth.uid();
--
--   Testado ao vivo antes da correção, em transação revertida:
--   role assistente→diretor OK · is_diretoria_geral→true OK · membro_id→uuid
--   de OUTRA pessoa OK · is_membro_only→false OK · kpi_areas→['financeiro'] OK.
--
-- POR QUE É GRAVE
--   · 57 policies RLS decidem por `profiles.role`;
--   · /api/permissoes/* é authorize('admin','diretor'), que cai no fallback
--     `profiles.role` (backend/middleware/auth.js:456) — quem se auto-promove
--     passa a mexer em cargo/override de todo mundo;
--   · `membro_id` alimenta current_user_membro_id(), usada nas policies de
--     contribuições e Kids — trocar o membro_id é ver o dado pessoal de outro;
--   · `kpi_areas` alimenta can_edit_kpi_area()/authorizeKpiArea.
--
-- ⚠️ SEGUNDO DEGRAU: a policy `profiles_update_diretor` (USING role='diretor',
--   sem WITH CHECK) liberava UPDATE em QUALQUER LINHA. Auto-promoção no passo 1
--   → tabela inteira no passo 2. Nenhum cliente usa essa policy.
--
-- FORENSE (16/08, antes da correção): NENHUM indício de exploração. Zero contas
--   is_membro_only com marca de poder; zero sequestro de membro_id; as 16 contas
--   admin/diretor são conhecidas. Baseline guardado no PR.
--
-- QUEM ESCREVE EM profiles PELO CLIENTE (levantamento exaustivo nos 3 repos)
--   · telefone → src/pages/Perfil.jsx:93                    (ERP · Meu Perfil)
--   · name     → Aplicativo-CBRio/app/(app)/perfil.tsx:187  (app de membros)
--   · status   → Aplicativo-CBRio/app/(app)/configuracoes.tsx:196
--       ⚠️ NÃO recebe grant, de propósito: está NULL nas 145 linhas, a fonte
--       real do pedido de exclusão é `app_solicitacoes_exclusao`, e o app já
--       tolera o erro (console.log). Coluna TEXT sem CHECK = texto arbitrário
--       de membro numa tela de admin futura.
--   · password_changed_at → RPC app_marcar_senha_trocada (SECURITY DEFINER,
--       owner postgres · não depende de grant do role · não muda nada aqui).
--   CBRio-Staff: zero escritas. handle_new_user*: SECURITY DEFINER (INSERT ok).
--
-- ⚠️⚠️ LEI QUE NASCE AQUI · NUNCA dar `GRANT ... ON public.profiles` em nível
--   de TABELA para anon ou authenticated. Privilégio de tabela cobre TODAS as
--   colunas e, uma vez dado, revogar coluna a coluna NÃO TEM EFEITO — só um
--   REVOKE de tabela seguido de GRANT por coluna conserta. Coluna nova nasce
--   sem grant (fail-closed): conceder só em migration própria e justificada.
--   ⚠️ Corolário na UI: statement misto falha INTEIRO. `.update({name, x})` num
--   objeto só passa a dar 403 — inclusive a parte do name. Um update por
--   coluna, ou rota no backend.
-- ============================================================================


-- ── ETAPA 1 · privilégio de COLUNA (a tranca de verdade) ────────────────────
-- Ordem de avaliação no Postgres: privilégio ANTES da RLS. Sem grant de coluna
-- o statement nem chega na policy → vira 42501 (403 no PostgREST), auditável,
-- em vez da falha silenciosa "0 linhas".
--
-- REVOKE de tabela limpa também os grants de coluna → o par REVOKE+GRANT é
-- idempotente e auto-curativo (rodar de novo devolve o estado desejado, mesmo
-- que alguém tenha regrantado no meio).
--
-- service_role e postgres têm rolbypassrls e mantêm todos os grants: o backend
-- inteiro (inclusive PUT /api/permissoes/usuario/:id/role) e as Edge Functions
-- não sentem nada.
REVOKE UPDATE, INSERT, DELETE, TRUNCATE ON public.profiles FROM anon;
REVOKE UPDATE, INSERT, DELETE, TRUNCATE ON public.profiles FROM authenticated;
REVOKE UPDATE, INSERT, DELETE, TRUNCATE ON public.profiles FROM PUBLIC;

-- As DUAS ÚNICAS colunas que o cliente escreve hoje. SELECT fica intacto nas
-- 23 (o UPDATE precisa dele no WHERE, e o PostgREST se pedir representation).
GRANT UPDATE (name, telefone) ON public.profiles TO authenticated;
-- anon não recebe nada: nenhum fluxo público escreve em profiles, e o INSERT
-- do signup é feito por trigger SECURITY DEFINER (owner postgres).


-- ── ETAPA 2 · policies de UPDATE ───────────────────────────────────────────
-- 2a) Escrever no profile de TERCEIRO é operação de backend (service_role),
--     que ainda tem anti-autoescalação (bloqueiaAutoEdicao) — coisa que esta
--     policy não tinha. Ela sai.
DROP POLICY IF EXISTS profiles_update_diretor ON public.profiles;

-- 2b) A policy própria é recriada explícita:
--     · TO authenticated (era TO public — anon nunca deveria ter sido alvo);
--     · WITH CHECK explícito NÃO muda o comportamento (o Postgres já reusa o
--       USING quando é omitido) — é âncora contra afrouxamento futuro do USING
--       e deixa o pg_policies auto-explicativo. É ele que impede
--       `set id = '<uuid de outro>'` na linha nova.
--     · (SELECT auth.uid()) segue a convenção de initplan do repo
--       (migrations 20260701030000/20260701040000 · avalia 1x, não por linha).
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING      ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);


-- ── ETAPA 3 · RPCs de seed que escrevem coluna sensível ────────────────────
-- Três helpers de maio/2026 ficaram no banco como SECURITY INVOKER com EXECUTE
-- pra anon+authenticated. Por serem INVOKER, a ETAPA 1 já os neutraliza (rodam
-- com o privilégio do chamador) — mas se alguém os recriar como DEFINER viram
-- bypass da correção inteira. postgres e service_role mantêm EXECUTE.
-- Os DO blocks toleram a função não existir (idempotência em ambiente novo).
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.marcar_diretoria_geral(text, text)
    FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'marcar_diretoria_geral ausente - ok'; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.atribuir_kpi_area(text, text[])
    FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'atribuir_kpi_area ausente - ok'; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.atribuir_ministerio(text, text, text)
    FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'atribuir_ministerio ausente - ok'; END $$;


-- ── ETAPA 4 · auditoria (sem isto não há como saber o que aconteceu) ───────
-- profiles NÃO tinha trigger de audit: app_audit_log tem 242k linhas e ZERO de
-- profiles. O único vestígio era `updated_at`, sobrescrito a cada escrita.
-- Reusa a função genérica de 20260521230000 (SECURITY DEFINER · grava em
-- app_audit_log, que só super-admin lê). Volume medido: ~86 linhas em 30 dias.
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'role,membro_id,is_diretoria_geral,funcao_diretoria,kpi_areas,kpi_valores,is_membro_only,is_servico,active,area,ministerio_id,ministerio_papel,email,status'
);
-- ⚠️ Escrita do backend grava user_id = NULL (service_role não tem auth.uid()).
--    O QUE mudou fica registrado; o QUEM, no caminho backend, precisa de log na
--    rota (follow-up: PUT /api/permissoes/usuario/:id/role → revision_log).


-- ── ETAPA 5 · a lei no próprio catálogo ────────────────────────────────────
-- A varredura de segurança é feita à mão no SQL Editor: quem varrer de novo
-- precisa ver o motivo no próprio objeto, não só no arquivo da migration.
COMMENT ON TABLE public.profiles IS
  'Perfil do usuário do sistema (1:1 com auth.users). ⚠️ LEI DE SEGURANÇA '
  '(16/08/2026): `authenticated` só tem UPDATE nas colunas (name, telefone); '
  '`anon` não tem UPDATE/INSERT nenhum. NUNCA dar GRANT de nível de TABELA aqui '
  '— privilégio de tabela cobre todas as colunas e revogar coluna a coluna '
  'depois não tem efeito. Coluna nova nasce sem grant (fail-closed): conceder '
  'só em migration própria e justificada. Escrita em profile de TERCEIRO é '
  'exclusiva do backend com service_role (PUT /api/permissoes/usuario/:id/role).';

COMMENT ON COLUMN public.profiles.role IS
  'Acesso base: assistente | admin | diretor. admin/diretor = "vê tudo" no '
  'front, passa em authorize() no backend e é lido por 57 policies RLS. Só o '
  'backend (service_role) escreve — o cliente perdeu o GRANT em 16/08/2026 '
  'depois que se descobriu que qualquer conta do app se auto-promovia.';

COMMENT ON COLUMN public.profiles.membro_id IS
  'Vínculo com mem_membros. Alimenta current_user_membro_id(), usada nas '
  'policies de dado pessoal (contribuições, Kids). Só backend escreve: apontar '
  'para outro cadastro = ver o dado pessoal de outra pessoa.';


-- ============================================================================
-- ROLLBACK (se algo quebrar em produção)
--   GRANT UPDATE ON public.profiles TO authenticated;
--   CREATE POLICY profiles_update_diretor ON public.profiles FOR UPDATE TO public
--     USING (EXISTS (SELECT 1 FROM public.profiles p
--                     WHERE p.id = auth.uid() AND p.role = 'diretor'));
--   DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
-- ⚠️ Depois de um rollback de tabela inteira, RE-APLICAR a ETAPA 1 COMPLETA
--    (o REVOKE de tabela primeiro) — não adianta revogar coluna a coluna.
-- ============================================================================

-- Auditoria CBRio (2026-06-08) · correção dos achados CRÍTICOS de RLS + função
-- ============================================================================
-- 3 dos 4 críticos da auditoria (o 4º — hard-delete em int_visitantes — é fix de
-- backend em routes/integracao.js, sem migration):
--   #1 usuarios: policies de write com USING(true)/WITH CHECK(true) → qualquer
--      logado editava o próprio cargo_id pela anon key (escalonamento de privilégio).
--   #2 cui_atendimentos: timeline pastoral (PII) com policies USING(true) — escapou
--      das ondas de lockdown. Trava por módulo (cuidados/integração), DELETE só super-admin.
--   #4 fin_metas_progresso: overload ambíguo (a versão de 3 args com DEFAULT coexiste
--      com a de 2 args) → o RPC do Dashboard Financeiro pode resolver pra assinatura
--      errada. DROP da assinatura antiga (date,date) resolve.
-- Idempotente. Direção RESTRITIVA (fecha acesso) — não amplia. Backend escreve via
-- service_role (bypassa RLS), então PUT /permissoes/usuario/:id/cargo|role seguem ok.
-- ============================================================================

-- ── #1 · usuarios (tabela de cargo) · lockdown de write pra super-admin ──────
-- SELECT continua aberto (o ModuleGuard/menu lê o cargo). Write só super-admin;
-- service_role (backend) continua administrando via API.
DROP POLICY IF EXISTS "Authenticated write usuarios"  ON public.usuarios;
DROP POLICY IF EXISTS "Authenticated update usuarios" ON public.usuarios;
DROP POLICY IF EXISTS "Authenticated delete usuarios" ON public.usuarios;

CREATE POLICY "usuarios_write_super"  ON public.usuarios FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
CREATE POLICY "usuarios_update_super" ON public.usuarios FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "usuarios_delete_super" ON public.usuarios FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "usuarios_service" ON public.usuarios;
CREATE POLICY "usuarios_service" ON public.usuarios FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Audit das mudanças de cargo (mesmo padrão de cargo_modulo_permissao)
DROP TRIGGER IF EXISTS trg_audit_usuarios ON public.usuarios;
CREATE TRIGGER trg_audit_usuarios
  AFTER INSERT OR UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('cargo_id,deleted_at');

-- ── #2 · cui_atendimentos (timeline pastoral · PII) · RLS contextual ─────────
-- Sem membro_id próprio (é filho de cui_acompanhamentos via acompanhamento_id),
-- então gate por nível de módulo, igual ao resto da família cui_* (Onda 2 PII).
DROP POLICY IF EXISTS "cui_atendimentos_select" ON public.cui_atendimentos;
DROP POLICY IF EXISTS "cui_atendimentos_insert" ON public.cui_atendimentos;
DROP POLICY IF EXISTS "cui_atendimentos_update" ON public.cui_atendimentos;
DROP POLICY IF EXISTS "cui_atendimentos_delete" ON public.cui_atendimentos;

CREATE POLICY "cui_atendimentos_select" ON public.cui_atendimentos FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('cuidados')   >= 1
    OR public.current_user_module_level('integracao') >= 1
    OR public.is_super_admin()
  );
CREATE POLICY "cui_atendimentos_insert" ON public.cui_atendimentos FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('cuidados')   >= 2
    OR public.current_user_module_level('integracao') >= 2
    OR public.is_super_admin()
  );
CREATE POLICY "cui_atendimentos_update" ON public.cui_atendimentos FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('cuidados')   >= 3
    OR public.current_user_module_level('integracao') >= 3
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.current_user_module_level('cuidados')   >= 3
    OR public.current_user_module_level('integracao') >= 3
    OR public.is_super_admin()
  );
CREATE POLICY "cui_atendimentos_delete" ON public.cui_atendimentos FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "cui_atendimentos_service" ON public.cui_atendimentos;
CREATE POLICY "cui_atendimentos_service" ON public.cui_atendimentos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── #4 · fin_metas_progresso · remove a assinatura antiga (2 args) ───────────
-- A migration 20260529070000 recriou a função com um 3º param (p_meta_id DEFAULT
-- NULL) mas NÃO dropou a versão (date,date). As duas coexistem e a chamada de 2
-- args fica ambígua. Dropar a antiga deixa só a de 3 args (financeiroV2.js chama
-- com 2 args → resolve pra p_meta_id=NULL).
DROP FUNCTION IF EXISTS public.fin_metas_progresso(date, date);

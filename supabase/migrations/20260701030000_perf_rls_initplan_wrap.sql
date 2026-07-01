-- Performance · auth_rls_initplan (Supabase lint 0003 · 2026-07-01)
--
-- Envolve auth.uid()/auth.role() em (select ...) para o Postgres avaliar a
-- função UMA vez por query (initplan) em vez de UMA vez por linha. Ganho de
-- performance em leituras via anon key (frontend/app); o backend usa
-- service_role e bypassa a RLS, então o ganho concentra-se nas tabelas lidas
-- direto pelo cliente.
--
-- SEGURANÇA: usa ALTER POLICY, que altera SOMENTE a expressão — preserva
-- comando (cmd) e roles. A expressão é SEMANTICAMENTE IDÊNTICA (apenas
-- embrulhada em `(select ...)`), então NÃO há mudança de quem acessa o quê.
-- Escopo: apenas policies com auth.* CRU cujas definições exatas foram
-- confirmadas no export do pg_policies. As tabelas mem_*/kpi_*/cultos/nsm_*
-- ficam para uma 2ª leva (dependem do restante do export).

-- ── app_notificacoes · por usuário, alta frequência no app ──────────────────
ALTER POLICY notif_propria_marcar_lida ON public.app_notificacoes
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY notif_propria_select ON public.app_notificacoes
  USING ((select auth.uid()) = user_id);

-- ── app_push_tokens ─────────────────────────────────────────────────────────
ALTER POLICY push_tokens_proprio ON public.app_push_tokens
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ── app_inscricoes (2 policies idênticas · duplicate_policy à parte) ─────────
ALTER POLICY app_inscricoes_own ON public.app_inscricoes
  USING ((select auth.uid()) = auth_user_id);
ALTER POLICY own ON public.app_inscricoes
  USING ((select auth.uid()) = auth_user_id);

-- ── app_tutorial_progress ───────────────────────────────────────────────────
ALTER POLICY app_tutorial_progress_delete ON public.app_tutorial_progress
  USING (user_id = (select auth.uid()));
ALTER POLICY app_tutorial_progress_insert ON public.app_tutorial_progress
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY app_tutorial_progress_select ON public.app_tutorial_progress
  USING (user_id = (select auth.uid()));

-- ── app_solicitacoes_exclusao ───────────────────────────────────────────────
ALTER POLICY solic_excl_insert_propria ON public.app_solicitacoes_exclusao
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY solic_excl_select_propria ON public.app_solicitacoes_exclusao
  USING ((select auth.uid()) = user_id);
ALTER POLICY solic_excl_admin_select ON public.app_solicitacoes_exclusao
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));

-- ── audit_log · auth.role() ─────────────────────────────────────────────────
ALTER POLICY audit_read ON public.audit_log
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY audit_write ON public.audit_log
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- ── Padrão admin EXISTS(profiles) · qual (e with_check quando existia) ───────
ALTER POLICY agent_runs_admin ON public.agent_runs
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY agent_steps_admin ON public.agent_steps
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY arquivei_config_admin ON public.arquivei_config
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY destaques_admin ON public.app_destaques
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY area_alcadas_admin ON public.area_alcadas
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY asr_admin_write ON public.area_solicitacoes_responsaveis
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY areas_kpi_write_admin ON public.areas_kpi
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));

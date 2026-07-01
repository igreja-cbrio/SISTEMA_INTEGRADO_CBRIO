-- Performance · auth_rls_initplan 2ª leva (Supabase lint 0003 · 2026-07-01)
--
-- Continuação de 20260701030000: envolve auth.uid()/auth.role() em (select ...)
-- nas policies das tabelas de MAIOR VOLUME lidas direto via anon key
-- (mem_*, kpi_*, cultos_dados_submissoes, nsm_estado, next_*).
--
-- SEGURANÇA: ALTER POLICY altera SOMENTE a expressão (preserva cmd/roles);
-- expressão semanticamente idêntica → sem mudança de acesso, só performance.
-- Definições confirmadas no export do pg_policies.

-- ── cultos_dados_submissoes ─────────────────────────────────────────────────
ALTER POLICY cultos_dados_submissoes_select ON public.cultos_dados_submissoes
  USING (((submitted_by = (select auth.uid())) OR (current_user_module_level('integracao'::text) >= 1) OR is_super_admin()));

-- ── kpi_* · leituras (auth.role()) ──────────────────────────────────────────
ALTER POLICY kpi_direcionadores_read ON public.kpi_direcionadores
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY kpi_estrategicos_read ON public.kpi_estrategicos
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY kpi_taticos_read ON public.kpi_indicadores_taticos
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY kpi_nsm_read ON public.kpi_nsm
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY kpi_registros_read ON public.kpi_registros
  USING ((select auth.role()) = 'authenticated'::text);

-- ── kpi_* · escrita admin (EXISTS profiles) ─────────────────────────────────
ALTER POLICY kpi_krs_write_admin ON public.kpi_krs
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY metas_inst_write_admin ON public.kpi_metas_institucionais
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY obj_geral_write_admin ON public.kpi_objetivos_gerais
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));

-- ── mem_* · leitura (auth.role()) + escrita admin (EXISTS, with_check null) ──
ALTER POLICY mem_familias_select ON public.mem_familias
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY mem_familias_write ON public.mem_familias
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY mem_historico_select ON public.mem_historico
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY mem_historico_write ON public.mem_historico
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));
ALTER POLICY mem_trilha_select ON public.mem_trilha_valores
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY mem_trilha_write ON public.mem_trilha_valores
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));

-- ── next_* · leituras (auth.role()) ─────────────────────────────────────────
ALTER POLICY next_eventos_read ON public.next_eventos
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY next_indicacoes_read ON public.next_indicacoes
  USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY next_inscricoes_read ON public.next_inscricoes
  USING ((select auth.role()) = 'authenticated'::text);

-- ── nsm_estado · escrita admin (EXISTS) ─────────────────────────────────────
ALTER POLICY nsm_estado_write_admin ON public.nsm_estado
  USING (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::text, 'diretor'::text])))));

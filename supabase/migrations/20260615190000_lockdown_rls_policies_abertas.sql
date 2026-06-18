-- Lockdown de policies RLS abertas (auditoria de segurança 2026-06-15)
--
-- Contexto: o frontend usa a ANON KEY e acessa o banco direto; o backend usa
-- service_role (bypassa RLS). Confirmado por varredura do src/: NENHUMA das
-- tabelas abaixo é lida/escrita diretamente pelo frontend — todas são servidas
-- pelo backend (service_role). Logo, restringir o write a service_role NÃO quebra
-- nenhuma feature, e fecha o acesso indevido pela anon key.
--
-- Achados corrigidos (confirmados no pg_policies vivo, 2026-06-15):
--   🔴 vol_* (13 tabelas): policy "service_role_all" estava TO {public} (= inclui
--      anon!) com USING(true) — qualquer pessoa, até sem login, fazia CRUD em todo
--      o voluntariado, incl. PII de vol_profiles (nome/CPF/email/telefone) e QR codes.
--   🟠 mem_cadastros_pendentes: INSERT por anon + UPDATE/DELETE por qualquer logado.
--   🟠 rh_avaliacao_fatores: UPDATE aberto a qualquer logado (adultera avaliação RH).
--   🟡 cerebro_config/cerebro_fila: qualquer logado reconfigurava/injetava a fila.
--   🟡 operacionais (integridade): card_completions, cultura_mensal, event_reports,
--      event_task_attachments, expansion_*, planejamento_ciclos, project_*,
--      pense_videos, kids_chamadas (writes).
--
-- Padrão do fix: garantir RLS habilitada, dropar a policy permissiva pelo nome
-- exato (visto no pg_policies), e recriar acesso só para service_role (o canal
-- real do app). Idempotente (DROP ... IF EXISTS).

-- Helper inline: aplica o padrão "service_role FOR ALL" sem precisar repetir.
-- (Postgres não tem CREATE POLICY IF NOT EXISTS, por isso DROP antes.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 vol_* — fechar o acesso público (anon + authenticated) a todo o voluntariado
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vol_availability','vol_check_ins','vol_positions','vol_profiles',
    'vol_schedules','vol_service_types','vol_services','vol_sync_logs',
    'vol_team_members','vol_teams','vol_training_checkins','vol_user_roles',
    'vol_volunteer_qrcodes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    -- a policy aberta se chamava "service_role_all" mas estava TO public
    EXECUTE format('DROP POLICY IF EXISTS service_role_all ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I;', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 🟠 mem_cadastros_pendentes — remover anon INSERT + write authenticated aberto
--    (o form público grava via backend /api/public, service_role)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.mem_cadastros_pendentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public insert mem_cadastros_pendentes"        ON public.mem_cadastros_pendentes;
DROP POLICY IF EXISTS "Authenticated update mem_cadastros_pendentes" ON public.mem_cadastros_pendentes;
DROP POLICY IF EXISTS "Authenticated delete mem_cadastros_pendentes" ON public.mem_cadastros_pendentes;
DROP POLICY IF EXISTS "Authenticated select mem_cadastros_pendentes" ON public.mem_cadastros_pendentes;
DROP POLICY IF EXISTS mem_cadastros_pendentes_service ON public.mem_cadastros_pendentes;
CREATE POLICY mem_cadastros_pendentes_service ON public.mem_cadastros_pendentes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- leitura para staff de membresia (admin lê a fila via backend, mas mantém consistência)
DROP POLICY IF EXISTS mem_cadastros_pendentes_read ON public.mem_cadastros_pendentes;
CREATE POLICY mem_cadastros_pendentes_read ON public.mem_cadastros_pendentes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('membresia') >= 1 OR public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 🟠 rh_avaliacao_fatores — UPDATE só para RH nível >= 3 (era aberto a qualquer logado)
--    (não toca as demais policies da tabela, criadas na Onda 2)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.rh_avaliacao_fatores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rh_avaliacao_fatores_update ON public.rh_avaliacao_fatores;
CREATE POLICY rh_avaliacao_fatores_update ON public.rh_avaliacao_fatores
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('rh') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('rh') >= 3 OR public.is_super_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 🟡 cerebro_config / cerebro_fila — só service_role (backend controla a fila)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('cerebro_config','cerebro_config_all'),
    ('cerebro_fila','cerebro_fila_all')
  ) AS x(tbl, pol) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.pol, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I;', r.tbl, r.tbl);
    EXECUTE format(
      'CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      r.tbl, r.tbl);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 🟡 Operacionais (integridade de dado) — write só service_role.
--    Drop da policy ALL aberta pelo nome exato e recriação service_role-only.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('card_completions','completions_all'),
    ('cultura_mensal','cultura_write'),
    ('event_reports','report_all'),
    ('event_task_attachments','attach_all'),
    ('expansion_milestones','exp_ms_all'),
    ('expansion_subtasks','exp_subs_all'),
    ('expansion_tasks','exp_tasks_all'),
    ('planejamento_ciclos','planejamento_ciclos_auth'),
    ('project_budget_items','proj_budget_all'),
    ('project_kpis','proj_kpis_all'),
    ('project_phases','proj_phases_all'),
    ('project_retrospectives','proj_retro_all'),
    ('project_risks','proj_risks_all'),
    ('pense_videos','pense_write')
  ) AS x(tbl, pol) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.pol, r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I;', r.tbl, r.tbl);
    EXECUTE format(
      'CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      r.tbl, r.tbl);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 🟡 kids_chamadas — só os WRITES (a policy de SELECT existente fica como está)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kids_chamadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kids_chamadas_write  ON public.kids_chamadas;
DROP POLICY IF EXISTS kids_chamadas_update ON public.kids_chamadas;
DROP POLICY IF EXISTS kids_chamadas_delete ON public.kids_chamadas;
DROP POLICY IF EXISTS kids_chamadas_service ON public.kids_chamadas;
CREATE POLICY kids_chamadas_service ON public.kids_chamadas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

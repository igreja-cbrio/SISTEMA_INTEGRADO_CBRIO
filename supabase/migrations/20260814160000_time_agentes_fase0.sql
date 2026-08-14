-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 0 · TIME DE AGENTES
-- Board de tarefas dos agentes + roster (agent_team) + job description
-- versionada (agent_instrucoes). Acesso exclusivo a super-admins
-- (app_super_admins · is_super_admin()) + service_role.
-- ADITIVA e idempotente · não toca em tabelas existentes (só ADD COLUMN).
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. agent_team · roster do time (catálogo · sem PII)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_team (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key              text NOT NULL UNIQUE,
  nome                   text NOT NULL,
  classe                 text NOT NULL DEFAULT 'watcher'
                           CHECK (classe IN ('dev','cyber','auditoria','executor','watcher')),
  modelo                 text,
  ativo                  boolean NOT NULL DEFAULT true,
  orcamento_tarefa_usd   numeric(10,2) NOT NULL DEFAULT 5.00,
  custo_estimado_mes_usd numeric(10,2) NOT NULL DEFAULT 0,
  ultima_atividade_em    timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_team IS
  'Roster do time de agentes: cada linha = 1 membro (watcher/executor/auditoria/cyber/dev) administrado como um funcionário. Super-admin gerencia.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. agent_instrucoes · job description versionada (raw + estruturado)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_instrucoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key      text NOT NULL REFERENCES public.agent_team(agent_key) ON DELETE CASCADE,
  versao         integer NOT NULL DEFAULT 1,
  raw_instrucoes text NOT NULL DEFAULT '',
  estruturado    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo          boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (agent_key, versao)
);

CREATE INDEX IF NOT EXISTS idx_agent_instrucoes_ativa
  ON public.agent_instrucoes (agent_key) WHERE ativo AND deleted_at IS NULL;

COMMENT ON TABLE public.agent_instrucoes IS
  'Job description de cada agente, versionada. raw_instrucoes = texto livre digitado pelo super-admin; estruturado = JSON {titulo_cargo, descricao, responsabilidades[], permitido[], proibido[]} gerado/revisado por IA. Só a versão ativa é injetada no system prompt do agente.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. agent_tarefas · board de tarefas do time
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_tarefas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo           text NOT NULL,
  descricao        text NOT NULL DEFAULT '',
  classe           text NOT NULL DEFAULT 'watcher',
  agente_key       text REFERENCES public.agent_team(agent_key) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'nova'
                     CHECK (status IN ('nova','agendada','em_andamento','aguardando_revisao','aguardando_aprovacao','concluida','falhou','bloqueada','cancelada')),
  prioridade       text NOT NULL DEFAULT 'media'
                     CHECK (prioridade IN ('baixa','media','alta','critica')),
  origem           text NOT NULL DEFAULT 'manual'
                     CHECK (origem IN ('manual','web','whatsapp','app','cron')),
  orcamento_usd    numeric(10,2),
  gate             text CHECK (gate IN ('G1','G2','execucao','revisao')),
  pull_request_url text,
  branch           text,
  queue_ids        uuid[] NOT NULL DEFAULT '{}',
  run_ids          uuid[] NOT NULL DEFAULT '{}',
  aprovada_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  aprovada_em      timestamptz,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_tarefas_status ON public.agent_tarefas (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tarefas_agente ON public.agent_tarefas (agente_key) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.agent_tarefas IS
  'Tarefas do time de agentes. ⚠️ Regra LGPD: descricao nunca contém PII — referenciar dados por id/slug, não CPF/nome/telefone.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. agent_task_comments · comentários por tarefa
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_task_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id  uuid NOT NULL REFERENCES public.agent_tarefas(id) ON DELETE CASCADE,
  autor_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  texto      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_task_comments_tarefa ON public.agent_task_comments (tarefa_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. agent_task_events · audit trail das transições (append-only)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_task_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id  uuid NOT NULL REFERENCES public.agent_tarefas(id) ON DELETE CASCADE,
  evento     text NOT NULL,
  detalhe    jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_task_events_tarefa ON public.agent_task_events (tarefa_id, created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. task_id nas tabelas de execução existentes (link tarefa → run/proposta)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_runs  ADD COLUMN IF NOT EXISTS task_id uuid;
ALTER TABLE public.agent_queue ADD COLUMN IF NOT EXISTS task_id uuid;
CREATE INDEX IF NOT EXISTS idx_agent_runs_task  ON public.agent_runs (task_id);
CREATE INDEX IF NOT EXISTS idx_agent_queue_task ON public.agent_queue (task_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Whitelist de soft-delete (+ agent_tarefas, agent_instrucoes, comments)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $function$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios',
    'kids_estoque','kpi_indicadores_taticos','kpi_metas','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','marketing_entregaveis','marketing_kanban_cards',
    'marketing_membros','mem_contribuicoes','mem_devocionais','mem_familias',
    'mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios',
    'mem_vinculos_familiares','next_matriculas','next_turmas','nsm_eventos',
    'pcs_progressoes','projects','rh_documentos','rh_funcionarios','solicitacoes',
    'usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes','log_compras',
    'fin_contas_pagar','cui_primeiro_contato_fila','cui_batismo_next_fila',
    'governance_meetings','governance_meeting_docs','governance_memoria',
    'apresentacao_criancas','ext_eventos','ext_inscricoes',
    'vol_email_disparos','vol_email_disparo_destinatarios',
    'nps_pesquisas','mem_contatos',
    'agent_tarefas','agent_instrucoes','agent_task_comments'
  ]::TEXT[]
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RLS · todas as novas tabelas: só super-admin lê/grava · service_role tudo
--    (padrão do sistema: helper is_super_admin · sem USING(true) em authed)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_team            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_instrucoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tarefas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_events     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_team_select ON public.agent_team;
CREATE POLICY agent_team_select ON public.agent_team FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_team_insert ON public.agent_team;
CREATE POLICY agent_team_insert ON public.agent_team FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_team_update ON public.agent_team;
CREATE POLICY agent_team_update ON public.agent_team FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_team_delete ON public.agent_team;
CREATE POLICY agent_team_delete ON public.agent_team FOR DELETE TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_team_service ON public.agent_team;
CREATE POLICY agent_team_service ON public.agent_team FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_instrucoes_select ON public.agent_instrucoes;
CREATE POLICY agent_instrucoes_select ON public.agent_instrucoes FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_instrucoes_insert ON public.agent_instrucoes;
CREATE POLICY agent_instrucoes_insert ON public.agent_instrucoes FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_instrucoes_update ON public.agent_instrucoes;
CREATE POLICY agent_instrucoes_update ON public.agent_instrucoes FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_instrucoes_delete ON public.agent_instrucoes;
CREATE POLICY agent_instrucoes_delete ON public.agent_instrucoes FOR DELETE TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_instrucoes_service ON public.agent_instrucoes;
CREATE POLICY agent_instrucoes_service ON public.agent_instrucoes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_tarefas_select ON public.agent_tarefas;
CREATE POLICY agent_tarefas_select ON public.agent_tarefas FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_tarefas_insert ON public.agent_tarefas;
CREATE POLICY agent_tarefas_insert ON public.agent_tarefas FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_tarefas_update ON public.agent_tarefas;
CREATE POLICY agent_tarefas_update ON public.agent_tarefas FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_tarefas_delete ON public.agent_tarefas;
CREATE POLICY agent_tarefas_delete ON public.agent_tarefas FOR DELETE TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_tarefas_service ON public.agent_tarefas;
CREATE POLICY agent_tarefas_service ON public.agent_tarefas FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_task_comments_select ON public.agent_task_comments;
CREATE POLICY agent_task_comments_select ON public.agent_task_comments FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_comments_insert ON public.agent_task_comments;
CREATE POLICY agent_task_comments_insert ON public.agent_task_comments FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_comments_update ON public.agent_task_comments;
CREATE POLICY agent_task_comments_update ON public.agent_task_comments FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_comments_delete ON public.agent_task_comments;
CREATE POLICY agent_task_comments_delete ON public.agent_task_comments FOR DELETE TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_comments_service ON public.agent_task_comments;
CREATE POLICY agent_task_comments_service ON public.agent_task_comments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS agent_task_events_select ON public.agent_task_events;
CREATE POLICY agent_task_events_select ON public.agent_task_events FOR SELECT TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_events_insert ON public.agent_task_events;
CREATE POLICY agent_task_events_insert ON public.agent_task_events FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_events_update ON public.agent_task_events;
CREATE POLICY agent_task_events_update ON public.agent_task_events FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_events_delete ON public.agent_task_events;
CREATE POLICY agent_task_events_delete ON public.agent_task_events FOR DELETE TO authenticated
  USING (public.is_super_admin());
DROP POLICY IF EXISTS agent_task_events_service ON public.agent_task_events;
CREATE POLICY agent_task_events_service ON public.agent_task_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Seed do roster · auditores existentes + executor + watcher + cyber + dev
--    (dev nasce inativo — só é ativado na Fase 2, quando houver runner + token)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.agent_team (agent_key, nome, classe, modelo, ativo, orcamento_tarefa_usd, custo_estimado_mes_usd) VALUES
  ('system_auditor',      'Auditor Geral',      'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 20.00),
  ('design_auditor',      'Agente Design',      'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 20.00),
  ('cyber_agent',         'Agente Cyber',       'cyber',     'claude-haiku-4-5-20251001', true, 2.00, 40.00),
  ('developer_agent',     'Agente Desenvolvedor','dev',      'claude-sonnet-4-6',        false, 10.00, 0.00),
  ('module_rh',           'Agente RH',           'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_financeiro',   'Agente Financeiro',   'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_logistica',    'Agente Logística',    'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_patrimonio',   'Agente Patrimônio',   'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_eventos',      'Agente Eventos',      'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_projetos',     'Agente Projetos',     'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_membresia',    'Agente Membresia',     'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_integracao',   'Agente Integração',   'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_next',         'Agente NEXT',         'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_grupos',       'Agente Grupos',       'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_cuidados',     'Agente Cuidados',     'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_voluntariado', 'Agente Voluntariado', 'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_nps',          'Agente NPS',          'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_cerebro',      'Agente Cérebro',      'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_kpis',         'Agente KPIs/OKR',     'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('module_governanca',   'Agente Governança',   'auditoria', 'claude-haiku-4-5-20251001', true, 1.00, 15.00),
  ('financeiro_executor', 'Executor Financeiro', 'executor',  'claude-sonnet-4-6',        true, 5.00, 40.00),
  ('kpis_watcher',        'Watcher de KPIs/OKRs','watcher',   'claude-haiku-4-5-20251001', true, 2.00, 30.00)
ON CONFLICT (agent_key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. Seed da job description inicial (1ª versão) para todo membro do roster
--     Template por classe · super-admin refina depois pelo hub.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_est jsonb;
  v_permitido jsonb;
  v_proibido jsonb;
BEGIN
  FOR r IN SELECT * FROM public.agent_team LOOP
    IF EXISTS (SELECT 1 FROM public.agent_instrucoes WHERE agent_key = r.agent_key) THEN
      CONTINUE;
    END IF;
    v_permitido := jsonb_build_array(
      'Ler dados do escopo do agente',
      'Propor ações que entram na fila de aprovação humana (review-before-apply)',
      'Reportar achados, alertas e impedimentos'
    );
    v_proibido := jsonb_build_array(
      'Aplicar qualquer ação diretamente sem aprovação humana',
      'Expor dados sensíveis / PII (LGPD · convicção religiosa é categoria especial)',
      'Alterar regras de segurança, permissões ou RLS',
      'Executar fora do escopo definido na tarefa'
    );
    IF r.classe = 'dev' THEN
      v_permitido := jsonb_build_array(
        'Implementar em branch de feature própria',
        'Abrir PR e aguardar revisão humana',
        'Rodar testes e lint localmente'
      );
      v_proibido := jsonb_build_array(
        'Mergear o próprio PR',
        'Aplicar migrations no Supabase de produção',
        'Acessar credenciais de banco de produção',
        'Alterar políticas de autenticação/RLS',
        'Forçar push ou reset em branches remotas'
      );
    ELSIF r.classe = 'cyber' THEN
      v_permitido := jsonb_build_array(
        'Auditar (leitura) configurações, logs e permissões',
        'Reportar vulnerabilidades e não-conformidades de segurança'
      );
      v_proibido := jsonb_build_array(
        'Fazer qualquer escrita/alteração no banco',
        'Expor PII em achados (descrever sem nomes/CPFs)',
        'Testar exploits em ambiente de produção'
      );
    END IF;
    v_est := jsonb_build_object(
      'titulo_cargo', r.nome,
      'descricao', 'Membro do time de agentes da CBRio, classe ' || r.classe || '. Atua nas tarefas designadas no board, respeitando as regras do sistema.',
      'responsabilidades', jsonb_build_array(
        'Executar as tarefas designadas no board',
        'Reportar progresso, achados e impedimentos',
        'Seguir as instruções desta job description e as regras duras do sistema'
      ),
      'permitido', v_permitido,
      'proibido', v_proibido
    );
    INSERT INTO public.agent_instrucoes (agent_key, versao, raw_instrucoes, estruturado, ativo, created_by)
    VALUES (r.agent_key, 1, 'Instrução inicial padrão para a classe ' || r.classe || '. Editar pelo hub: Agentes & Auditoria → Membros.', v_est, true, NULL);
  END LOOP;
END $$;

-- ⚠️ NOTA: rodar `NOTIFY pgrst, 'reload schema'` após aplicar no SQL Editor
-- (ou aplicar pelo painel do Supabase, que já recarrega o schema).

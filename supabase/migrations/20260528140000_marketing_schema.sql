-- ============================================================================
-- MIGRATION · Marketing · Schema base (Spec 002)
-- ============================================================================
-- 7 tabelas + 2 triggers + RLS + indices + whitelist soft-delete
--
-- Tabelas:
--   1. marketing_membros               · equipe + habilidades
--   2. marketing_etiquetas_tipo        · catalogo 8 valores (taxonomia DUPLA · tipo)
--   3. marketing_etiquetas_destino     · catalogo 5 valores (taxonomia DUPLA · destino)
--   4. marketing_kanban_cards          · 3 origens (solicitacao/evento/interna)
--   5. marketing_entregaveis           · arquivos no SharePoint
--   6. marketing_capacidade_override   · ferias/picos/atipicos
--   7. marketing_compromissos_recorrentes · slots fixos (D-13)
--
-- Decisoes herdadas das fases anteriores:
--   D-09: SharePoint (Microsoft Graph · sharepointMarketing.js futuro)
--   D-13: recorrentes editaveis pela UI (Spec 009 admin)
--   D-14: 1 revisao max · tem_revisao boolean + vai pro FIM da fila
--
-- FK event_tasks (nao "kanban_tasks" como doc original sugeria) · confirmado
-- via SELECT em information_schema 2026-05-28.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. marketing_membros · equipe + habilidades
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_membros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  habilidade      text NOT NULL CHECK (habilidade IN
                    ('videomaker','fotografo','designer','social_media','social_media_assistente')),
  horas_semanais  numeric NOT NULL DEFAULT 30 CHECK (horas_semanais > 0),
  ativo           boolean NOT NULL DEFAULT true,
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (profile_id, habilidade)
);

CREATE INDEX IF NOT EXISTS idx_marketing_membros_active
  ON public.marketing_membros (profile_id, habilidade)
  WHERE deleted_at IS NULL AND ativo = true;

COMMENT ON TABLE public.marketing_membros IS
  'Equipe Marketing CBRio · habilidade unica por membro. Boost de permissao em /marketing vem da area "Marketing" no profile (Spec 003).';

-- ----------------------------------------------------------------------------
-- 2. marketing_etiquetas_tipo · catalogo 8 valores
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_etiquetas_tipo (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               text UNIQUE NOT NULL,
  nome               text NOT NULL,
  habilidade_padrao  text CHECK (habilidade_padrao IN
                       ('videomaker','fotografo','designer','social_media','social_media_assistente')),
  esforco_medio_h    numeric CHECK (esforco_medio_h IS NULL OR esforco_medio_h >= 0),
  cor                text,
  ativo              boolean NOT NULL DEFAULT true,
  ordem              smallint NOT NULL DEFAULT 100,
  created_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.marketing_etiquetas_tipo (slug, nome, habilidade_padrao, cor, ordem) VALUES
  ('redes_sociais',    'Redes Sociais',       'social_media', '#E11D48', 10),
  ('artes',            'Artes',               'designer',     '#A855F7', 20),
  ('pecas_fisicas',    'Pecas Fisicas',       'designer',     '#7C3AED', 30),
  ('mockup',           'Mockup',              'designer',     '#6366F1', 40),
  ('videos',           'Videos',              'videomaker',   '#0EA5E9', 50),
  ('fotos',            'Fotos',               'fotografo',    '#10B981', 60),
  ('impressos',        'Impressos',           'designer',     '#F59E0B', 70),
  ('identidade_marca', 'Identidade da Marca', 'designer',     '#EC4899', 80)
ON CONFLICT (slug) DO UPDATE
  SET nome              = EXCLUDED.nome,
      habilidade_padrao = EXCLUDED.habilidade_padrao,
      cor               = COALESCE(public.marketing_etiquetas_tipo.cor, EXCLUDED.cor),
      ordem             = EXCLUDED.ordem;

-- ----------------------------------------------------------------------------
-- 3. marketing_etiquetas_destino · catalogo 5 valores
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_etiquetas_destino (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  nome        text NOT NULL,
  cor         text,
  ativo       boolean NOT NULL DEFAULT true,
  ordem       smallint NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.marketing_etiquetas_destino (slug, nome, cor, ordem) VALUES
  ('interno',        'Interno',          '#64748B', 10),
  ('externo',        'Externo',          '#0EA5E9', 20),
  ('institucional',  'Institucional',    '#7C3AED', 30),
  ('eventos_series', 'Eventos e Series', '#10B981', 40),
  ('campanhas',      'Campanhas',        '#F59E0B', 50)
ON CONFLICT (slug) DO UPDATE
  SET nome  = EXCLUDED.nome,
      cor   = COALESCE(public.marketing_etiquetas_destino.cor, EXCLUDED.cor),
      ordem = EXCLUDED.ordem;

-- ----------------------------------------------------------------------------
-- 4. marketing_kanban_cards · cards do Kanban (3 origens)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_kanban_cards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem                text NOT NULL CHECK (origem IN ('solicitacao','evento','interna')),
  solicitacao_id        uuid REFERENCES public.solicitacoes(id) ON DELETE SET NULL,
  evento_task_id        uuid REFERENCES public.event_tasks(id) ON DELETE SET NULL,
  titulo                text NOT NULL,
  descricao             text,
  etiqueta_tipo_id      uuid REFERENCES public.marketing_etiquetas_tipo(id) ON DELETE SET NULL,
  etiqueta_destino_id   uuid REFERENCES public.marketing_etiquetas_destino(id) ON DELETE SET NULL,
  atribuido_a           uuid REFERENCES public.marketing_membros(id) ON DELETE SET NULL,
  prazo_preliminar      timestamptz,
  prazo_confirmado      timestamptz,
  estado                text NOT NULL DEFAULT 'fila' CHECK (estado IN
                          ('fila','em_producao','aguardando_solicitante','concluido')),
  estado_atualizado_em  timestamptz NOT NULL DEFAULT now(),
  tem_revisao           boolean NOT NULL DEFAULT false,
  motivo_revisao        text,
  ordem_fila            bigserial,
  raia_rapida           boolean NOT NULL DEFAULT false,
  entregue_em           timestamptz,
  criado_por            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT marketing_cards_origem_fk_check CHECK (
    (origem = 'solicitacao' AND solicitacao_id IS NOT NULL AND evento_task_id IS NULL) OR
    (origem = 'evento'      AND evento_task_id IS NOT NULL AND solicitacao_id IS NULL) OR
    (origem = 'interna'     AND solicitacao_id IS NULL     AND evento_task_id IS NULL)
  )
);

-- Origem solicitacao: 1 card por solicitacao (idempotencia)
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_cards_solicitacao
  ON public.marketing_kanban_cards (solicitacao_id)
  WHERE solicitacao_id IS NOT NULL AND deleted_at IS NULL;

-- Origem evento: 1 card por event_task (idempotencia)
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_cards_evento_task
  ON public.marketing_kanban_cards (evento_task_id)
  WHERE evento_task_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_cards_estado
  ON public.marketing_kanban_cards (estado, ordem_fila)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_cards_atribuido
  ON public.marketing_kanban_cards (atribuido_a, estado)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_cards_origem
  ON public.marketing_kanban_cards (origem, solicitacao_id, evento_task_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_cards_raia
  ON public.marketing_kanban_cards (raia_rapida, estado)
  WHERE raia_rapida = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_cards_prazo
  ON public.marketing_kanban_cards (prazo_confirmado)
  WHERE prazo_confirmado IS NOT NULL AND estado IN ('fila','em_producao') AND deleted_at IS NULL;

COMMENT ON TABLE public.marketing_kanban_cards IS
  'Cards do Kanban Marketing. 3 origens com FK constraint enforced. ordem_fila bigserial · revisao (D-14) atualiza pro fim via trigger fn_marketing_cards_estado_ts.';

-- Trigger · estado timestamp + entregue_em + ordem na revisao
CREATE OR REPLACE FUNCTION public.fn_marketing_cards_estado_ts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Atualiza timestamp quando muda de estado
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    NEW.estado_atualizado_em := now();
  END IF;

  -- Marca entregue_em na transicao pra concluido
  IF NEW.estado = 'concluido' AND OLD.estado IS DISTINCT FROM 'concluido' AND NEW.entregue_em IS NULL THEN
    NEW.entregue_em := now();
  END IF;

  -- Revisao sugerida (D-14) · vai pro FIM da fila
  IF NEW.tem_revisao = true AND COALESCE(OLD.tem_revisao, false) = false THEN
    NEW.ordem_fila := nextval('public.marketing_kanban_cards_ordem_fila_seq');
  END IF;

  -- updated_at default
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_marketing_cards_estado_ts ON public.marketing_kanban_cards;
CREATE TRIGGER tg_marketing_cards_estado_ts
  BEFORE UPDATE ON public.marketing_kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.fn_marketing_cards_estado_ts();

-- Audit log
DROP TRIGGER IF EXISTS trg_audit_marketing_cards ON public.marketing_kanban_cards;
CREATE TRIGGER trg_audit_marketing_cards
  AFTER INSERT OR UPDATE OR DELETE ON public.marketing_kanban_cards
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
    'estado,atribuido_a,prazo_confirmado,tem_revisao,raia_rapida,deleted_at'
  );

-- ----------------------------------------------------------------------------
-- 5. marketing_entregaveis · arquivos no SharePoint
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_entregaveis (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id              uuid NOT NULL REFERENCES public.marketing_kanban_cards(id) ON DELETE CASCADE,
  sharepoint_path      text NOT NULL,
  sharepoint_item_id   text,
  nome_arquivo         text NOT NULL,
  tipo_mime            text,
  tamanho_bytes        bigint CHECK (tamanho_bytes IS NULL OR tamanho_bytes >= 0),
  enviado_por          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  enviado_em           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_marketing_entregaveis_card
  ON public.marketing_entregaveis (card_id, enviado_em DESC)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 6. marketing_capacidade_override · ferias / pico / atipicos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_capacidade_override (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id           uuid NOT NULL REFERENCES public.marketing_membros(id) ON DELETE CASCADE,
  semana_inicio       date NOT NULL,  -- segunda-feira
  horas_disponiveis   numeric NOT NULL CHECK (horas_disponiveis >= 0),
  motivo              text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at          timestamptz,
  UNIQUE (membro_id, semana_inicio)
);

CREATE INDEX IF NOT EXISTS idx_marketing_capacidade_override_semana
  ON public.marketing_capacidade_override (semana_inicio, membro_id)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 7. marketing_compromissos_recorrentes · D-13 (slots fixos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_compromissos_recorrentes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id   uuid NOT NULL REFERENCES public.marketing_membros(id) ON DELETE CASCADE,
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=Dom, 6=Sab
  hora_inicio time NOT NULL,
  duracao_h   numeric NOT NULL CHECK (duracao_h > 0),
  descricao   text NOT NULL,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_marketing_recorrentes_membro
  ON public.marketing_compromissos_recorrentes (membro_id, dia_semana)
  WHERE deleted_at IS NULL AND ativo = true;

-- ----------------------------------------------------------------------------
-- 8. Whitelist soft-delete · 5 tabelas novas com deleted_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'mem_membros','mem_familias','mem_grupos','mem_grupo_membros','mem_voluntarios',
    'mem_contribuicoes','mem_trilha_valores','mem_devocionais','mem_historico',
    'mem_grupo_encontros','mem_grupo_pedidos','cultos','cultos_decisoes_pessoas',
    'batismo_inscricoes','nsm_eventos','kids_criancas','kids_checkins','kids_sessoes',
    'cui_jornada180','cui_acompanhamentos','cui_convertidos','int_visitantes',
    'kpi_indicadores_taticos','kpi_metas','rh_funcionarios',
    'rh_documentos','pcs_progressoes','projects','solicitacoes','usuarios',
    -- Marketing (Spec 002 · 2026-05-28)
    'marketing_membros','marketing_kanban_cards','marketing_entregaveis',
    'marketing_capacidade_override','marketing_compromissos_recorrentes'
  ]::TEXT[]
$$;

-- ============================================================================
-- 9. RLS por tabela (06-seguranca-autorizacao.md)
-- ============================================================================

-- marketing_membros · leitura nivel>=1 · write nivel>=5
ALTER TABLE public.marketing_membros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_membros_select ON public.marketing_membros;
CREATE POLICY marketing_membros_select ON public.marketing_membros
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 1
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_membros_insert ON public.marketing_membros;
CREATE POLICY marketing_membros_insert ON public.marketing_membros
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_membros_update ON public.marketing_membros;
CREATE POLICY marketing_membros_update ON public.marketing_membros
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_membros_delete ON public.marketing_membros;
CREATE POLICY marketing_membros_delete ON public.marketing_membros
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS marketing_membros_service ON public.marketing_membros;
CREATE POLICY marketing_membros_service ON public.marketing_membros
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- marketing_etiquetas_tipo · catalogo · read all auth · write super-admin
ALTER TABLE public.marketing_etiquetas_tipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_etiquetas_tipo_select ON public.marketing_etiquetas_tipo;
CREATE POLICY marketing_etiquetas_tipo_select ON public.marketing_etiquetas_tipo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS marketing_etiquetas_tipo_write ON public.marketing_etiquetas_tipo;
CREATE POLICY marketing_etiquetas_tipo_write ON public.marketing_etiquetas_tipo
  FOR ALL TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_etiquetas_tipo_service ON public.marketing_etiquetas_tipo;
CREATE POLICY marketing_etiquetas_tipo_service ON public.marketing_etiquetas_tipo
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- marketing_etiquetas_destino · idem
ALTER TABLE public.marketing_etiquetas_destino ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_etiquetas_destino_select ON public.marketing_etiquetas_destino;
CREATE POLICY marketing_etiquetas_destino_select ON public.marketing_etiquetas_destino
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS marketing_etiquetas_destino_write ON public.marketing_etiquetas_destino;
CREATE POLICY marketing_etiquetas_destino_write ON public.marketing_etiquetas_destino
  FOR ALL TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_etiquetas_destino_service ON public.marketing_etiquetas_destino;
CREATE POLICY marketing_etiquetas_destino_service ON public.marketing_etiquetas_destino
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- marketing_kanban_cards · select nivel>=3 · update via regra · insert nivel>=5 (interna)
ALTER TABLE public.marketing_kanban_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_cards_select ON public.marketing_kanban_cards;
CREATE POLICY marketing_cards_select ON public.marketing_kanban_cards
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 3
    OR public.is_super_admin()
    -- Solicitante ve o proprio card via solicitacoes (UI · join)
    OR solicitacao_id IN (
      SELECT id FROM public.solicitacoes WHERE solicitante_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_cards_insert ON public.marketing_kanban_cards;
CREATE POLICY marketing_cards_insert ON public.marketing_kanban_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_module_level('marketing') >= 5 AND origem = 'interna')
  );

DROP POLICY IF EXISTS marketing_cards_update ON public.marketing_kanban_cards;
CREATE POLICY marketing_cards_update ON public.marketing_kanban_cards
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('marketing') >= 5
    OR (
      public.current_user_module_level('marketing') >= 3
      AND atribuido_a IN (
        SELECT id FROM public.marketing_membros
         WHERE profile_id = auth.uid() AND ativo = true AND deleted_at IS NULL
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.current_user_module_level('marketing') >= 3
  );

DROP POLICY IF EXISTS marketing_cards_delete ON public.marketing_kanban_cards;
CREATE POLICY marketing_cards_delete ON public.marketing_kanban_cards
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS marketing_cards_service ON public.marketing_kanban_cards;
CREATE POLICY marketing_cards_service ON public.marketing_kanban_cards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- marketing_entregaveis · solicitante ve via card.solicitacao_id
ALTER TABLE public.marketing_entregaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_entregaveis_select ON public.marketing_entregaveis;
CREATE POLICY marketing_entregaveis_select ON public.marketing_entregaveis
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 3
    OR public.is_super_admin()
    OR card_id IN (
      SELECT c.id FROM public.marketing_kanban_cards c
        JOIN public.solicitacoes s ON s.id = c.solicitacao_id
       WHERE s.solicitante_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS marketing_entregaveis_insert ON public.marketing_entregaveis;
CREATE POLICY marketing_entregaveis_insert ON public.marketing_entregaveis
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.current_user_module_level('marketing') >= 3 AND enviado_por = auth.uid())
  );

DROP POLICY IF EXISTS marketing_entregaveis_update ON public.marketing_entregaveis;
CREATE POLICY marketing_entregaveis_update ON public.marketing_entregaveis
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('marketing') >= 5
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.current_user_module_level('marketing') >= 5
  );

DROP POLICY IF EXISTS marketing_entregaveis_delete ON public.marketing_entregaveis;
CREATE POLICY marketing_entregaveis_delete ON public.marketing_entregaveis
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS marketing_entregaveis_service ON public.marketing_entregaveis;
CREATE POLICY marketing_entregaveis_service ON public.marketing_entregaveis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- marketing_capacidade_override · idem padrao
ALTER TABLE public.marketing_capacidade_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_override_select ON public.marketing_capacidade_override;
CREATE POLICY marketing_override_select ON public.marketing_capacidade_override
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 1
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_override_write ON public.marketing_capacidade_override;
CREATE POLICY marketing_override_write ON public.marketing_capacidade_override
  FOR ALL TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_override_service ON public.marketing_capacidade_override;
CREATE POLICY marketing_override_service ON public.marketing_capacidade_override
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- marketing_compromissos_recorrentes · idem padrao
ALTER TABLE public.marketing_compromissos_recorrentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_recorrentes_select ON public.marketing_compromissos_recorrentes;
CREATE POLICY marketing_recorrentes_select ON public.marketing_compromissos_recorrentes
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 1
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_recorrentes_write ON public.marketing_compromissos_recorrentes;
CREATE POLICY marketing_recorrentes_write ON public.marketing_compromissos_recorrentes
  FOR ALL TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_recorrentes_service ON public.marketing_compromissos_recorrentes;
CREATE POLICY marketing_recorrentes_service ON public.marketing_compromissos_recorrentes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── KPIs Module ───────────────────────────────────────────────────────────────
-- Tabelas: cultos (frequência por culto), batismo_inscricoes, kpi_metas

-- ── cultos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cultos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id uuid REFERENCES public.vol_service_types(id) ON DELETE SET NULL,
  nome text NOT NULL,
  data date NOT NULL,
  hora time NOT NULL,
  -- Frequência presencial
  presencial_adulto integer DEFAULT 0 CHECK (presencial_adulto >= 0),
  presencial_kids   integer DEFAULT 0 CHECK (presencial_kids >= 0),
  -- Decisões
  decisoes_presenciais integer DEFAULT 0 CHECK (decisoes_presenciais >= 0),
  decisoes_online      integer DEFAULT 0 CHECK (decisoes_online >= 0),
  -- YouTube / Online
  youtube_video_id text,
  online_pico  integer CHECK (online_pico >= 0),   -- pico simultâneo (manual)
  online_ds    integer CHECK (online_ds >= 0),      -- views D+1 às 10h (auto)
  online_ddus  integer CHECK (online_ddus >= 0),    -- views D+7 - DS (auto)
  ds_coletado_em   timestamptz,
  ddus_coletado_em timestamptz,
  -- Meta
  inserido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cultos_data ON public.cultos(data DESC);
CREATE INDEX IF NOT EXISTS idx_cultos_service_type ON public.cultos(service_type_id);

-- ── batismo_inscricoes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.batismo_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text NOT NULL,
  sobrenome text NOT NULL,
  data_nascimento date,
  cpf text,
  telefone text,
  email text,
  status text DEFAULT 'pendente'
    CHECK (status IN ('pendente','confirmado','realizado','cancelado')),
  data_batismo date,
  inscrito_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origem text DEFAULT 'manual'
    CHECK (origem IN ('totem','manual')),
  observacoes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batismo_status ON public.batismo_inscricoes(status);
CREATE INDEX IF NOT EXISTS idx_batismo_cpf    ON public.batismo_inscricoes(cpf);

-- ── kpi_metas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kpi_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL,
  indicador text NOT NULL,
  descricao text,
  valor_base numeric,
  meta_6m    numeric,
  meta_12m   numeric,
  meta_24m   numeric,
  periodo_medicao text DEFAULT 'semanal'
    CHECK (periodo_medicao IN ('semanal','mensal','trimestral','semestral','anual')),
  unidade text DEFAULT 'pessoas',
  pilar text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (area, indicador)
);

-- ── Views ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_culto_stats AS
SELECT
  c.*,
  vst.name        AS service_type_name,
  vst.color       AS service_type_color,
  ROUND(c.presencial_adulto::numeric / 1300 * 100, 1) AS taxa_ocupacao,
  (c.presencial_adulto + c.presencial_kids)                           AS total_presencial,
  (COALESCE(c.decisoes_presenciais,0) + COALESCE(c.decisoes_online,0)) AS total_decisoes
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.cultos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batismo_inscricoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_metas           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_cultos"    ON public.cultos             FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_batismos"  ON public.batismo_inscricoes FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_kpi_metas" ON public.kpi_metas          FOR ALL TO service_role USING (true);

CREATE POLICY "auth_read_cultos"    ON public.cultos             FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_batismos"  ON public.batismo_inscricoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_kpi_metas" ON public.kpi_metas          FOR SELECT TO authenticated USING (true);

-- ── Seed: Metas 2026 ─────────────────────────────────────────────────────────
INSERT INTO public.kpi_metas
  (area, indicador, descricao, valor_base, meta_6m, meta_12m, meta_24m, periodo_medicao, unidade, pilar)
VALUES
  ('geral',        'frequencia_presencial',  'Frequência presencial (adultos)',           null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus'),
  ('geral',        'frequencia_kids',        'Frequência presencial (kids)',              null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus'),
  ('geral',        'taxa_ocupacao',          'Taxa de ocupação das cadeiras (%)',         null, null, null, null, 'semanal',    'percentual', 'seguir_jesus'),
  ('geral',        'decisoes_presenciais',   'Decisões presenciais',                      null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus'),
  ('geral',        'decisoes_online',        'Decisões online',                           null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus'),
  ('geral',        'online_pico',            'Pico simultâneo online',                   null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus'),
  ('geral',        'online_ds',              'Views D+1 (às 10h)',                        null, null, null, null, 'semanal',    'views',      'seguir_jesus'),
  ('geral',        'online_ddus',            'Views on-demand D+7',                      null, null, null, null, 'semanal',    'views',      'seguir_jesus'),
  ('ami_bridge',   'frequencia_cultos',      'Frequência AMI + Bridge',                  null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus'),
  ('ami',          'batismos_semestre1',     'Batismos 1º semestre',                     null, 18,   null, null, 'semestral',  'pessoas',    'seguir_jesus'),
  ('ami',          'batismos_semestre2',     'Batismos 2º semestre',                     null, null, 30,   null, 'semestral',  'pessoas',    'seguir_jesus'),
  ('ami',          'next_inscritos',         'Inscritos no Next',                        null, null, null, null, 'semanal',    'pessoas',    'investir_tempo'),
  ('ami',          'escola_discipulos',      'Participantes Escola de Discípulos',       null, null, null, null, 'semanal',    'pessoas',    'investir_tempo'),
  ('kids',         'aceitacoes',             'Aceitações CBKids (base: 8/mês)',           8,    null, null, null, 'mensal',     'pessoas',    'seguir_jesus'),
  ('kids',         'batismos',               'Batismos CBKids (base: 3/mês)',             3,    null, null, null, 'mensal',     'pessoas',    'seguir_jesus'),
  ('kids',         'devocionais',            'Famílias com devocionais (base: 10)',       10,   50,   null, null, 'mensal',     'familias',   'investir_tempo'),
  ('grupos',       'total_grupos',           'Total de grupos ativos',                   null, null, null, null, 'semestral',  'grupos',     'conectar_pessoas'),
  ('grupos',       'participantes',          'Participantes em grupos',                  null, null, null, null, 'mensal',     'pessoas',    'conectar_pessoas'),
  ('grupos',       'pct_jovens_grupos',      '% jovens em grupos',                       null, 50,   70,   null, 'semestral',  'percentual', 'conectar_pessoas'),
  ('voluntariado', 'voluntarios_ativos',     'Voluntários ativos (ult. 3 meses)',        500,  750,  1000, 1250, 'trimestral', 'pessoas',    'servir'),
  ('voluntariado', 'pct_igreja_servindo',    '% da Igreja servindo',                     20,   30,   40,   50,   'anual',      'percentual', 'servir'),
  ('integracao',   'visitantes',             'Visitantes por culto',                     null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus'),
  ('integracao',   'conversoes',             'Conversões por culto',                     null, null, null, null, 'semanal',    'pessoas',    'seguir_jesus')
ON CONFLICT (area, indicador) DO NOTHING;

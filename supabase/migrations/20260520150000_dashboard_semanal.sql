-- ============================================================================
-- Dashboard Semanal · módulo de apresentação para reunião de diretoria
--
-- Marcos: "toda semana, as quartas feiras, apresentamos um painel usando o
-- power bi, com dados referente ao ministerial e ao financeiro. sao sempre
-- os dados da semana anterior que apresentamos. é uma reuniao com a diretoria
-- da cbrio."
--
-- 3 tabelas:
--   1. dashboard_metas              · metas configuráveis por indicador
--   2. dashboard_indicadores_custom · indicadores customizados (rascunho IA)
--   3. vw_dashboard_semanal         · view de agregação por culto+semana+ano
-- ============================================================================

-- ── Metas por indicador ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_metas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador   text NOT NULL,                       -- slug do indicador
  rotulo      text NOT NULL,                       -- label legível
  meta_valor  numeric NOT NULL CHECK (meta_valor > 0),
  periodicidade text NOT NULL DEFAULT 'semanal'
    CHECK (periodicidade IN ('semanal', 'mensal', 'anual')),
  service_type_id uuid REFERENCES public.vol_service_types(id) ON DELETE SET NULL,
  cor         text,                                -- override de cor
  ativa       boolean NOT NULL DEFAULT true,
  criado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_metas_indicador
  ON public.dashboard_metas(indicador) WHERE ativa = true;

COMMENT ON TABLE public.dashboard_metas IS
  'Metas configuráveis por indicador exibidas na tab Metas do Dashboard Semanal';

-- ── Indicadores customizados (gerador IA) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dashboard_indicadores_custom (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  descricao       text,
  pergunta_usuario text NOT NULL,                  -- texto original do Marcos
  sugestao_ia     jsonb NOT NULL,                  -- saída completa do Claude
  status          text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'ativo', 'arquivado')),
  criado_por      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dashboard_indicadores_custom IS
  'Indicadores propostos via IA · ficam como rascunho até admin promover a ativo';

-- ── View · agregação por culto, ano e semana ISO ────────────────────────────
-- 1 linha por (ano, semana_iso, service_type) com somas por indicador
-- (presencial, kids, decisões, online, voluntários, total presencial).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_dashboard_semanal AS
SELECT
  EXTRACT(ISOYEAR FROM c.data)::int               AS ano_iso,
  EXTRACT(WEEK   FROM c.data)::int                AS semana_iso,
  EXTRACT(YEAR   FROM c.data)::int                AS ano_calendario,
  EXTRACT(MONTH  FROM c.data)::int                AS mes,
  c.service_type_id,
  vst.name                                        AS service_type_name,
  vst.color                                       AS service_type_color,
  vst.recurrence_day                              AS recurrence_day,
  vst.recurrence_time                             AS recurrence_time,
  COUNT(*)                                        AS total_cultos,
  COALESCE(SUM(c.presencial_adulto), 0)::int      AS frequencia,
  COALESCE(SUM(c.presencial_kids), 0)::int        AS frequencia_kids,
  COALESCE(SUM(c.decisoes_presenciais), 0)::int   AS aceitacoes,
  COALESCE(SUM(c.decisoes_online), 0)::int        AS aceitacoes_online,
  COALESCE(SUM(c.online_pico), 0)::int            AS ao_vivo,
  COALESCE(SUM(c.online_ds), 0)::int              AS online_ds,
  COALESCE(SUM(c.online_ddus), 0)::int            AS online_ddus,
  COALESCE(SUM(c.voluntarios), 0)::int            AS voluntariado,
  COALESCE(SUM(c.presencial_adulto + c.presencial_kids), 0)::int AS total_presencial
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
GROUP BY ano_iso, semana_iso, ano_calendario, mes,
         c.service_type_id, vst.name, vst.color,
         vst.recurrence_day, vst.recurrence_time;

COMMENT ON VIEW public.vw_dashboard_semanal IS
  'Agregação semanal de cultos por tipo · 1 linha por (ano_iso, semana_iso, service_type)';

-- ── Seed · metas iniciais alinhadas com o que Marcos apresenta ──────────────
-- Sem ON CONFLICT pra não duplicar · checa por (indicador, periodicidade) único
INSERT INTO public.dashboard_metas (indicador, rotulo, meta_valor, periodicidade, ativa)
SELECT 'frequencia',        'Frequência (semanal)',        1200, 'semanal', true
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_metas
                   WHERE indicador = 'frequencia' AND periodicidade = 'semanal');

INSERT INTO public.dashboard_metas (indicador, rotulo, meta_valor, periodicidade, ativa)
SELECT 'aceitacoes',        'Aceitações (semanal)',          50, 'semanal', true
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_metas
                   WHERE indicador = 'aceitacoes' AND periodicidade = 'semanal');

INSERT INTO public.dashboard_metas (indicador, rotulo, meta_valor, periodicidade, ativa)
SELECT 'aceitacoes_online', 'Aceitações Online (semanal)',   20, 'semanal', true
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_metas
                   WHERE indicador = 'aceitacoes_online' AND periodicidade = 'semanal');

INSERT INTO public.dashboard_metas (indicador, rotulo, meta_valor, periodicidade, ativa)
SELECT 'frequencia_kids',   'Frequência Kids (semanal)',    200, 'semanal', true
WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_metas
                   WHERE indicador = 'frequencia_kids' AND periodicidade = 'semanal');

-- ============================================================================
-- Conferência rápida:
--   SELECT * FROM vw_dashboard_semanal
--    WHERE ano_iso = EXTRACT(ISOYEAR FROM CURRENT_DATE)::int
--      AND semana_iso = EXTRACT(WEEK FROM CURRENT_DATE)::int - 1
--    ORDER BY recurrence_day, recurrence_time;
--
--   SELECT * FROM dashboard_metas WHERE ativa = true;
-- ============================================================================

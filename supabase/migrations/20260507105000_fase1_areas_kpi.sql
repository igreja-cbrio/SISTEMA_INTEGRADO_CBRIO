-- ============================================================================
-- FASE 1 · Tabela formal de Areas de KPI (Bridge, Online, Sede + futuras)
--
-- Hoje as areas vivem como strings em `kpi_indicadores_taticos.area`
-- (kids/ami/cba/etc) e como array hardcoded em src/pages/admin/KpiAreas.jsx.
-- Para crescer (Adm, Criativo, novas areas dinamicas) sem refactor toda
-- vez, criar tabela formal `areas_kpi`.
--
-- A migracao das strings existentes em kpi_indicadores_taticos para FK
-- e PROPOSITALMENTE deferida para fase posterior — agora a tabela serve
-- como fonte canonica para UIs novas; coluna .area continua sendo string
-- e queries continuam funcionando.
--
-- O que ENTRA aqui:
--   - Bridge (adolescentes) — nao existia
--   - Online (comunidade digital) — nao existia
--   - Sede (adultos / culto domingo) — antes "instituicao", renomeado
--
-- Categorizacoes: ministerial / geracional / institucional / administrativo / criativo
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.areas_kpi (
  id          text PRIMARY KEY,
  nome        text NOT NULL,
  descricao   text,
  categoria   text NOT NULL CHECK (categoria IN ('ministerial', 'geracional', 'institucional', 'administrativo', 'criativo')),
  cor_hex     text,
  ordem       int NOT NULL DEFAULT 99,
  ativa       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_areas_kpi_categoria ON public.areas_kpi (categoria) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_areas_kpi_ordem    ON public.areas_kpi (ordem) WHERE ativa = true;

ALTER TABLE public.areas_kpi ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "areas_kpi_read_authenticated" ON public.areas_kpi FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "areas_kpi_write_admin" ON public.areas_kpi FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- Seed: areas existentes + Bridge + Online + Sede
-- (id em lowercase, espelha kpi_indicadores_taticos.area)
-- ----------------------------------------------------------------------------
INSERT INTO public.areas_kpi (id, nome, descricao, categoria, cor_hex, ordem, ativa)
VALUES
  -- Geracionais
  ('kids',          'CBKids',         'Criancas ate 12 anos · cultos, classes e ministerio infantil',           'geracional',    '#F59E0B', 10, true),
  ('bridge',        'Bridge',         'Adolescentes · cultos, grupos e formacao para o AMI',                    'geracional',    '#3B82F6', 11, true),
  ('ami',           'AMI',            'Jovens · cultos, grupos, NEXT e Jornada 180',                            'geracional',    '#8B5CF6', 12, true),

  -- Ministeriais
  ('cba',           'CBA',            'Igrejas em rede acompanhadas · cobertura, multiplicacao e formacao',     'ministerial',   '#00B39D', 20, true),
  ('cuidados',      'Cuidados',       'Capelania e aconselhamento',                                              'ministerial',   '#EC4899', 21, true),
  ('grupos',        'Grupos',         'Grupos de conexao da igreja',                                             'ministerial',   '#10B981', 22, true),
  ('integracao',    'Integracao',     'Batismo, apresentacao e cultos',                                          'ministerial',   '#0EA5E9', 23, true),
  ('voluntariado',  'Voluntariado',   'Check-in, escalas e QR codes',                                            'ministerial',   '#F97316', 24, true),
  ('next',          'NEXT',           'Porta de entrada · inscricoes, check-in e indicacoes',                    'ministerial',   '#06B6D4', 25, true),
  ('generosidade',  'Generosidade',   'Dizimistas recorrentes, novos doadores, valor arrecadado',                'ministerial',   '#EF4444', 26, true),

  -- Institucionais
  ('sede',          'Sede',           'Adultos · culto de domingo · agregado da igreja-mae',                     'institucional', '#1F2937', 30, true),
  ('online',        'Online',         'Comunidade digital · culto online + grupos remotos',                      'institucional', '#6366F1', 31, true),
  ('jornada',       'Jornada',        'Jornada 180, devocionais, formacao espiritual',                           'institucional', '#A855F7', 32, true),
  ('igreja',        'Igreja',         'Indicadores institucionais agregados (NSM, mandala)',                     'institucional', '#0F766E', 33, true)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      categoria = EXCLUDED.categoria,
      cor_hex = EXCLUDED.cor_hex,
      ordem = EXCLUDED.ordem,
      updated_at = now();

-- ----------------------------------------------------------------------------
-- View: areas com contagem de KPIs ativos (para UI de configuracao)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_areas_kpi_com_total AS
SELECT
  a.id,
  a.nome,
  a.descricao,
  a.categoria,
  a.cor_hex,
  a.ordem,
  a.ativa,
  count(k.id) FILTER (WHERE k.ativo = true) AS total_kpis_ativos,
  count(k.id) FILTER (WHERE k.ativo = true AND k.is_okr = true) AS total_okrs
FROM public.areas_kpi a
LEFT JOIN public.kpi_indicadores_taticos k ON lower(k.area) = a.id
WHERE a.ativa = true
GROUP BY a.id, a.nome, a.descricao, a.categoria, a.cor_hex, a.ordem, a.ativa
ORDER BY a.ordem, a.nome;

GRANT SELECT ON public.vw_areas_kpi_com_total TO authenticated, service_role;

COMMENT ON TABLE public.areas_kpi IS 'Areas de KPI canonicas (Kids, Bridge, AMI, Sede, Online, CBA, etc). Tabela cresce dinamicamente sem migration. kpi_indicadores_taticos.area continua sendo string referenciando areas_kpi.id.';

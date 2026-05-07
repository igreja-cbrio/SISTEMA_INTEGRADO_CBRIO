-- ============================================================================
-- FASE 6A · Dados brutos (numeros absolutos) + KPIs ganham formula de calculo
--
-- O que muda conceitualmente:
--   ANTES: lider preenchia "% crescimento da frequencia" diretamente.
--   AGORA: lider preenche "frequencia = 850" (numero absoluto da semana),
--          KPI calcula automaticamente "%" via formula configurada.
--
-- Estrutura:
--   tipos_dado_bruto (catalogo): tipos de dado que existem (frequencia,
--     conversoes, batismos, etc). Configurados pelo PMO.
--   dados_brutos (registros): cada linha e um numero absoluto preenchido
--     por alguma area em alguma data. UNIQUE por (tipo, area, data, contexto).
--
--   kpi_indicadores_taticos ganha:
--     tipo_calculo: como o KPI e calculado a partir dos dados brutos
--     formula_config: parametros da formula (jsonb)
--
-- Tipos de calculo suportados:
--   manual          - lider preenche valor direto (legado, default)
--   delta_pct       - (atual - anterior) / anterior * 100
--   delta_abs       - atual - anterior
--   razao           - numerador / denominador * 100
--   contagem_janela - count(eventos) numa janela de X dias
--   soma_periodo    - sum(valores) num periodo (mes/ano)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tipos_dado_bruto (catalogo)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tipos_dado_bruto (
  id            text PRIMARY KEY,
  nome          text NOT NULL,
  descricao     text,
  unidade       text,
  agregacao     text NOT NULL DEFAULT 'sum'
                CHECK (agregacao IN ('sum', 'avg', 'count', 'count_distinct', 'last')),
  granularidade text NOT NULL DEFAULT 'semanal'
                CHECK (granularidade IN ('diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual', 'evento')),
  origem_tabela text,
  ativo         boolean NOT NULL DEFAULT true,
  ordem         int NOT NULL DEFAULT 99,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tipos_dado_ativo ON public.tipos_dado_bruto (ativo) WHERE ativo = true;

ALTER TABLE public.tipos_dado_bruto ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "tipos_dado_bruto_read" ON public.tipos_dado_bruto FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "tipos_dado_bruto_write_admin" ON public.tipos_dado_bruto FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. Seed: tipos iniciais
-- ----------------------------------------------------------------------------
INSERT INTO public.tipos_dado_bruto (id, nome, descricao, unidade, agregacao, granularidade, origem_tabela, ordem) VALUES
  ('frequencia_culto',       'Frequência no culto',       'Pessoas presentes no culto principal da area',                'pessoas', 'sum', 'semanal', NULL, 10),
  ('frequencia_next',        'Frequência no NEXT',        'Pessoas presentes no encontro NEXT',                          'pessoas', 'sum', 'semanal', 'next_inscricoes', 11),
  ('frequencia_grupos',      'Frequência em grupos',      'Pessoas presentes nos grupos de conexao',                     'pessoas', 'sum', 'mensal',  'mem_grupo_membros', 12),
  ('conversoes',             'Conversões',                'Decisões por Cristo registradas',                             'decisões', 'sum', 'semanal', 'int_visitantes', 20),
  ('batismos',               'Batismos',                  'Batismos realizados',                                          'batismos', 'sum', 'mensal',  'mem_trilha_valores', 21),
  ('devocionais',            'Devocionais registrados',   'Devocionais (pessoais ou familiares) feitos',                 'devocionais', 'sum', 'mensal', 'mem_devocionais', 30),
  ('voluntarios_ativos',     'Voluntários ativos',        'Voluntários servindo no periodo (count distinct)',            'pessoas', 'count_distinct', 'mensal', 'mem_voluntarios', 40),
  ('voluntarios_checkin',    'Check-ins de voluntários',  'Voluntários que fizeram check-in via QR/sistema',             'check-ins', 'count', 'mensal', 'vol_check_ins', 41),
  ('voluntarios_treinamento','Voluntários em treinamento','Voluntários cursando treinamento',                            'pessoas', 'count_distinct', 'mensal', NULL, 42),
  ('voluntarios_inativos',   'Voluntários inativos',      'Voluntários que pararam de servir no periodo',                'pessoas', 'count', 'mensal', NULL, 43),
  ('voluntarios_alocados',   'Voluntários alocados',      'Pessoas que solicitaram servir e foram alocadas',             'pessoas', 'count', 'mensal', NULL, 44),
  ('doacoes_valor',          'Valor arrecadado',          'Total em R$ de dizimos + ofertas no periodo',                 'R$', 'sum', 'mensal', 'mem_contribuicoes', 50),
  ('doadores_count',         'Doadores únicos',           'Pessoas distintas que doaram no periodo',                     'pessoas', 'count_distinct', 'mensal', 'mem_contribuicoes', 51),
  ('doadores_recorrentes',   'Doadores recorrentes',      'Pessoas que doaram em ≥3 meses consecutivos',                 'pessoas', 'count_distinct', 'mensal', NULL, 52),
  ('lideres_grupos',         'Líderes de grupos',         'Numero total de lideres de grupos ativos',                    'lideres', 'count_distinct', 'semestral', 'mem_grupo_membros', 60),
  ('lideres_treinados',      'Líderes em treinamento',    'Lideres recebendo treinamento no periodo',                    'lideres', 'count_distinct', 'mensal', NULL, 61),
  ('lideres_acompanhados',   'Líderes acompanhados',      'Lideres que tiveram acompanhamento pastoral',                 'lideres', 'count_distinct', 'mensal', NULL, 62),
  ('grupos_ativos',          'Grupos ativos',             'Grupos rodando no periodo',                                   'grupos', 'count', 'semestral', 'mem_grupos', 70),
  ('solicitacoes_capelania', 'Solicitações de capelania', 'Atendimentos de capelania feitos',                            'atendimentos', 'sum', 'mensal', NULL, 80),
  ('solicitacoes_aconselh',  'Solicitações de aconselhamento','Atendimentos de aconselhamento feitos',                   'atendimentos', 'sum', 'mensal', NULL, 81),
  ('novos_convertidos_atend','Novos convertidos atendidos','Novos convertidos contatados por pastor na semana da decisao','pessoas', 'count_distinct', 'mensal', NULL, 82),
  ('inscricoes_jornada180',  'Inscritos no Jornada 180',  'Inscricoes no curso Jornada 180',                             'inscritos', 'count', 'semestral', NULL, 90),
  ('nps_next',               'NPS do NEXT',               'Net Promoter Score do encontro NEXT (escala 0-10)',           'nota', 'avg', 'mensal', NULL, 91),
  ('satisfacao_lideres',     'Satisfação dos líderes',    'Avaliação media dos lideres de grupos (1-5)',                 'nota', 'avg', 'semestral', NULL, 92),
  ('satisfacao_voluntarios', 'Satisfação dos voluntários','Avaliação media dos voluntarios (1-5)',                       'nota', 'avg', 'semestral', NULL, 93)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      descricao = EXCLUDED.descricao,
      unidade = EXCLUDED.unidade,
      agregacao = EXCLUDED.agregacao,
      granularidade = EXCLUDED.granularidade,
      origem_tabela = EXCLUDED.origem_tabela,
      ordem = EXCLUDED.ordem;

-- ----------------------------------------------------------------------------
-- 3. dados_brutos (registros preenchidos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dados_brutos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id         text NOT NULL REFERENCES public.tipos_dado_bruto(id) ON DELETE RESTRICT,
  area            text NOT NULL,
  data            date NOT NULL,
  valor           numeric NOT NULL,
  contexto        jsonb DEFAULT '{}'::jsonb,
  observacao      text,
  registrado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origem          text NOT NULL DEFAULT 'manual'
                  CHECK (origem IN ('manual', 'auto', 'importado')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 1 valor por (tipo, area, data, contexto-jsonb)
  CONSTRAINT uq_dado_bruto_chave UNIQUE (tipo_id, area, data, contexto)
);

CREATE INDEX IF NOT EXISTS idx_dado_bruto_tipo_area_data
  ON public.dados_brutos (tipo_id, area, data DESC);
CREATE INDEX IF NOT EXISTS idx_dado_bruto_data
  ON public.dados_brutos (data DESC);

ALTER TABLE public.dados_brutos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "dados_brutos_read" ON public.dados_brutos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "dados_brutos_write_by_area" ON public.dados_brutos FOR ALL TO authenticated
    USING (public.can_edit_kpi_area(area))
    WITH CHECK (public.can_edit_kpi_area(area));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.tg_dados_brutos_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS tg_dados_brutos_set_updated_at ON public.dados_brutos;
CREATE TRIGGER tg_dados_brutos_set_updated_at
  BEFORE UPDATE ON public.dados_brutos
  FOR EACH ROW EXECUTE FUNCTION public.tg_dados_brutos_updated_at();

-- ----------------------------------------------------------------------------
-- 4. KPIs ganham tipo_calculo + formula_config
-- ----------------------------------------------------------------------------
ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS tipo_calculo text NOT NULL DEFAULT 'manual'
    CHECK (tipo_calculo IN ('manual', 'delta_pct', 'delta_abs', 'razao', 'contagem_janela', 'soma_periodo'));

ALTER TABLE public.kpi_indicadores_taticos
  ADD COLUMN IF NOT EXISTS formula_config jsonb;

COMMENT ON COLUMN public.kpi_indicadores_taticos.tipo_calculo IS
  'Como o KPI eh calculado a partir de dados_brutos. Default manual (legado). Tipos: delta_pct, delta_abs, razao, contagem_janela, soma_periodo.';

COMMENT ON COLUMN public.kpi_indicadores_taticos.formula_config IS
  'Parametros da formula. Estrutura depende de tipo_calculo:
   delta_pct/delta_abs: {"dado_tipo": "frequencia_culto", "comparacao": "semana_anterior"}
   razao:              {"numerador": "doadores_recorrentes", "denominador": "doadores_count"}
   contagem_janela:    {"dado_tipo": "engajamentos", "janela_dias": 60}
   soma_periodo:       {"dado_tipo": "doacoes_valor", "periodo": "ano"}';

-- ----------------------------------------------------------------------------
-- 5. View para listar dados brutos com info do tipo (frontend)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_dados_brutos_completo AS
SELECT
  d.id,
  d.tipo_id,
  t.nome AS tipo_nome,
  t.unidade,
  t.agregacao,
  t.granularidade,
  d.area,
  d.data,
  d.valor,
  d.contexto,
  d.observacao,
  d.origem,
  d.created_at,
  d.updated_at
FROM public.dados_brutos d
JOIN public.tipos_dado_bruto t ON t.id = d.tipo_id
WHERE t.ativo = true
ORDER BY d.data DESC, d.area, t.ordem;

GRANT SELECT ON public.vw_dados_brutos_completo TO authenticated, service_role;

COMMENT ON TABLE public.tipos_dado_bruto IS
  'Catalogo de tipos de dado bruto (frequencia, conversoes, batismos...). PMO cadastra; lideres registram em dados_brutos.';
COMMENT ON TABLE public.dados_brutos IS
  'Registros de numeros absolutos preenchidos pelo lider. KPIs com tipo_calculo automatico leem daqui.';

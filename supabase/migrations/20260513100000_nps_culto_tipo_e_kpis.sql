-- ============================================================================
-- NPS de Culto · integracao com modulo NPS existente
--
-- Marcos: "existe o módulo nps hoje, vamos resolver esse com alta prioridade
--          levando em conta a estrutura que já tem"
--
-- O modulo /nps:
--   1. Cria pesquisa (perguntas geradas via IA)
--   2. Pessoa responde (logado ou link publico)
--   3. sincronizarKpi() em nps.js joga score_medio em dados_brutos
--      com tipo_id=contexto_kpi (ex: 'nps_geral') e area=area da pesquisa
--   4. calcular_kpi() recalcula KPIs com formula_config.dado_tipo correspondente
--
-- Falta:
--   1. tipo_id 'nps_culto' em tipos_dado_bruto
--   2. KPIs CULTO-NPS-* com formula_config no padrao certo
--   3. Backend permitir contexto_kpi='nps_culto'
--   4. Frontend mostrar 'NPS Culto' nas opcoes + remover CBA das areas
-- ============================================================================

-- 1. Cataloga tipo de dado bruto
INSERT INTO public.tipos_dado_bruto (
  id, nome, descricao, unidade, agregacao, granularidade, ativo, ordem, ministerio_id
)
VALUES (
  'nps_culto',
  'NPS de Culto',
  'Avaliacao da experiencia de culto (0-10) · respondida apos cada culto · agregada por area',
  'nota',
  'avg',
  'mensal',
  true,
  95,
  null
)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  agregacao = EXCLUDED.agregacao,
  granularidade = EXCLUDED.granularidade,
  ativo = true;

-- 2. Reajusta formula_config dos 5 CULTO-NPS-* pro padrao certo
--    Antes: razao + {fonte: 'nps_cultos', metrica: 'nps_culto', contexto: 'culto'}
--    Agora: delta_abs + {dado_tipo: 'nps_culto', comparacao: 'ciclo_anterior'}
--    (igual aos NPS de voluntarios · KIDS-16, AMI-17, BRG-16, SED-12, ONL-15)
UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'delta_abs',
       formula_config = jsonb_build_object(
         'dado_tipo',  'nps_culto',
         'comparacao', 'ciclo_anterior'
       ),
       updated_at = now()
 WHERE id LIKE 'CULTO-NPS-%'
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- Conferencia:
-- SELECT * FROM tipos_dado_bruto WHERE id = 'nps_culto';
-- SELECT id, tipo_calculo, formula_config FROM kpi_indicadores_taticos
--   WHERE id LIKE 'CULTO-NPS-%' ORDER BY id;
-- ============================================================================

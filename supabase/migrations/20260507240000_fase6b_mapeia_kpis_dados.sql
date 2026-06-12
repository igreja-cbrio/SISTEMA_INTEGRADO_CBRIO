-- ============================================================================
-- FASE 6B · Mapeamento automatico dos 153 KPIs aos tipos de dado bruto
--
-- Baseado no nome do objetivo geral, configura tipo_calculo + formula_config.
-- Onde a regra eh obvia, mapeia. Onde fica ambiguo (satisfacao, qualidade,
-- garantir cobertura), deixa como manual pra Marcos ajustar via UI.
--
-- Todos os UPDATEs sao IDEMPOTENTES (filtram por objetivo_geral nome).
-- Pode rodar varias vezes sem efeito colateral.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Frequencia (cultos) → delta_pct vs semana_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "frequencia_culto", "comparacao": "semana_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar a frequencia');

-- ----------------------------------------------------------------------------
-- 2. Conversoes → delta_pct vs semana_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "conversoes", "comparacao": "semana_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar Aceitações');

-- ----------------------------------------------------------------------------
-- 3. Batismos → delta_pct vs evento_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "batismos", "comparacao": "evento_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar o numero de batismos');

-- ----------------------------------------------------------------------------
-- 4. Devocionais → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "devocionais", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar Pessoas fazendo Devocionais');

-- ----------------------------------------------------------------------------
-- 5. Frequencia NEXT → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "frequencia_next", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar a frequencia NEXT');

-- ----------------------------------------------------------------------------
-- 6. Frequencia grupos / participantes → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "frequencia_grupos", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar a frequencia de grupos');

-- ----------------------------------------------------------------------------
-- 7. Doadores recorrentes → razao
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'razao',
  formula_config = '{"numerador": "doadores_recorrentes", "denominador": "doadores_count"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar numero de dizimistas e ofertantes recorrentes');

-- ----------------------------------------------------------------------------
-- 8. Lideres em treinamento → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "lideres_treinados", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar numero de lideres de grupo em treinamento');

-- ----------------------------------------------------------------------------
-- 9. Lideres acompanhados → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "lideres_acompanhados", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome ILIKE 'Aumentar numero de lideres de grupos acompanhados%');

-- ----------------------------------------------------------------------------
-- 10. Numero de grupos → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "grupos_ativos", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar numero de grupos');

-- ----------------------------------------------------------------------------
-- 11. Voluntarios ativos → soma_periodo no mes
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'soma_periodo',
  formula_config = '{"dado_tipo": "voluntarios_ativos", "periodo": "mes"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de voluntários ativos');

-- ----------------------------------------------------------------------------
-- 12. Voluntarios check-in → soma_periodo no mes
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'soma_periodo',
  formula_config = '{"dado_tipo": "voluntarios_checkin", "periodo": "mes"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de voluntários que fazem o check-in corretamente');

-- ----------------------------------------------------------------------------
-- 13. Voluntarios em treinamento → soma_periodo no mes
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'soma_periodo',
  formula_config = '{"dado_tipo": "voluntarios_treinamento", "periodo": "mes"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar quantidade de voluntários em treinamento');

-- ----------------------------------------------------------------------------
-- 14. Capelania → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "solicitacoes_capelania", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de solicitações atendidas de capelania');

-- ----------------------------------------------------------------------------
-- 15. Aconselhamento → delta_pct vs ciclo_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "solicitacoes_aconselh", "comparacao": "ciclo_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de solicitações atendidas de aconselhamento');

-- ----------------------------------------------------------------------------
-- 16. Novos convertidos atendidos → razao (atendidos / total convertidos)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'razao',
  formula_config = '{"numerador": "novos_convertidos_atend", "denominador": "conversoes"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de novos convertidos sendo atendidos por pastores na semana da conversão');

-- ----------------------------------------------------------------------------
-- 17. Total dizimistas/ofertantes → delta_pct vs mes_anterior
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'delta_pct',
  formula_config = '{"dado_tipo": "doadores_count", "comparacao": "mes_anterior"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar numero total de dizimistas e ofertantes');

-- ----------------------------------------------------------------------------
-- 18. Valor arrecadado → soma_periodo no ano
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'soma_periodo',
  formula_config = '{"dado_tipo": "doacoes_valor", "periodo": "ano"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar o valor total arrecadado no ano');

-- ----------------------------------------------------------------------------
-- 19. Inscritos Jornada 180 → soma_periodo no semestre
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos k SET
  tipo_calculo = 'soma_periodo',
  formula_config = '{"dado_tipo": "inscricoes_jornada180", "periodo": "semestre"}'::jsonb
WHERE k.is_okr = true AND k.ativo = true
  AND k.objetivo_geral_id = (SELECT id FROM public.kpi_objetivos_gerais WHERE nome = 'Aumentar número de inscritos no jornada 180');

-- ----------------------------------------------------------------------------
-- 20-25. Manuais (deixa como manual — Marcos define depois)
--   - Recuperar voluntarios inativos
--   - Aumentar a satisfacao dos lideres grupos
--   - Aumentar a satisfação de voluntários
--   - Garantir alocacao de quem deseja servir
--   - Melhorar qualidade do Next
--   - Melhorar Qualidade de doadores
-- ----------------------------------------------------------------------------
-- Nada a fazer — default ja eh 'manual'

-- ----------------------------------------------------------------------------
-- CONFERENCIA
-- ----------------------------------------------------------------------------
-- SELECT tipo_calculo, count(*)
--   FROM kpi_indicadores_taticos
--  WHERE is_okr = true AND ativo = true
--  GROUP BY tipo_calculo
--  ORDER BY count(*) DESC;

-- SELECT og.nome, k.tipo_calculo, count(*)
--   FROM kpi_indicadores_taticos k
--   JOIN kpi_objetivos_gerais og ON og.id = k.objetivo_geral_id
--  WHERE k.is_okr = true AND k.ativo = true
--  GROUP BY og.nome, k.tipo_calculo
--  ORDER BY og.nome;

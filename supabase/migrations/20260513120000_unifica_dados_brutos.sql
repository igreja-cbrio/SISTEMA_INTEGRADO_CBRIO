-- ============================================================================
-- Unifica fluxo de coleta · todos os KPIs alimentados por dados_brutos
--
-- Marcos: "na area de kpis os ministerios devem preencher apenas os dados
--          manuais, os dados automaticos vem do proprio modulo de cada area,
--          e nao e pra eles preencherem os kpis, e pra eles preencherem os
--          dados e o todos os kpis serem preenchidos automaticamente baseado
--          nos dados"
--
-- Antes:
-- - 8 KPIs FIN-*/RH-*/INFRA-* com tipo_calculo='manual' (leem kpi_registros)
-- - 130+ KPIs ministeriais com tipo_calculo automatico (leem dados_brutos)
-- - Dois fluxos paralelos · /meus-kpis escrevia em kpi_registros mas os KPIs
--   automaticos nao liam dai · valor "preenchido" nao aparecia no painel
--
-- Depois:
-- - Todos os KPIs leem de dados_brutos via formula_config.dado_tipo
-- - kpi_registros mantido como legado (historico) · novos preenchimentos vao
--   pra dados_brutos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cataloga tipos de dado_bruto pros 8 KPIs administrativos
--    Cada um vira um tipo proprio · soma_periodo lanca o valor mensalmente
-- ----------------------------------------------------------------------------
INSERT INTO public.tipos_dado_bruto (
  id, nome, descricao, unidade, agregacao, granularidade, ativo, ordem, ministerio_id
) VALUES
  ('financeiro_despesas_orcamento_pct',
   '% Despesas no orcamento',
   'Despesas executadas dentro do orcamento aprovado no mes',
   '%', 'avg', 'mensal', true, 110, null),
  ('financeiro_reserva_caixa_pct',
   '% Reserva de caixa',
   'Reserva de caixa em relacao ao desejado · meta saudavel',
   '%', 'avg', 'mensal', true, 111, null),
  ('financeiro_prazos_pagamento_pct',
   '% Prazos de pagamento cumpridos',
   'Pagamentos internos e externos quitados no prazo combinado',
   '%', 'avg', 'mensal', true, 112, null),
  ('rh_q12_nota',
   'Nota Q12 (Gallup)',
   'Score anual da pesquisa Q12 (engajamento Gallup)',
   'nota', 'avg', 'anual', true, 120, null),
  ('rh_engajamento_treinamentos_pct',
   '% Engajamento em treinamentos',
   'Adesao do staff aos treinamentos propostos no mes',
   '%', 'avg', 'mensal', true, 121, null),
  ('rh_rotatividade_pct',
   '% Rotatividade staff',
   'Rotatividade do staff no mes',
   '%', 'avg', 'mensal', true, 122, null),
  ('infra_cronogramas_pct',
   '% Cronogramas cumpridos',
   'Obras/projetos com cronograma cumprido no prazo',
   '%', 'avg', 'mensal', true, 130, null),
  ('infra_orcamentos_pct',
   '% Orcamentos respeitados',
   'Obras/projetos cujo orcamento foi respeitado',
   '%', 'avg', 'mensal', true, 131, null)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  unidade = EXCLUDED.unidade,
  agregacao = EXCLUDED.agregacao,
  granularidade = EXCLUDED.granularidade,
  ativo = true;

-- ----------------------------------------------------------------------------
-- 2. Reconfigura os 8 KPIs · de 'manual' para 'soma_periodo' lendo dados_brutos
--    soma_periodo com agregacao=avg pega a media do periodo (1 lancamento/mes
--    vira o proprio valor)
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'financeiro_despesas_orcamento_pct'),
       updated_at = now()
 WHERE id = 'FIN-01';

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'financeiro_reserva_caixa_pct'),
       updated_at = now()
 WHERE id = 'FIN-02';

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'financeiro_prazos_pagamento_pct'),
       updated_at = now()
 WHERE id = 'FIN-03';

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'rh_q12_nota'),
       updated_at = now()
 WHERE id = 'RH-01';

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'rh_engajamento_treinamentos_pct'),
       updated_at = now()
 WHERE id = 'RH-02';

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'rh_rotatividade_pct'),
       updated_at = now()
 WHERE id = 'RH-03';

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'infra_cronogramas_pct'),
       updated_at = now()
 WHERE id = 'INFRA-01';

UPDATE public.kpi_indicadores_taticos
   SET tipo_calculo = 'soma_periodo',
       formula_config = jsonb_build_object('dado_tipo', 'infra_orcamentos_pct'),
       updated_at = now()
 WHERE id = 'INFRA-02';

-- ----------------------------------------------------------------------------
-- 3. Limpeza · tipos_dado_bruto teste/lixo
-- ----------------------------------------------------------------------------
DELETE FROM public.tipos_dado_bruto WHERE id = 'novo_tipo_id';

-- ----------------------------------------------------------------------------
-- Conferencia:
-- SELECT id, tipo_calculo, formula_config FROM kpi_indicadores_taticos
--  WHERE id IN ('FIN-01','FIN-02','FIN-03','RH-01','RH-02','RH-03','INFRA-01','INFRA-02');
-- Espera: tipo_calculo='soma_periodo', formula_config com dado_tipo correto
--
-- SELECT id FROM tipos_dado_bruto
--  WHERE id IN ('financeiro_despesas_orcamento_pct','rh_q12_nota','infra_cronogramas_pct');
-- Espera: 3 rows (e mais 5 da migration)
-- ============================================================================

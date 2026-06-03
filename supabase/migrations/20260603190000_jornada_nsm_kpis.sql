-- ============================================================================
-- Jornada do novo convertido na NSM · 3 marcos medidos (Frente A) (2026-06-03)
-- ============================================================================
-- Marcos: levar os 3 marcos pra matriz/mandala, alimentados pela lógica do
-- tracker (coorte 90d). Metas: Batismo >=30%/90d, Next >=30%/90d, Reunião >=70%.
-- Contato (100%) fica no operacional (não vira KPI).
--
-- Achado do audit: os objetivos já existem, mas o tático que os mede é OUTRA
-- coisa (crescimento de volume), não o % de coorte 90d. Então:
--   - Batismo (obj ac906f19) e Next (obj 68c17f72): CRIAMOS o tático de coorte
--     por área (o de crescimento continua · métrica diferente, não duplicata).
--   - Atendidos (obj 5ffafa58): RELIGAMOS os táticos existentes (AMI-21/SED-17/
--     BRG-19/ONL-04) pra medir "% que aceitou a reunião" (sem KPI novo).
-- KRs: troca "1 ciclo NEXT/trimestre" -> "Next em <=90d"; "contato <=7d" -> "aceita reunião".
--
-- Coletores: cuidados.batismo_90d_pct / next_90d_pct / reuniao_aceita_pct
-- (kpiAutoCollector.js · coorte mensal por área). tipo_calculo='manual' →
-- a view lê de kpi_registros, que o coletor JS popula.
-- Áreas: ami/bridge/online/sede (kids/cba fora · não geram convertido).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. KPIs táticos novos · % batizados <=90d e % Next <=90d (coorte) por área
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos
  (id, area, indicador, descricao, periodicidade, meta_valor, meta_descricao,
   valores, is_okr, objetivo_geral_id, tipo_calculo, tipo_kpi, fonte_auto,
   ano, ativo, sort_order, periodo_offset_meses, formula_config)
VALUES
  -- Batismo <=90d · objetivo "Aumentar batismos" (ac906f19)
  ('AMI-BAT90','ami','% dos convertidos batizados em <=90 dias','Funil conversão→batismo: % dos novos convertidos do AMI batizados em até 90 dias da decisão.','mensal',30,'>=30% batizados em <=90 dias',ARRAY['seguir']::text[],true,'ac906f19-970a-d651-8c84-28f02f01a923','manual','quantitativo','cuidados.batismo_90d_pct',2026,true,0,0,'{}'::jsonb),
  ('BRG-BAT90','bridge','% dos convertidos batizados em <=90 dias','Funil conversão→batismo: % dos novos convertidos do Bridge batizados em até 90 dias da decisão.','mensal',30,'>=30% batizados em <=90 dias',ARRAY['seguir']::text[],true,'ac906f19-970a-d651-8c84-28f02f01a923','manual','quantitativo','cuidados.batismo_90d_pct',2026,true,0,0,'{}'::jsonb),
  ('ONL-BAT90','online','% dos convertidos batizados em <=90 dias','Funil conversão→batismo: % dos novos convertidos do Online batizados em até 90 dias da decisão.','mensal',30,'>=30% batizados em <=90 dias',ARRAY['seguir']::text[],true,'ac906f19-970a-d651-8c84-28f02f01a923','manual','quantitativo','cuidados.batismo_90d_pct',2026,true,0,0,'{}'::jsonb),
  ('SED-BAT90','sede','% dos convertidos batizados em <=90 dias','Funil conversão→batismo: % dos novos convertidos da Sede batizados em até 90 dias da decisão.','mensal',30,'>=30% batizados em <=90 dias',ARRAY['seguir']::text[],true,'ac906f19-970a-d651-8c84-28f02f01a923','manual','quantitativo','cuidados.batismo_90d_pct',2026,true,0,0,'{}'::jsonb),
  -- Next <=90d · objetivo "Aumentar frequência NEXT" (68c17f72)
  ('AMI-NEXT90','ami','% dos convertidos que fizeram o Next em <=90 dias','Funil conversão→Next: % dos novos convertidos do AMI que participaram do Next em até 90 dias.','mensal',30,'>=30% no Next em <=90 dias',ARRAY['seguir']::text[],true,'68c17f72-72a3-2369-8d30-dc1f9db88a47','manual','quantitativo','cuidados.next_90d_pct',2026,true,0,0,'{}'::jsonb),
  ('BRG-NEXT90','bridge','% dos convertidos que fizeram o Next em <=90 dias','Funil conversão→Next: % dos novos convertidos do Bridge que participaram do Next em até 90 dias.','mensal',30,'>=30% no Next em <=90 dias',ARRAY['seguir']::text[],true,'68c17f72-72a3-2369-8d30-dc1f9db88a47','manual','quantitativo','cuidados.next_90d_pct',2026,true,0,0,'{}'::jsonb),
  ('ONL-NEXT90','online','% dos convertidos que fizeram o Next em <=90 dias','Funil conversão→Next: % dos novos convertidos do Online que participaram do Next em até 90 dias.','mensal',30,'>=30% no Next em <=90 dias',ARRAY['seguir']::text[],true,'68c17f72-72a3-2369-8d30-dc1f9db88a47','manual','quantitativo','cuidados.next_90d_pct',2026,true,0,0,'{}'::jsonb),
  ('SED-NEXT90','sede','% dos convertidos que fizeram o Next em <=90 dias','Funil conversão→Next: % dos novos convertidos da Sede que participaram do Next em até 90 dias.','mensal',30,'>=30% no Next em <=90 dias',ARRAY['seguir']::text[],true,'68c17f72-72a3-2369-8d30-dc1f9db88a47','manual','quantitativo','cuidados.next_90d_pct',2026,true,0,0,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Religar os táticos de "convertidos atendidos" → medir "% aceitou a reunião"
--    (sem criar KPI novo · objetivo 5ffafa58). Só ami/bridge/online/sede.
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET indicador     = '% dos convertidos que aceitaram a reunião de aconselhamento',
       descricao     = 'Dos novos convertidos, % que aceitou (agendou) a reunião de aconselhamento pastoral.',
       fonte_auto    = 'cuidados.reuniao_aceita_pct',
       tipo_calculo  = 'manual',
       meta_valor    = 70,
       meta_valor_absoluto = NULL,
       meta_descricao = '>=70% aceitam a reunião',
       updated_at    = now()
 WHERE id IN ('AMI-21','SED-17','BRG-19','ONL-04');

-- ----------------------------------------------------------------------------
-- 3. KRs · Next: troca "1 ciclo/trimestre" pelo "Next em <=90d"
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET ativo = false, updated_at = now()
 WHERE objetivo_geral_id = '68c17f72-72a3-2369-8d30-dc1f9db88a47'
   AND titulo ILIKE 'Ao menos 1 ciclo NEXT por trimestre%'
   AND ativo = true;

INSERT INTO public.kpi_krs
  (objetivo_geral_id, titulo, descricao, formula_calculo, meta_valor, meta_texto, unidade, ordem, ativo)
SELECT '68c17f72-72a3-2369-8d30-dc1f9db88a47',
       '>=30% dos novos convertidos fizeram o Next em <=90 dias',
       'Funil conversão→Next medido por janela de 90d. Auto via cui_convertidos + next_inscricoes (coletor cuidados.next_90d_pct).',
       'count(fizeram Next em <=90d da conversão) / total(convertidos)',
       30, '>=30% em 90 dias', '%', 3, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.kpi_krs
   WHERE objetivo_geral_id = '68c17f72-72a3-2369-8d30-dc1f9db88a47'
     AND titulo ILIKE '%Next em <=90 dias%'
);

-- ----------------------------------------------------------------------------
-- 4. KRs · Contato: "95% contato <=7d" → "70% aceitam a reunião"
-- ----------------------------------------------------------------------------
UPDATE public.kpi_krs
   SET titulo    = '>=70% dos convertidos aceitam a reunião de aconselhamento',
       descricao = 'Dos novos convertidos, % que aceitou a reunião pastoral. Auto via cui_convertidos.encontro_marcado (coletor cuidados.reuniao_aceita_pct). Contato em si (meta 100%) fica no operacional.',
       formula_calculo = 'count(aceitaram a reunião) / total(convertidos)',
       meta_valor = 70, meta_texto = '>=70% aceitam', unidade = '%',
       updated_at = now()
 WHERE objetivo_geral_id = '5ffafa58-a8ed-d248-a410-c4c8ffd69c14'
   AND titulo ILIKE '%contato pastoral em%7 dias%'
   AND ativo = true;

-- ----------------------------------------------------------------------------
-- Conferência (após aplicar + rodar o coletor):
--   POST /api/kpis/v2/coletar  body: { fontes: ['cuidados.'] }
--   SELECT id, area, indicador, fonte_auto, meta_valor FROM kpi_indicadores_taticos
--    WHERE fonte_auto LIKE 'cuidados.%90d%' OR fonte_auto='cuidados.reuniao_aceita_pct';
-- ============================================================================

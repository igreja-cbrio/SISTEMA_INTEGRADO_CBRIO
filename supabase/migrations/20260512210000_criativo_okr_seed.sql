-- ============================================================================
-- CRIATIVO · seed OKR + KPIs + SLAs
--
-- Roda DEPOIS da 20260512200000 (que adiciona 'criativo' ao enum).
-- Usa DO/EXECUTE pra adiar parse do enum literal.
-- ============================================================================

-- SLAs (mesmo padrao das outras areas adm)
DO $$
BEGIN
  EXECUTE $sql$
    INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao)
    VALUES
      ('criativo'::area_adm_resp, 'default', false, 168, 336, 'Padrao · 1 sem resposta + 2 sem execucao'),
      ('criativo'::area_adm_resp, 'default', true,  24,  72,  'Urgente · resposta em 1 dia + execucao em 3 dias')
    ON CONFLICT (area_responsavel, subcategoria, eh_urgente) DO NOTHING
  $sql$;
END $$;

-- OKR Geral · Criativo
INSERT INTO public.kpi_objetivos_gerais (id, direcionador_id, nome, indicador_geral, valores, ordem, ativo, tipo_okr)
VALUES
  ('a1adb000-0009-0009-0009-00000000a009'::uuid, '11111111-1111-1111-1111-111111111111',
   'Criativo · suporte de marca, comunicacao e producao',
   '% entregas criativas no SLA + NPS interno',
   ARRAY[]::text[], 38, true, 'operacional')
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  indicador_geral = EXCLUDED.indicador_geral,
  tipo_okr = EXCLUDED.tipo_okr,
  ordem = EXCLUDED.ordem;

-- KPIs taticos do Criativo (3 padrao)
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, formula_config
) VALUES
  ('ADM-CRI-01', '% resposta no SLA', 'Solicitacoes criativas respondidas no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', true, true,
   'a1adb000-0009-0009-0009-00000000a009'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"criativo","metrica":"resposta_no_sla"}'::jsonb),
  ('ADM-CRI-02', '% entrega no SLA', 'Entregas criativas concluidas no prazo',
   'sede', ARRAY[]::text[], 'mensal', '>=85%', 85, '%', true, true,
   'a1adb000-0009-0009-0009-00000000a009'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"criativo","metrica":"resolucao_no_sla"}'::jsonb),
  ('ADM-CRI-03', 'NPS interno', 'Avaliacao dos ministerios sobre Criativo',
   'sede', ARRAY[]::text[], 'trimestral', '>=8', 8, 'nota', false, true,
   'a1adb000-0009-0009-0009-00000000a009'::uuid, 'operacional', 'razao',
   '{"fonte":"solicitacoes","area_responsavel":"criativo","metrica":"nps_medio"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  indicador = EXCLUDED.indicador,
  descricao = EXCLUDED.descricao,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor = EXCLUDED.meta_valor,
  formula_config = EXCLUDED.formula_config,
  updated_at = now();

-- Conferencia:
-- SELECT count(*) FROM kpi_indicadores_taticos WHERE tipo_kpi='operacional' AND ativo;
-- Espera: 27 (8 areas anteriores × 3 + criativo × 3 = 27)

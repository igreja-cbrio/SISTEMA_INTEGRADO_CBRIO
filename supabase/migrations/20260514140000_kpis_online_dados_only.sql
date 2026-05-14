-- ============================================================================
-- KPIs especificos do Online · so na /minha-area, NAO entram no painel NSM
--
-- Marcos: "enquadre isso como dados apenas e crie kpis específicos do online
--          que só são do online (entao eles nao entram no painel nsm pois nao
--          tem cross, so entram na minha area)"
--
-- Dados ja salvos em cultos.online_pico, cultos.online_ds, cultos.online_ddus
-- (modal de culto · CalendarioCultos.jsx · so quando service_type.has_online).
-- Agora viram 3 KPIs com area='online', valores=NULL.
--
-- Por que NAO entram no painel/mandala:
-- - backend/routes/painel.js mandalas/matriz filtra por
--   `Array.isArray(k.valores) && k.valores.includes(v)`
-- - valores=NULL → filtro retorna false pra todos os 5 valores da Jornada
-- - Logo nao aparece em mandalas, nem na matriz Valor × Area
--
-- Por que aparecem em /minha-area:
-- - src/pages/MinhaArea.jsx line 149 · meusKpis = kpis.filter(k => k.ativo)
-- - Filtra so por ativo · qualquer KPI com area='online' aparece pra quem tem
--   essa kpi_area no profile (Comunicacao / Online)
--
-- Coletores ja adicionados em backend/services/kpiAutoCollector.js:
-- - 'cultos.online_pico_avg'  · media de cultos.online_pico no periodo
-- - 'cultos.online_ds_total'  · soma de cultos.online_ds no periodo
-- - 'cultos.online_ddus_total'· soma de cultos.online_ddus no periodo
--
-- Marcos plane to automate online_ds/online_ddus via agentes/API YouTube
-- depois (ja existe parcial em cultos.ds_coletado_em via YT collector). Ate la
-- preenche-se manual no modal de culto.
-- ============================================================================

INSERT INTO public.kpi_indicadores_taticos (
  id, area, indicador, periodicidade,
  meta_descricao, meta_valor, unidade,
  apuracao, responsavel_area, ativo, sort_order, ano,
  valores, pilar, fonte_auto, tipo_calculo, descricao
) VALUES
  (
    'ON-AUD-01', 'online',
    'Audiencia online de pico (media mensal)', 'mensal',
    'Definir com Marcos', NULL, 'pessoas',
    'Media de cultos.online_pico nos cultos do mes que tiveram transmissao',
    'Online', true, 90, 2026,
    NULL, 'Comunicacao Online',
    'cultos.online_pico_avg', 'manual',
    'Tamanho medio da audiencia simultanea no pico das transmissoes do mes'
  ),
  (
    'ON-DS-01', 'online',
    'Views D+1 (total mensal)', 'mensal',
    'Definir com Marcos', NULL, 'views',
    'Soma de cultos.online_ds nos cultos do mes (Daily Stream · D+1)',
    'Online', true, 91, 2026,
    NULL, 'Comunicacao Online',
    'cultos.online_ds_total', 'manual',
    'Total de views ate 24h apos a transmissao · coletado via cron YouTube ou manual'
  ),
  (
    'ON-DDUS-01', 'online',
    'Views D+7 on-demand (total mensal)', 'mensal',
    'Definir com Marcos', NULL, 'views',
    'Soma de cultos.online_ddus nos cultos do mes (Daily Demand Users · D+7)',
    'Online', true, 92, 2026,
    NULL, 'Comunicacao Online',
    'cultos.online_ddus_total', 'manual',
    'Total de views on-demand ate 7 dias apos a transmissao · coletado via cron YouTube ou manual'
  )
ON CONFLICT (id) DO UPDATE SET
  area              = EXCLUDED.area,
  indicador         = EXCLUDED.indicador,
  periodicidade     = EXCLUDED.periodicidade,
  apuracao          = EXCLUDED.apuracao,
  responsavel_area  = EXCLUDED.responsavel_area,
  ativo             = EXCLUDED.ativo,
  sort_order        = EXCLUDED.sort_order,
  ano               = EXCLUDED.ano,
  valores           = EXCLUDED.valores,
  pilar             = EXCLUDED.pilar,
  fonte_auto        = EXCLUDED.fonte_auto,
  tipo_calculo      = EXCLUDED.tipo_calculo,
  descricao         = EXCLUDED.descricao,
  updated_at        = now();

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT id, area, indicador, valores, fonte_auto, ativo
--     FROM kpi_indicadores_taticos
--    WHERE id IN ('ON-AUD-01', 'ON-DS-01', 'ON-DDUS-01');
--   Espera: valores=NULL, fonte_auto definido, ativo=true
--
-- Recalculo manual (depois da migration · gera os 3 registros do periodo atual):
--   POST /api/kpis/v2/coletar  body: { fontes: ['cultos.online_'] }
-- ============================================================================

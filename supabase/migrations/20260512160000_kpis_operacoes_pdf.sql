-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ KPIs de Operacoes (sustenta a NSM) - PDF Planejamento Estrategico 2026║
-- ║                                                                       ║
-- ║ Os 3 KPIs estrategicos OPE-FINANCEIRO, OPE-CULTURA, OPE-EXPANSAO ja   ║
-- ║ existem desde 20260428110000. Esta migration adiciona:                ║
-- ║   - As 3 areas administrativas em areas_kpi                           ║
-- ║   - Os 9 indicadores taticos vinculados aos OPE-*                     ║
-- ║                                                                       ║
-- ║ Importante: esses KPIs NAO entram no calculo do NSM (so as areas      ║
-- ║ Kids/Bridge/AMI/Sede/Online/CBA alimentam o NSM via mem_membros e     ║
-- ║ int_visitantes). Aparecem em /processos, /minha-area, /dados-brutos   ║
-- ║ e na vw_kpi_trajetoria_atual.                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ── 1. Areas administrativas em areas_kpi ──────────────────────────────
INSERT INTO public.areas_kpi (id, nome, descricao, categoria, cor_hex, ordem, ativa)
VALUES
  ('financeiro',     'Financeiro',     'Gestao financeira institucional - orcamento, caixa, contas a pagar', 'administrativo', '#10B981', 40, true),
  ('rh',             'RH',             'Recursos Humanos - cultura, clima, rotatividade do staff',          'administrativo', '#F59E0B', 41, true),
  ('infraestrutura', 'Infraestrutura', 'Gestao estrategica de infra e prontidao de expansao',               'administrativo', '#6B7280', 42, true)
ON CONFLICT (id) DO UPDATE SET
  nome      = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  cor_hex   = EXCLUDED.cor_hex,
  ordem     = EXCLUDED.ordem,
  ativa     = EXCLUDED.ativa;

-- ── 2. Indicadores taticos de Operacoes ────────────────────────────────
INSERT INTO public.kpi_indicadores_taticos
  (id, kpi_estrategico_id, area, indicador, periodicidade, meta_descricao,
   meta_valor, unidade, apuracao, responsavel_area, sort_order)
VALUES
  -- ── Financeiro (3) - vinculados a OPE-FINANCEIRO ──────────────────────
  ('FIN-01', 'OPE-FINANCEIRO', 'financeiro',
   '% de despesas dentro do orcamento',
   'mensal',
   '80% das despesas dentro do orcamento aprovado',
   80, '%',
   'Acompanhamento do planejado vs executado no LouvaDeus / Power BI',
   'Gestao Estrategica / Financeiro', 1),

  ('FIN-02', 'OPE-FINANCEIRO', 'financeiro',
   '% reserva de caixa',
   'mensal',
   '100% da reserva minima de caixa preservada',
   100, '%',
   'Acompanhamento por meio de relatorios financeiros mensais',
   'Gestao Estrategica / Financeiro', 2),

  ('FIN-03', 'OPE-FINANCEIRO', 'financeiro',
   '% cumprimento de prazos de pagamento (internos e externos)',
   'mensal',
   '90% dos pagamentos quitados dentro do prazo acordado',
   90, '%',
   'Consolidacao e aprimoramento do sistema de Contas a Pagar',
   'Gestao Estrategica / Financeiro', 3),

  -- ── RH (3) - vinculados a OPE-CULTURA ─────────────────────────────────
  ('RH-01', 'OPE-CULTURA', 'rh',
   'Nota Q12 (Gallup)',
   'anual',
   '>= 4,3 na pesquisa Q12 (clima organizacional)',
   4.3, 'nota',
   'Avaliacao anual pela plataforma do Gallup',
   'RH', 1),

  ('RH-02', 'OPE-CULTURA', 'rh',
   'Engajamento nos treinamentos propostos',
   'mensal',
   '80% de presenca nos treinamentos oferecidos ao staff',
   80, '%',
   'Planilha de presenca dos treinamentos internos',
   'RH', 2),

  ('RH-03', 'OPE-CULTURA', 'rh',
   'Rotatividade do Staff',
   'mensal',
   '< 10% de rotatividade no ano (turnover anualizado)',
   10, '%',
   'Acompanhamento via planilha de pessoal (admissoes vs desligamentos)',
   'RH', 3),

  -- ── Infraestrutura (2) - vinculados a OPE-EXPANSAO ────────────────────
  ('INFRA-01', 'OPE-EXPANSAO', 'infraestrutura',
   '% cronogramas cumpridos no prazo',
   'mensal',
   '85% dos cronogramas de expansao/obra cumpridos no prazo',
   85, '%',
   'Medicao com base no calendario institucional da CBRio',
   'Gestao Estrategica / Infraestrutura', 1),

  ('INFRA-02', 'OPE-EXPANSAO', 'infraestrutura',
   '% orcamentos respeitados',
   'mensal',
   '90% dos orcamentos respeitados (sem estouro nas compras)',
   90, '%',
   'Consolidacao de relatorios com memorias de calculo atreladas a cada compra',
   'Gestao Estrategica / Infraestrutura', 2)

ON CONFLICT (id) DO UPDATE SET
  kpi_estrategico_id = EXCLUDED.kpi_estrategico_id,
  area               = EXCLUDED.area,
  indicador          = EXCLUDED.indicador,
  periodicidade      = EXCLUDED.periodicidade,
  meta_descricao     = EXCLUDED.meta_descricao,
  meta_valor         = EXCLUDED.meta_valor,
  unidade            = EXCLUDED.unidade,
  apuracao           = EXCLUDED.apuracao,
  responsavel_area   = EXCLUDED.responsavel_area,
  sort_order         = EXCLUDED.sort_order,
  updated_at         = now();

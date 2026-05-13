-- ============================================================================
-- Backfill: solicitacoes de servir (voluntariado) · 2024-02 a 2026-05
--
-- Fonte: planilha "Inscricao voluntariado (respostas)" do Google Form.
-- Cada linha = 1 inscricao no formulario indicando vontade de servir.
--
-- Mapeamento da legenda da planilha:
--   verde claro (FFB6D7A8) = ENVIADO AO MINISTERIO
--   verde escuro (FF6AA84F) = VOLUNTARIO INTEGRADO  -> conta como ALOCADA
--   magenta (FFFF00FF) = KIDS
--   laranja (FFFF9900) = NAO RESPONDE
--   vermelho (FFFF0000) = NAO PODE SERVIR OU DUPLICATA
--   sem cor = ainda em triagem
--
-- Tipos populados:
--   solicitacoes_servir_recebidas = TOTAL de inscricoes do mes (749 ao todo)
--   solicitacoes_servir_alocadas  = inscritos com status "integrado" (550 ao todo)
--
-- Area: voluntariado.
-- granularidade: 1 registro por mes, data = primeiro dia do mes.
-- origem: 'importado'.
--
-- Razao alocadas/recebidas alimenta o OKR "Garantir que todos que desejam
-- servir sejam alocados em alguma area".
--
-- Tambem libera os 2 tipos para entrada manual (/dados-brutos) ate o modulo
-- Solicitacoes capturar voluntariado nativamente.
-- ============================================================================

-- 1) Permite entrada manual nesses 2 tipos enquanto nao temos modulo proprio
UPDATE public.tipos_dado_bruto
   SET entrada_manual = true
 WHERE id IN ('solicitacoes_servir_recebidas', 'solicitacoes_servir_alocadas');

-- 2) Backfill mensal
INSERT INTO public.dados_brutos (tipo_id, area, data, valor, observacao, origem)
VALUES
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-02-01'::date, 3, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-03-01'::date, 18, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-04-01'::date, 29, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-05-01'::date, 49, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-06-01'::date, 15, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-07-01'::date, 31, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-08-01'::date, 31, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-09-01'::date, 41, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-10-01'::date, 8, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-11-01'::date, 15, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2024-12-01'::date, 11, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-01-01'::date, 82, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-02-01'::date, 39, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-03-01'::date, 25, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-04-01'::date, 29, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-05-01'::date, 22, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-06-01'::date, 26, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-07-01'::date, 21, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-08-01'::date, 32, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-09-01'::date, 10, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-10-01'::date, 41, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-11-01'::date, 17, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2025-12-01'::date, 7, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2026-01-01'::date, 35, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2026-02-01'::date, 23, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2026-03-01'::date, 51, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2026-04-01'::date, 34, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_recebidas', 'voluntariado', '2026-05-01'::date, 4, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),

  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-03-01'::date, 18, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-04-01'::date, 26, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-05-01'::date, 47, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-06-01'::date, 15, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-07-01'::date, 29, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-08-01'::date, 31, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-09-01'::date, 40, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-10-01'::date, 8, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-11-01'::date, 15, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2024-12-01'::date, 11, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-01-01'::date, 82, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-02-01'::date, 39, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-03-01'::date, 25, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-04-01'::date, 29, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-05-01'::date, 22, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-06-01'::date, 6, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-07-01'::date, 1, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-10-01'::date, 18, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2025-11-01'::date, 4, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2026-01-01'::date, 27, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2026-02-01'::date, 16, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2026-03-01'::date, 32, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado'),
  ('solicitacoes_servir_alocadas',  'voluntariado', '2026-04-01'::date, 9, 'Backfill da planilha Inscricao voluntariado (formulario Google)', 'importado')
ON CONFLICT (tipo_id, area, data, contexto)
DO UPDATE SET
  valor = EXCLUDED.valor,
  observacao = EXCLUDED.observacao,
  origem = EXCLUDED.origem;

-- Conferencia (apos aplicar):
-- SELECT tipo_id, sum(valor) FROM dados_brutos
--  WHERE tipo_id IN ('solicitacoes_servir_recebidas','solicitacoes_servir_alocadas')
--    AND area='voluntariado'
--  GROUP BY tipo_id;
-- Esperado:
--   solicitacoes_servir_recebidas  749
--   solicitacoes_servir_alocadas   550
-- ============================================================================

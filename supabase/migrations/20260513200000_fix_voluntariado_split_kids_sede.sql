-- ============================================================================
-- Fix: solicitacoes de servir · split por segmento (kids vs sede)
--
-- Problema: migration 20260513190000 inseriu os dados em area='voluntariado'
-- mas o painel/matriz filtra dados_brutos por area in (kids/ami/bridge/sede/online).
-- Com isso a celula Voluntariado×Servir aparecia "Sem dado".
--
-- Solucao: re-classificar usando a planilha:
--   - kids: linhas onde "Entre as areas escolhidas, voce escolheu KIDS? = Sim"
--           OU "ministerio de interesse" inclui 'kids' (174 inscricoes)
--   - sede: todas as demais (575 inscricoes)
--
-- Reagregacao por segmento (a soma bate com o total original):
--   kids_recebidas=174, kids_alocadas=125
--   sede_recebidas=575, sede_alocadas=425
--   TOTAL=749 recebidas, 550 alocadas (bate com importacao anterior)
-- ============================================================================

-- 1) Limpa lancamentos previos em area='voluntariado'
DELETE FROM public.dados_brutos
 WHERE area = 'voluntariado'
   AND tipo_id IN ('solicitacoes_servir_recebidas', 'solicitacoes_servir_alocadas');

-- 2) Re-insere em area='kids' e area='sede'
INSERT INTO public.dados_brutos (tipo_id, area, data, valor, observacao, origem)
VALUES
  ('solicitacoes_servir_recebidas', 'sede', '2024-02-01'::date, 3, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-03-01'::date, 18, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-03-01'::date, 18, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-04-01'::date, 29, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-04-01'::date, 26, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-05-01'::date, 49, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-05-01'::date, 47, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-06-01'::date, 15, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-06-01'::date, 15, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-07-01'::date, 31, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-07-01'::date, 29, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-08-01'::date, 31, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-08-01'::date, 31, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2024-09-01'::date, 8, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2024-09-01'::date, 8, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-09-01'::date, 33, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-09-01'::date, 32, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-10-01'::date, 8, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-10-01'::date, 8, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2024-11-01'::date, 4, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2024-11-01'::date, 4, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-11-01'::date, 11, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-11-01'::date, 11, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2024-12-01'::date, 6, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2024-12-01'::date, 6, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2024-12-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2024-12-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-01-01'::date, 35, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-01-01'::date, 35, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-01-01'::date, 47, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-01-01'::date, 47, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-02-01'::date, 17, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-02-01'::date, 17, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-02-01'::date, 22, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-02-01'::date, 22, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-03-01'::date, 8, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-03-01'::date, 8, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-03-01'::date, 17, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-03-01'::date, 17, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-04-01'::date, 7, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-04-01'::date, 7, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-04-01'::date, 22, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-04-01'::date, 22, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-05-01'::date, 4, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-05-01'::date, 4, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-05-01'::date, 18, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-05-01'::date, 18, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-06-01'::date, 7, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-06-01'::date, 1, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-06-01'::date, 19, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-06-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-07-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-07-01'::date, 16, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-07-01'::date, 1, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-08-01'::date, 8, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-08-01'::date, 24, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-09-01'::date, 1, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-09-01'::date, 9, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-10-01'::date, 14, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-10-01'::date, 4, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-10-01'::date, 27, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2025-10-01'::date, 14, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-11-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2025-11-01'::date, 4, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-11-01'::date, 12, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2025-12-01'::date, 2, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2025-12-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2026-01-01'::date, 15, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2026-01-01'::date, 14, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2026-01-01'::date, 20, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2026-01-01'::date, 13, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2026-02-01'::date, 7, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2026-02-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2026-02-01'::date, 16, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2026-02-01'::date, 11, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2026-03-01'::date, 7, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2026-03-01'::date, 5, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2026-03-01'::date, 44, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2026-03-01'::date, 27, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'kids', '2026-04-01'::date, 14, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'kids', '2026-04-01'::date, 3, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2026-04-01'::date, 20, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_alocadas',  'sede', '2026-04-01'::date, 6, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado'),
  ('solicitacoes_servir_recebidas', 'sede', '2026-05-01'::date, 4, 'Backfill planilha Inscricao voluntariado (split por Kids vs Sede)', 'importado')
ON CONFLICT (tipo_id, area, data, contexto)
DO UPDATE SET valor = EXCLUDED.valor, observacao = EXCLUDED.observacao, origem = EXCLUDED.origem;

-- Conferencia:
-- SELECT tipo_id, area, sum(valor)
--   FROM dados_brutos
--  WHERE tipo_id IN ('solicitacoes_servir_recebidas','solicitacoes_servir_alocadas')
--  GROUP BY tipo_id, area
--  ORDER BY tipo_id, area;
-- Esperado:
--   alocadas  | kids | 125
--   alocadas  | sede | 425
--   recebidas | kids | 174
--   recebidas | sede | 575
-- ============================================================================

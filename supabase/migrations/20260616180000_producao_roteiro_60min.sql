-- ============================================================================
-- Produção · roteiro padrão = 60:00 certinho (+ 3:00 pós-culto)
--
-- Marcos (2026-06-16): o roteiro PADRÃO do culto deve ter previsto = exatamente
-- 60:00 (a equipe pode aumentar depois, na aba Modelos), e o pós-culto 3:00.
-- O seed inicial (20260616140000) somava 61:00. Aqui redefinimos o roteiro
-- GERAL (service_type_id IS NULL) para 60:00 culto + 3:00 pós, mantendo os
-- nomes dos momentos (consistência do relatório · nomes travados no modal).
--
-- Reset só do GERAL (roteiros por tipo, se existirem, ficam intactos).
-- Idempotente: roda quantas vezes precisar → sempre termina com estes 10 momentos.
-- ============================================================================

DELETE FROM public.producao_roteiro_etapas WHERE service_type_id IS NULL;

INSERT INTO public.producao_roteiro_etapas (service_type_id, ordem, titulo, previsto_seg, secao, ativo)
VALUES
  (NULL, 1,  'Música 1',            360,  'culto',     true),  -- 6:00
  (NULL, 2,  'Música 2',            360,  'culto',     true),  -- 6:00
  (NULL, 3,  'Música 3',            300,  'culto',     true),  -- 5:00
  (NULL, 4,  'Intercessão',          60,  'culto',     true),  -- 1:00
  (NULL, 5,  'Vídeo Pré Pregação',  120,  'culto',     true),  -- 2:00
  (NULL, 6,  'Pregação',           1800,  'culto',     true),  -- 30:00
  (NULL, 7,  'Apelo',               300,  'culto',     true),  -- 5:00
  (NULL, 8,  'Dízimos e Ofertas',   180,  'culto',     true),  -- 3:00
  (NULL, 9,  'Avisos / Benção',     120,  'culto',     true),  -- 2:00
  (NULL, 10, 'Pós Culto',           180,  'pos_culto', true);  -- 3:00
-- culto = 3600s (60:00) · + pós 180s (3:00)

-- Conferência:
--   SELECT secao, SUM(previsto_seg) FROM producao_roteiro_etapas
--    WHERE service_type_id IS NULL GROUP BY secao;  -- culto=3600, pos_culto=180

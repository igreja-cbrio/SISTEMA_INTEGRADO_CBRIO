-- ============================================================================
-- Produção · PREVISTO do culto = 60:00 certinho (era 61:00)
--
-- Marcos (2026-06-16): a previsão do culto deve fechar 60:00 redondo, não 61:00.
-- Reduz um pouco músicas / dízimo / avisos pra chegar no número redondo.
--
-- SELF-CONTAINED: reseta o roteiro GERAL pro previsto reduzido (60:00) com os
-- NOMES CANÔNICOS (com hífen · "Vídeo Pré-Pregação", "Pós-Culto"), e corrige a
-- carga de 2026-06-14 (padroniza os nomes + ajusta o previsto · executado intacto).
-- Supersede a 20260616180000 (que não chegou a ser aplicada em prod).
-- ============================================================================

-- 1) Roteiro GERAL → previsto reduzido (culto = 3600s = 60:00)
DELETE FROM public.producao_roteiro_etapas WHERE service_type_id IS NULL;
INSERT INTO public.producao_roteiro_etapas (service_type_id, ordem, titulo, previsto_seg, secao, ativo)
VALUES
  (NULL, 1,  'Música 1',            330,  'culto',     true),  -- 5:30
  (NULL, 2,  'Música 2',            390,  'culto',     true),  -- 6:30
  (NULL, 3,  'Música 3',            330,  'culto',     true),  -- 5:30
  (NULL, 4,  'Intercessão',          60,  'culto',     true),  -- 1:00
  (NULL, 5,  'Vídeo Pré-Pregação',  110,  'culto',     true),  -- 1:50
  (NULL, 6,  'Pregação',           1800,  'culto',     true),  -- 30:00
  (NULL, 7,  'Apelo',               300,  'culto',     true),  -- 5:00
  (NULL, 8,  'Dízimos e Ofertas',   170,  'culto',     true),  -- 2:50
  (NULL, 9,  'Avisos / Benção',     110,  'culto',     true),  -- 1:50
  (NULL, 10, 'Pós-Culto',           180,  'pos_culto', true);  -- 3:00
-- culto = 330+390+330+60+110+1800+300+170+110 = 3600 (60:00)

-- 2) Carga de 2026-06-14 · padroniza os nomes p/ a forma canônica do roteiro
UPDATE public.culto_producao_etapas SET titulo = 'Vídeo Pré-Pregação'
 WHERE titulo = 'Vídeo Pré Pregação'
   AND culto_id IN (SELECT id FROM public.cultos WHERE data = '2026-06-14');
UPDATE public.culto_producao_etapas SET titulo = 'Pós-Culto'
 WHERE titulo = 'Pós Culto'
   AND culto_id IN (SELECT id FROM public.cultos WHERE data = '2026-06-14');

-- 3) Carga de 2026-06-14 · previsto dos momentos padrão = reduzido (executado intacto)
UPDATE public.culto_producao_etapas e
SET previsto_seg = a.prev
FROM (VALUES
  ('Música 1', 330), ('Música 2', 390), ('Música 3', 330), ('Intercessão', 60),
  ('Vídeo Pré-Pregação', 110), ('Pregação', 1800), ('Apelo', 300),
  ('Dízimos e Ofertas', 170), ('Avisos / Benção', 110)
) AS a(titulo, prev)
WHERE e.titulo = a.titulo
  AND e.culto_id IN (SELECT id FROM public.cultos WHERE data = '2026-06-14');

-- 4) Recomputa duracao_prevista_seg (soma do previsto da seção 'culto') por culto
UPDATE public.culto_producao cp
SET duracao_prevista_seg = s.tot, updated_at = now()
FROM (
  SELECT culto_id, SUM(previsto_seg) AS tot
    FROM public.culto_producao_etapas
   WHERE secao = 'culto' AND previsto_seg IS NOT NULL
     AND culto_id IN (SELECT id FROM public.cultos WHERE data = '2026-06-14')
   GROUP BY culto_id
) s
WHERE cp.culto_id = s.culto_id;

-- NOTA: o culto das 10:00 tem "Apresentação de Criança" (extra · 2:00) além dos
-- 9 momentos padrão · por isso o previsto dele fica 62:00 (60:00 + 2:00), não 60:00.
--
-- Conferência:
--   SELECT secao, SUM(previsto_seg) FROM producao_roteiro_etapas
--    WHERE service_type_id IS NULL GROUP BY secao;  -- culto=3600, pos_culto=180
-- ============================================================================

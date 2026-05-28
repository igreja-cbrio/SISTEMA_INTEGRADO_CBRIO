-- ============================================================================
-- MIGRATION · Marketing · Refator das etiquetas tipo (Spec 017)
-- ============================================================================
-- Marcos 2026-05-28: o modelo atual mistura conceitos. "Artes" e "Impressos"
-- nao sao entregas separadas (impresso = arte + impressao). Esforco varia
-- demais entre subtipos · "Artes" cobre post de 30min e banner 16h.
--
-- Decisao: substituir 8 tipos guarda-chuva por 16 ENTREGAS CONCRETAS. Toda
-- entrega visual tem arte embutida no esforco · "arte" some como tipo.
--
-- Estrategia migration:
--   1. Soft-deactivate os 8 tipos antigos (ativo=false)
--      · 1 card ja referencia um deles (mantemos FK · UI nao oferece mais)
--   2. INSERT 16 entregas novas com cores agrupadas por canal:
--      · rosa = redes sociais (4)
--      · ambar = impressos (3)
--      · azul = audiovisual (5)
--      · roxo = eventos fisicos (2)
--      · verde = marca (2)
--   3. SLAs sugeridos preliminares (Pedro/Marcos refinam via /marketing/admin)
-- ============================================================================

-- 1. Soft-deactivate os 8 tipos antigos
UPDATE public.marketing_etiquetas_tipo
   SET ativo = false
 WHERE slug IN (
   'redes_sociais',
   'artes',
   'pecas_fisicas',
   'mockup',
   'videos',
   'fotos',
   'impressos',
   'identidade_marca'
 );

-- 2. INSERT 16 entregas novas
-- Cores por canal · ordem reflete frequencia esperada (~80% sao redes sociais + audiovisual)

INSERT INTO public.marketing_etiquetas_tipo
  (slug, nome, habilidade_padrao, esforco_max_h, cor, ordem, ativo)
VALUES
  -- Redes Sociais (rosa)
  ('post_redes',       'Post · Redes Sociais',        'social_media',  2,  '#EC4899',  10, true),
  ('carrossel_redes',  'Carrossel · Redes Sociais',   'social_media',  4,  '#EC4899',  11, true),
  ('story_redes',      'Story · Redes Sociais',       'social_media',  1,  '#F472B6',  12, true),
  ('reels_redes',      'Reels · Redes Sociais',       'videomaker',    4,  '#F472B6',  13, true),

  -- Audiovisual (azul)
  ('video_curto',      'Vídeo curto (<=1min)',        'videomaker',    4,  '#0EA5E9',  20, true),
  ('aftermovie',       'Aftermovie de evento',        'videomaker',   16,  '#0284C7',  21, true),
  ('motion',           'Motion / Animação',           'videomaker',    6,  '#38BDF8',  22, true),
  ('foto_evento',      'Foto de evento (cobertura)',  'fotografo',     6,  '#0EA5E9',  23, true),
  ('foto_retrato',     'Foto retrato / sessão',       'fotografo',     3,  '#7DD3FC',  24, true),

  -- Impressos (âmbar)
  ('cartaz_folder',    'Cartaz / Folder',             'designer',      4,  '#F59E0B',  30, true),
  ('banner_lona',      'Banner / Lona grande',        'designer',      6,  '#F59E0B',  31, true),
  ('adesivo',          'Adesivo / Etiqueta',          'designer',      2,  '#FBBF24',  32, true),

  -- Eventos físicos (roxo)
  ('mockup',           'Mockup de aplicação',         'designer',      4,  '#A855F7',  40, true),
  ('telao_led',        'Telão LED / Projeção',        'designer',      4,  '#A855F7',  41, true),

  -- Marca (verde)
  ('logo',             'Logo (criação ou refino)',    'designer',     16,  '#10B981',  50, true),
  ('identidade_visual','Identidade visual completa', 'designer',     40,  '#059669',  51, true)
ON CONFLICT (slug) DO UPDATE
  SET nome              = EXCLUDED.nome,
      habilidade_padrao = EXCLUDED.habilidade_padrao,
      esforco_max_h     = COALESCE(public.marketing_etiquetas_tipo.esforco_max_h, EXCLUDED.esforco_max_h),
      cor               = EXCLUDED.cor,
      ordem             = EXCLUDED.ordem,
      ativo             = true;

-- 3. Reordenar antigos pro fim (cosmético · se algum dia reativarem)
UPDATE public.marketing_etiquetas_tipo
   SET ordem = ordem + 900
 WHERE ativo = false AND ordem < 900;

-- 4. Comentário explicativo
COMMENT ON COLUMN public.marketing_etiquetas_tipo.nome IS
  'Nome da entrega CONCRETA (não guarda-chuva). Spec 017 refatorou os 8 tipos antigos por 16 entregas específicas com SLAs editáveis.';

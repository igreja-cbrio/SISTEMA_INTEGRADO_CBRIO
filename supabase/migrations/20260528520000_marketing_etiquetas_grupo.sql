-- ============================================================================
-- Marketing · intake em cascata (grupo -> entregavel)
-- Marcos 2026-05-28: o solicitante escolhe em 2 menus · menu1 = balde macro
-- (Rede Social / Videos e Fotos / Artes) · menu2 = entregavel filtrado pelo balde.
-- O "destino" (interno/externo/...) sai do form e vira etiqueta interna do Pedro.
--
-- Adiciona coluna `grupo` em marketing_etiquetas_tipo + seed dos 16 entregaveis.
-- Data-driven: Pedro pode re-mapear/criar entregavel pelo admin sem migration.
-- Idempotente.
-- ============================================================================
BEGIN;

ALTER TABLE public.marketing_etiquetas_tipo ADD COLUMN IF NOT EXISTS grupo text;
COMMENT ON COLUMN public.marketing_etiquetas_tipo.grupo IS
  'Balde macro do intake em cascata (/solicitacoes): rede_social | video_foto | artes. '
  'Menu1 do solicitante; menu2 filtra os entregaveis deste grupo.';

-- Rede Social
UPDATE public.marketing_etiquetas_tipo SET grupo = 'rede_social'
 WHERE slug IN ('post_redes', 'carrossel_redes', 'story_redes', 'reels_redes');

-- Videos e Fotos (audiovisual)
UPDATE public.marketing_etiquetas_tipo SET grupo = 'video_foto'
 WHERE slug IN ('video_curto', 'aftermovie', 'motion', 'foto_evento', 'foto_retrato');

-- Artes (impressos + eventos fisicos + marca)
UPDATE public.marketing_etiquetas_tipo SET grupo = 'artes'
 WHERE slug IN ('cartaz_folder', 'banner_lona', 'adesivo', 'mockup', 'telao_led', 'logo', 'identidade_visual');

COMMIT;

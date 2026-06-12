-- ============================================================================
-- Cultos sao na raiz · sem prefixo /ministerial
-- ============================================================================
-- Marcos (2026-05-21): "tire o endpoint /ministerial coloque so /ami" para
-- os 4 modulos de culto (kids, ami, bridge, online).
--
-- A rota no banco e' usada por menu/redirects · alinhar com frontend.
-- ============================================================================

UPDATE public.modulos SET rota = '/kids'   WHERE slug = 'kids';
UPDATE public.modulos SET rota = '/ami'    WHERE slug = 'ami';
UPDATE public.modulos SET rota = '/bridge' WHERE slug = 'bridge';
UPDATE public.modulos SET rota = '/online' WHERE slug = 'online';

-- Conferencia:
-- SELECT slug, nome, rota FROM modulos WHERE slug IN ('kids','ami','bridge','online');

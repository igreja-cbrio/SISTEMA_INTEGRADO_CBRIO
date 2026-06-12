-- ============================================================================
-- Quarta com Deus tambem tem kids · Marcos: "o culto de quarta tem kids tambem"
-- Ajusta a config do ModalCulto pra mostrar input "Kids" tambem na quarta.
-- ============================================================================

UPDATE public.vol_service_types
   SET has_kids   = true,
       updated_at = now()
 WHERE name = 'Quarta com Deus';

-- Conferencia:
--   SELECT name, presencial_label, has_kids, has_online
--     FROM vol_service_types WHERE name = 'Quarta com Deus';
--   Espera: Presencial · t · t
-- ============================================================================

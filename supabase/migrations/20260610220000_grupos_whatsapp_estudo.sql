-- ============================================================================
-- Grupos · estudo da semana via bot WhatsApp (2026-06-10)
--
-- Marcos: toda semana o bot manda o estudo pros líderes de grupos. O material
-- vive na aba Materiais (mem_grupo_documentos); esta flag marca QUAL material
-- é o estudo da semana (1 por vez · o backend desmarca os demais ao marcar).
-- O cron diário (/api/whatsapp-grupos/cron/diario) envia no dia configurado
-- (default segunda · env WHATSAPP_ESTUDO_DIA).
--
-- Aditiva e idempotente. O relato do encontro (presenças nominais via
-- WhatsApp) NÃO precisa de migration — estado em whatsapp_coletas.parsed.
-- ============================================================================

ALTER TABLE public.mem_grupo_documentos
  ADD COLUMN IF NOT EXISTS estudo_semana boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mem_grupo_documentos.estudo_semana IS
  'Material marcado como estudo da semana · o bot WhatsApp envia pros líderes de grupos (1 marcado por vez)';

-- Conferência:
-- SELECT id, nome, estudo_semana FROM mem_grupo_documentos WHERE estudo_semana;
-- ============================================================================

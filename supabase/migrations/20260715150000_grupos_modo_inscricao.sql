-- ════════════════════════════════════════════════════════════════════════
-- Modo de inscrição por grupo (Marcos · 2026-07-15)
-- Três naturezas de grupo no formulário público:
--   · fechado       → por convite do líder · NUNCA aparece nem aceita
--                     inscrição pública (entrada só por dentro).
--   · temporada     → aparece só enquanto as inscrições da temporada estão
--                     abertas (comportamento atual · DEFAULT no backfill —
--                     a triagem reclassifica os fechados/sempre-abertos).
--   · sempre_aberto → aparece e aceita inscrição o ano todo, mesmo com a
--                     temporada fechada.
-- A pausa operacional (aceitando_inscricoes=false · "lotou, segura") segue
-- separada e vale POR CIMA dos modos não-fechados.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.mem_grupos
  ADD COLUMN IF NOT EXISTS modo_inscricao text NOT NULL DEFAULT 'temporada';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_mem_grupos_modo_inscricao'
  ) THEN
    ALTER TABLE public.mem_grupos
      ADD CONSTRAINT chk_mem_grupos_modo_inscricao
      CHECK (modo_inscricao IN ('fechado', 'temporada', 'sempre_aberto'));
  END IF;
END $$;

COMMENT ON COLUMN public.mem_grupos.modo_inscricao IS
  'Como o grupo recebe inscrições públicas: fechado (por convite do líder · nunca aparece no formulário), temporada (só com as inscrições da temporada abertas · default), sempre_aberto (o ano todo). A pausa operacional (aceitando_inscricoes=false) vale por cima dos modos não-fechados.';

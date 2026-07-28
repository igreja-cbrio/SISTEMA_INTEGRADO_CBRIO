-- ============================================================================
-- MIGRAÇÃO ext_* → ESPINHA · rastreio (SPEC-04 passos 2-3 · F3.2)
-- `inscricoes` já nasceu com legado_ref/legado_fonte; `insc_eventos` ganha os
-- mesmos campos + UNIQUEs parciais que tornam o backfill idempotente por
-- construção (rodar o script 2x não duplica nada).
--
-- Aditiva/idempotente · 1 colagem. Se falhar com "lock timeout": rodar de novo.
-- ============================================================================
SET lock_timeout = '10s';

ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS legado_ref UUID,
  ADD COLUMN IF NOT EXISTS legado_fonte TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_insc_eventos_legado
  ON public.insc_eventos (legado_fonte, legado_ref) WHERE legado_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inscricoes_legado
  ON public.inscricoes (legado_fonte, legado_ref) WHERE legado_ref IS NOT NULL;

COMMENT ON COLUMN public.insc_eventos.legado_ref IS
  'id original na tabela de origem da migração (ex.: ext_eventos.id) — NULL em evento nativo da espinha.';
COMMENT ON COLUMN public.insc_eventos.legado_fonte IS
  'tabela de origem da migração (ex.: ext_eventos) — NULL em evento nativo da espinha.';

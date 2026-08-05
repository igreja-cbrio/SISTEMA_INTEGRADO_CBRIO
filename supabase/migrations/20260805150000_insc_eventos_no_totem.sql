-- ============================================================================
-- Inscrições · evento APARECE NO TOTEM? (2026-08-05 · Fase 1)
--
-- O totem fica no hall, à vista de quem passa — inclusive visitante. Nem todo
-- evento pago deve ser anunciado ali: retiro de liderança, encontro de
-- diáconos, curso fechado de uma área. Sem esta coluna a lista do totem seria
-- "tudo que está publicado", e a decisão de expor um evento a qualquer pessoa
-- que passa no hall viraria efeito colateral de publicar.
--
-- DEFAULT false de propósito: evento novo NÃO aparece no totem até alguém
-- marcar. O inverso (aparecer por padrão) é o tipo de default que só é
-- descoberto quando já apareceu.
--
-- ⚠️ NOT NULL: então entra em `CAMPOS_EVENTO_NAO_NULO` no backend
-- (routes/inscricoes.js). Lição de 2026-08-04: `null` do cliente em coluna
-- NOT NULL derruba o UPDATE INTEIRO do evento, e leva embora todos os outros
-- campos que a pessoa acabou de editar.
-- ============================================================================

ALTER TABLE public.insc_eventos
  ADD COLUMN IF NOT EXISTS no_totem boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.insc_eventos.no_totem IS
  'Evento aparece na lista do totem do lounge (hall, à vista de qualquer pessoa). Default false: publicar não expõe automaticamente no totem.';

-- Índice parcial pequeno: a consulta do totem é sempre "publicados E no_totem".
CREATE INDEX IF NOT EXISTS insc_eventos_no_totem_idx
  ON public.insc_eventos (data) WHERE no_totem AND status = 'publicado';

-- ─── Conferência (SQL Editor) ──────────────────────────────────────────────
-- select column_name, is_nullable, column_default from information_schema.columns
--  where table_name='insc_eventos' and column_name='no_totem';
-- select count(*) filter (where no_totem) as no_totem,
--        count(*) as total from public.insc_eventos;   -- espera no_totem = 0

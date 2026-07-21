-- Protocolo por conversa + pesquisa de satisfação (0-5) no encerramento. Aditiva.
-- Já aplicada via MCP.

-- Protocolo (CBR<AA>-NNNNN, sequencial)
CREATE SEQUENCE IF NOT EXISTS public.wa_protocolo_seq;
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS protocolo text;
ALTER TABLE public.wa_conversas
  ALTER COLUMN protocolo SET DEFAULT ('CBR' || to_char(now(), 'YY') || '-' || lpad(nextval('public.wa_protocolo_seq')::text, 5, '0'));

-- Backfill determinístico por ordem de criação
WITH ord AS (
  SELECT id, created_at, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.wa_conversas WHERE protocolo IS NULL
)
UPDATE public.wa_conversas c
SET protocolo = 'CBR' || to_char(o.created_at, 'YY') || '-' || lpad(o.rn::text, 5, '0')
FROM ord o WHERE c.id = o.id;
SELECT setval('public.wa_protocolo_seq', GREATEST((SELECT count(*) FROM public.wa_conversas), 1));
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conversas_protocolo ON public.wa_conversas (protocolo);

-- Pesquisa de satisfação
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS satisfacao int;         -- 0..5
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS satisfacao_em timestamptz;
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS pesquisa_estado text;    -- null|aguardando|respondida|ignorada
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS pesquisa_em timestamptz;

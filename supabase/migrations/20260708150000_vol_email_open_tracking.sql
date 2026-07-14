-- Rastreamento de ABERTURA dos e-mails do voluntariado (pixel).
-- aberto_em = 1ª abertura registrada; aberturas = nº de aberturas (pixel carregado).
-- ⚠️ Aproximado: clientes que bloqueiam imagem NÃO contam; proxies (Gmail) e o
-- Apple Mail Privacy podem pré-carregar (abertura antecipada/falsa). É indicador.
ALTER TABLE public.vol_email_disparo_destinatarios
  ADD COLUMN IF NOT EXISTS aberto_em timestamptz,
  ADD COLUMN IF NOT EXISTS aberturas int NOT NULL DEFAULT 0;

-- Bucket público p/ mídia do inbox (fotos/documentos enviados e recebidos).
-- Público pra o WhatsApp conseguir buscar o link no envio; paths são
-- imprevisíveis (uuid+timestamp). Backend sobe via service_role. Já aplicada via MCP.
INSERT INTO storage.buckets (id, name, public)
VALUES ('wa-inbox', 'wa-inbox', true)
ON CONFLICT (id) DO UPDATE SET public = true;

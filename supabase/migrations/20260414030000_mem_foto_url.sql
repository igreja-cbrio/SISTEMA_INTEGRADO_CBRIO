-- Adiciona coluna de foto nos membros e cadastros pendentes.
ALTER TABLE mem_membros
  ADD COLUMN IF NOT EXISTS foto_url text;

ALTER TABLE mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS foto_url text;

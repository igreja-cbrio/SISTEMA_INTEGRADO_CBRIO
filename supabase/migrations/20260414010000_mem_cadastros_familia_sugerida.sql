-- Adiciona coluna para guardar a família sugerida pelo formulário público
-- (quando o visitante confirma que pertence a uma família já cadastrada).
-- Idempotente: não falha se a coluna já existir.
ALTER TABLE mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS familia_sugerida_id uuid REFERENCES mem_familias(id);

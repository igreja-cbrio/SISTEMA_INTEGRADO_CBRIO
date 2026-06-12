-- Corpo de e-mail curto (3-5 linhas) que o usuário copia/cola ao enviar o
-- relatório por e-mail. Gerado por Haiku no finalize (best-effort) ou sob
-- demanda via POST /report/:id/email-summary. NULL = ainda não gerado.

ALTER TABLE event_reports
  ADD COLUMN IF NOT EXISTS email_summary TEXT;

COMMENT ON COLUMN event_reports.email_summary IS
  'Corpo curto (3-5 linhas) pra copiar como e-mail. Gerado por Haiku usando o content como base. Pode ser regenerado via POST /report/:id/email-summary.';

-- Módulo Comunicação · C2 — a fila registra TUDO (template E texto).
-- Antes whatsapp_envios só aceitava template; mensagens de texto (janela 24h)
-- saíam por fora, sem registro/retry. Aditiva/idempotente.

ALTER TABLE public.whatsapp_envios
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'template',
  ADD COLUMN IF NOT EXISTS texto text;

COMMENT ON COLUMN public.whatsapp_envios.tipo IS 'template (proativo · aprovado na Meta) | texto (janela 24h)';
COMMENT ON COLUMN public.whatsapp_envios.texto IS 'Corpo quando tipo=texto (template fica null)';

-- template deixa de ser NOT NULL (linhas de texto não têm template)…
ALTER TABLE public.whatsapp_envios ALTER COLUMN template DROP NOT NULL;

-- …mas o conteúdo é garantido por CHECK: template exige template, texto exige texto.
-- (Linhas existentes: tipo default 'template' e todas têm template → passa.)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_envios_conteudo_check'
  ) THEN
    ALTER TABLE public.whatsapp_envios ADD CONSTRAINT whatsapp_envios_conteudo_check
      CHECK (
        (tipo = 'template' AND template IS NOT NULL)
        OR (tipo = 'texto' AND texto IS NOT NULL)
      );
  END IF;
END $$;

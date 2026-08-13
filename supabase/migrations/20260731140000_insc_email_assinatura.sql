-- Assinatura dos e-mails de inscrição + liga/desliga por template · 2026-07-31
--
-- Pedido do Marcos: poder colocar assinatura, e editar o e-mail de forma
-- prática (sem digitar HTML e variáveis na mão).
--
-- A assinatura entra como um TIPO a mais em `insc_email_templates` (global,
-- evento_id NULL) em vez de tabela nova: herda RLS, audit e a mesma tela de
-- edição. Ela não é um e-mail — é um pedaço que o serviço acrescenta ao fim do
-- corpo dos outros três.
--
-- ⚠️ O módulo VOLUNTARIADO tem a própria assinatura (`vol_email_config.
-- assinatura_html`, linha id=1). São duas assinaturas separadas de propósito
-- por agora: unificar numa assinatura institucional única é decisão que
-- atravessa dois módulos (o de voluntariado é do dono dele) e fica pra depois.

-- O CHECK do `tipo` foi criado inline, então o nome é gerado pelo Postgres.
-- Descobrir no CATÁLOGO antes de dropar — nunca chutar o nome (lição do CHECK
-- de vol_inscricoes.status).
DO $$
DECLARE v_nome TEXT;
BEGIN
  SELECT conname INTO v_nome
    FROM pg_constraint
   WHERE conrelid = 'public.insc_email_templates'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%tipo%confirmada%';

  IF v_nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.insc_email_templates DROP CONSTRAINT %I', v_nome);
  END IF;

  ALTER TABLE public.insc_email_templates
    ADD CONSTRAINT insc_email_templates_tipo_check
    CHECK (tipo IN ('confirmada', 'pendente', 'expirada', 'assinatura'));
END $$;

-- Liga/desliga a assinatura por template: o e-mail de "reserva expirada" pode
-- não querer o mesmo rodapé institucional do de confirmação.
ALTER TABLE public.insc_email_templates
  ADD COLUMN IF NOT EXISTS incluir_assinatura BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.insc_email_templates.incluir_assinatura IS
  'Se a assinatura global (tipo=assinatura) é acrescentada ao fim deste e-mail. Ignorado na própria linha da assinatura.';

-- A assinatura é ÚNICA e global: não faz sentido uma por evento. O índice
-- parcial de global já garante uma linha por tipo com evento_id NULL; este
-- CHECK impede criar assinatura amarrada a evento pela API.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.insc_email_templates'::regclass
       AND conname = 'chk_insc_email_assinatura_global'
  ) THEN
    ALTER TABLE public.insc_email_templates
      ADD CONSTRAINT chk_insc_email_assinatura_global
      CHECK (tipo <> 'assinatura' OR evento_id IS NULL);
  END IF;
END $$;

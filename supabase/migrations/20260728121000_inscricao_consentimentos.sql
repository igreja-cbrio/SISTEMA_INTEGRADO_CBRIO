-- Contrato de Inscrição · F3.1 PR 0 (2026-07-28)
-- Atos de consentimento de TODAS as portas de inscrição (decisões D1–D9 do
-- Marcos + ajuste 28/07 · specs em docs/modulo-inscricoes/). Uma linha por ato:
--   termos_lgpd        → obrigatório em toda porta, com snapshot do texto aceito
--   imagem             → batismo / apresentação / eventos com campo de foto
--   menor_responsavel  → apresentação de crianças (LGPD art. 14 §1º)
--   whatsapp           → espelho auditável do opt-in (o ESTADO operacional
--                        continua nas colunas whatsapp_optin/_em de cada tabela)
-- Append-only: INSERT exclusivo do backend (service_role). deleted_at existe
-- apenas para atender pedido de eliminação LGPD via app_soft_delete.

CREATE TABLE IF NOT EXISTS public.inscricao_consentimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  porta TEXT NOT NULL CHECK (porta IN
    ('batismo','apresentacao','grupos','grupos_lider','next','voluntariado','evento_externo','inscricoes')),
  ref_id UUID NOT NULL,
  membro_id UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('termos_lgpd','imagem','menor_responsavel','whatsapp')),
  texto TEXT NOT NULL,
  aceito BOOLEAN NOT NULL,
  em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_origem TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE public.inscricao_consentimentos IS
  'Atos de consentimento das portas de inscrição (Contrato de Inscrição F3.1). Append-only via backend; texto = snapshot exato do que a pessoa aceitou.';

CREATE INDEX IF NOT EXISTS idx_insc_consent_ref
  ON public.inscricao_consentimentos (porta, ref_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insc_consent_membro
  ON public.inscricao_consentimentos (membro_id) WHERE deleted_at IS NULL;

-- Whitelist de soft-delete: acrescenta PRESERVANDO a lista vigente (idempotente,
-- sem precisar re-declarar a lista inteira — evita apagar entradas de outras PRs)
DO $$
DECLARE atual TEXT[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO atual;
  IF NOT ('inscricao_consentimentos' = ANY(atual)) THEN
    -- array_append (não "|| 'literal'"): com literal solto o Postgres resolve
    -- o || como array||array e tenta parsear a string como array → 22P02
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
      array_append(atual, 'inscricao_consentimentos'::text)
    );
  END IF;
END $$;

-- RLS: leitura = o próprio titular ou super-admin; escrita = só backend.
ALTER TABLE public.inscricao_consentimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insc_consent_select ON public.inscricao_consentimentos;
CREATE POLICY insc_consent_select ON public.inscricao_consentimentos
  FOR SELECT TO authenticated
  USING (membro_id = public.current_user_membro_id() OR public.is_super_admin());

DROP POLICY IF EXISTS insc_consent_delete ON public.inscricao_consentimentos;
CREATE POLICY insc_consent_delete ON public.inscricao_consentimentos
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS insc_consent_service ON public.inscricao_consentimentos;
CREATE POLICY insc_consent_service ON public.inscricao_consentimentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- (sem policy de INSERT/UPDATE para authenticated, de propósito — deny by default:
--  formulários públicos gravam via backend/service_role)

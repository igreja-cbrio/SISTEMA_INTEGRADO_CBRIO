-- ============================================================
-- Agente Batismo/Next 90d · fila de convite (jornada do convertido)
-- ============================================================
-- O agente detecta convertido chegando no prazo de 90 dias SEM batismo e/ou SEM
-- Next, atribui ao líder da área, rascunha um convite (WhatsApp) e enfileira pra
-- revisão. O líder revisa e envia em 1 toque — o agente NÃO envia sozinho.
--
-- PII (referencia pessoa + mensagem). Padrão: deleted_at + RLS contextual +
-- service_role. ⚠️ Não aplicada aqui (revisão). Antes do deploy: registrar na
-- whitelist app_soft_deletable_tables() lendo a lista VIVA.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cui_batismo_next_fila (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convertido_id uuid NOT NULL REFERENCES public.cui_convertidos(id) ON DELETE CASCADE,
  area text,
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  responsavel_nome text,
  falta_batismo boolean NOT NULL DEFAULT false,
  falta_next boolean NOT NULL DEFAULT false,
  dias int,                       -- dias desde a conversão (proximidade do prazo)
  mensagem_rascunho text,
  telefone text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviado','contato_feito','ignorado','expirado')),
  prazo date,
  enviado_em timestamptz,
  enviado_por uuid REFERENCES auth.users(id),
  feedback text,
  agente_versao text DEFAULT 'batismo-next-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT cui_bnf_um_por_convertido UNIQUE (convertido_id)
);

CREATE INDEX IF NOT EXISTS idx_cui_bnf_pendente
  ON public.cui_batismo_next_fila (status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cui_bnf_area
  ON public.cui_batismo_next_fila (area, status) WHERE deleted_at IS NULL;

ALTER TABLE public.cui_batismo_next_fila ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cui_bnf_select ON public.cui_batismo_next_fila;
CREATE POLICY cui_bnf_select ON public.cui_batismo_next_fila
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('cuidados') >= 1
    OR (area IS NOT NULL AND public.current_user_module_level(area) >= 1)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS cui_bnf_update ON public.cui_batismo_next_fila;
CREATE POLICY cui_bnf_update ON public.cui_batismo_next_fila
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('cuidados') >= 2
    OR (area IS NOT NULL AND public.current_user_module_level(area) >= 2)
    OR public.is_super_admin()
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS cui_bnf_delete ON public.cui_batismo_next_fila;
CREATE POLICY cui_bnf_delete ON public.cui_batismo_next_fila
  FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS cui_bnf_service ON public.cui_batismo_next_fila;
CREATE POLICY cui_bnf_service ON public.cui_batismo_next_fila
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cui_batismo_next_fila IS
  'Fila do Agente Batismo/Next 90d: convertido perto do prazo sem batismo/Next, com responsável + convite rascunhado p/ envio em 1 toque. Modo seguro (humano envia).';

-- ⚠️ NOTA (antes do deploy): registrar cui_batismo_next_fila na whitelist
-- public.app_soft_deletable_tables() (lendo a lista VIVA, sem regerar de cabeça).

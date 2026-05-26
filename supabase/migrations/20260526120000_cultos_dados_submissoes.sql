-- Coleta mobile de dados de culto (frequencia + decisoes)
-- Fluxo:
--   1. Responsavel pela Integracao termina o culto, abre /integracao/coleta no celular
--   2. Escolhe o culto recente, escolhe ambiente (Templo OU Kids)
--   3. Conta as pessoas (com contador opcional), preenche e envia
--   4. Submissao fica em status='pendente' ate o coord aprovar
--   5. Aprovacao -> UPDATE cultos.presencial_adulto/decisoes_presenciais OU presencial_kids/decisoes_kids
--
-- Pessoas diferentes podem enviar (templo + kids) simultaneamente pq cada ambiente eh uma submissao independente.
-- O partial unique index impede 2 submissoes ativas pro mesmo (culto, ambiente).

CREATE TABLE IF NOT EXISTS public.cultos_dados_submissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id uuid NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  ambiente text NOT NULL CHECK (ambiente IN ('templo','kids')),
  presencial integer NOT NULL CHECK (presencial >= 0),
  decisoes integer NOT NULL DEFAULT 0 CHECK (decisoes >= 0),
  observacao text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial unique · so pode existir UMA submissao ativa (pendente ou aprovada) por (culto, ambiente)
-- Se rejeitar, libera novo envio
CREATE UNIQUE INDEX IF NOT EXISTS cultos_dados_submissoes_ativo_idx
  ON public.cultos_dados_submissoes (culto_id, ambiente)
  WHERE status IN ('pendente','aprovado');

CREATE INDEX IF NOT EXISTS cultos_dados_submissoes_status_idx
  ON public.cultos_dados_submissoes (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS cultos_dados_submissoes_culto_idx
  ON public.cultos_dados_submissoes (culto_id);

-- RLS · service_role bypassa, backend valida permissoes via authorizeModule
ALTER TABLE public.cultos_dados_submissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cultos_dados_submissoes_service ON public.cultos_dados_submissoes;
CREATE POLICY cultos_dados_submissoes_service ON public.cultos_dados_submissoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cultos_dados_submissoes_select ON public.cultos_dados_submissoes;
CREATE POLICY cultos_dados_submissoes_select ON public.cultos_dados_submissoes
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR public.current_user_module_level('integracao') >= 1
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS cultos_dados_submissoes_insert ON public.cultos_dados_submissoes;
CREATE POLICY cultos_dados_submissoes_insert ON public.cultos_dados_submissoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('integracao') >= 2
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS cultos_dados_submissoes_update ON public.cultos_dados_submissoes;
CREATE POLICY cultos_dados_submissoes_update ON public.cultos_dados_submissoes
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('integracao') >= 3
    OR public.is_super_admin()
  );

COMMIT;

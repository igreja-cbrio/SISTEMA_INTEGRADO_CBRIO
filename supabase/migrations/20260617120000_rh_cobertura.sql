-- ============================================================================
-- RH · Cobertura de férias/licença (Marcos · 2026-06-17)
--
-- Quando alguém entra de férias/licença, o RH escolhe um SUBSTITUTO que herda
-- TEMPORARIAMENTE os acessos OPERACIONAIS (áreas/filas · NÃO os sensíveis tipo
-- Financeiro/RH · decisão do Marcos) e reverte sozinho no retorno.
--
-- Mecanismo (sem tocar no hot-path do auth.js): o backend, ao aprovar a licença,
-- resolve os módulos operacionais do titular e concede ao substituto overrides
-- em `permissoes_modulo` com `expira_em = fim+1d` (o authenticate já IGNORA
-- override expirado → revert automático). Esta tabela rastreia/audita a cobertura
-- e guarda o snapshot do que foi concedido (pra cancelar/limpar no early-return).
--
-- ADITIVA · idempotente.
-- ============================================================================

-- Substituto escolhido no registro da licença (o RH preenche no form)
ALTER TABLE public.rh_ferias_licencas
  ADD COLUMN IF NOT EXISTS substituto_id uuid REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.rh_cobertura (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ferias_id                 uuid REFERENCES public.rh_ferias_licencas(id) ON DELETE SET NULL,
  -- titular (quem saiu) e substituto (quem cobre) · e-mail é a ponte pro usuário/permissão
  titular_funcionario_id    uuid REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL,
  titular_email             text,
  titular_nome              text,
  substituto_funcionario_id uuid REFERENCES public.rh_funcionarios(id) ON DELETE SET NULL,
  substituto_email          text NOT NULL,
  substituto_nome           text,
  data_inicio               date NOT NULL,
  data_fim                  date NOT NULL,
  -- snapshot do que foi concedido (só operacional): { "<slug>": {"l":3,"e":3} }
  modulos_concedidos        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                    text NOT NULL DEFAULT 'ativa'
                              CHECK (status IN ('ativa', 'cancelada', 'encerrada')),
  criado_por                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao                text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rh_cobertura_substituto_idx
  ON public.rh_cobertura (lower(substituto_email), status, data_fim);
CREATE INDEX IF NOT EXISTS rh_cobertura_ferias_idx
  ON public.rh_cobertura (ferias_id);

ALTER TABLE public.rh_cobertura ENABLE ROW LEVEL SECURITY;

-- Backend usa service_role (gating real é o authorizeModule('rh', N)).
DROP POLICY IF EXISTS rh_cobertura_service ON public.rh_cobertura;
CREATE POLICY rh_cobertura_service ON public.rh_cobertura
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Leitura: quem tem RH ≥ 1 vê tudo · o próprio substituto vê a sua (banner).
DROP POLICY IF EXISTS rh_cobertura_select ON public.rh_cobertura;
CREATE POLICY rh_cobertura_select ON public.rh_cobertura
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('rh') >= 1
    OR lower(substituto_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

COMMENT ON TABLE public.rh_cobertura IS
  'RH · cobertura de férias/licença · substituto herda módulos OPERACIONAIS do titular como overrides permissoes_modulo com expira_em (revert automático). modulos_concedidos = snapshot pra cancelar.';

-- ============================================================================
-- Conferência:
--   SELECT substituto_nome, titular_nome, data_inicio, data_fim, status,
--          jsonb_object_keys(modulos_concedidos) FROM rh_cobertura;
-- ============================================================================

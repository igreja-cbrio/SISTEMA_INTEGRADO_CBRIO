-- ============================================================================
-- Kids · senha de edição da ficha da criança no totem (2026-07-07)
--
-- Pedido do Matheus: editar QUALQUER dado da criança (pop-up de detalhes) no
-- totem exige uma SENHA criada por um líder do Kids (Mari Gaia / Milena Rochet).
-- Tabela singleton guarda o HASH (bcrypt) da senha. Escrita/verificação passam
-- pelo backend (guards por módulo kids); RLS só libera leitura de status.
-- Sem PII (só hash) → sem deleted_at.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kids_totem_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),   -- singleton (sempre true)
  edit_senha_hash text,
  edit_senha_por uuid,
  edit_senha_em timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.kids_totem_config (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.kids_totem_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_totem_config_read ON public.kids_totem_config;
CREATE POLICY kids_totem_config_read ON public.kids_totem_config FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_totem_config_service ON public.kids_totem_config;
CREATE POLICY kids_totem_config_service ON public.kids_totem_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- MIGRATION · Solicitacoes · Co-aprovadores de origem por setor
-- ============================================================================
-- Pedido (gestao · 2026-06-22): a vice-diretora (Juliana Leao) deve poder
-- aprovar as solicitacoes de origem do setor Gestao JUNTO com o Eduardo Gnisci
-- — qualquer um dos dois aprova (nao precisa dos dois). Generaliza pra
-- "co-aprovadores por setor" (configuravel pra outros setores no futuro).
--
-- Modelo: setor_diretor define 1 diretor por setor (aprovador principal).
-- setor_coaprovadores adiciona N co-aprovadores por setor. O backend trata
-- diretor + co-aprovadores como o conjunto de quem pode aprovar/rejeitar a
-- aprovacao de origem das solicitacoes daquele setor.
--
-- Aditiva · nao altera o fluxo existente (sem co-aprovador = comportamento
-- atual, so o diretor aprova).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.setor_coaprovadores (
  setor       text NOT NULL REFERENCES public.setor_diretor(setor) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (setor, profile_id)
);

COMMENT ON TABLE public.setor_coaprovadores IS
  'Co-aprovadores adicionais por setor para a aprovacao de origem de solicitacoes (alem do diretor em setor_diretor). Qualquer diretor OU co-aprovador do setor pode aprovar/rejeitar. Seed 2026-06-22: Juliana Leao co-aprova Gestao.';

-- RLS · catalogo de config (sem PII alem de profile_id + nome snapshot · mesmo
-- padrao de setor_diretor): leitura autenticada, escrita so super-admin,
-- service_role livre (backend).
ALTER TABLE public.setor_coaprovadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS setor_coaprovadores_read ON public.setor_coaprovadores;
CREATE POLICY setor_coaprovadores_read ON public.setor_coaprovadores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS setor_coaprovadores_write ON public.setor_coaprovadores;
CREATE POLICY setor_coaprovadores_write ON public.setor_coaprovadores
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS setor_coaprovadores_service ON public.setor_coaprovadores;
CREATE POLICY setor_coaprovadores_service ON public.setor_coaprovadores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed · Juliana Leao co-aprovadora do setor Gestao (resolvido por e-mail pra
-- nao hardcodar UUID; no-op se o perfil nao existir).
INSERT INTO public.setor_coaprovadores (setor, profile_id, nome)
SELECT 'Gestao', p.id, p.name
  FROM public.profiles p
 WHERE lower(p.email) = 'juliana.leao@cbrio.org'
ON CONFLICT (setor, profile_id) DO NOTHING;

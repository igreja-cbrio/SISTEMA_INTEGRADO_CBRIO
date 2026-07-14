-- ============================================================================
-- Solicitações · 2º portão de aprovação (Gestão) configurável POR CATEGORIA
-- ============================================================================
-- Pedido do Matheus (2026-07-08): solicitações de TI, depois da aprovação do
-- diretor da área do demandante (origem), NÃO devem ir pra Diretoria de Gestão
-- (Eduardo/Juliana/Pedro Paulo) — devem ir pro DIEGO (TI) e pro MATHEUS. E o
-- Diego só recebe solicitações de TI.
--
-- Mecanismo: tabela de override do 2º carimbo por categoria. Quando existe ao
-- menos 1 linha pra a categoria, esses aprovadores SUBSTITUEM a Diretoria de
-- Gestão padrão (que segue valendo pras categorias sem override). O backend
-- (backend/routes/solicitacoes.js) resolve os aprovadores do portão de Gestão
-- consultando esta tabela primeiro e caindo no setor 'Gestao' quando vazia.
--
-- Retroativo: as solicitações de TI que hoje estão com aprovacao_gestao_status
-- = 'pendente' passam a rotear pro Diego/Matheus automaticamente (o portão
-- resolve os aprovadores em tempo de leitura · não guarda ids na linha).
--
-- Catálogo (sem PII sensível · só profile_id + nome snapshot, igual a
-- setor_coaprovadores): RLS read=autenticado, write=super-admin, service_role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.solicitacoes_categoria_aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (categoria, profile_id)
);

COMMENT ON TABLE public.solicitacoes_categoria_aprovadores IS
  'Override do 2º portão (Gestão) por categoria de solicitação. Ex.: TI → Diego + Matheus. '
  'Quando há linhas pra a categoria, elas substituem a Diretoria de Gestão padrão.';

CREATE INDEX IF NOT EXISTS idx_solic_cat_aprov_categoria
  ON public.solicitacoes_categoria_aprovadores (categoria);

ALTER TABLE public.solicitacoes_categoria_aprovadores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solicitacoes_categoria_aprovadores' AND policyname='scat_aprov_select') THEN
    CREATE POLICY scat_aprov_select ON public.solicitacoes_categoria_aprovadores
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solicitacoes_categoria_aprovadores' AND policyname='scat_aprov_write') THEN
    CREATE POLICY scat_aprov_write ON public.solicitacoes_categoria_aprovadores
      FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='solicitacoes_categoria_aprovadores' AND policyname='scat_aprov_service') THEN
    CREATE POLICY scat_aprov_service ON public.solicitacoes_categoria_aprovadores
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed · TI → Diego Assis + Matheus Toscano (resolve por e-mail · idempotente)
INSERT INTO public.solicitacoes_categoria_aprovadores (categoria, profile_id, nome)
SELECT 'ti', p.id, p.name
FROM public.profiles p
WHERE lower(p.email) IN ('diego.assis@cbrio.org', 'matheus.toscano@cbrio.org')
ON CONFLICT (categoria, profile_id) DO NOTHING;

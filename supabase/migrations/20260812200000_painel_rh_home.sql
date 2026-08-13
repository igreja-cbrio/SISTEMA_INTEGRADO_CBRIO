-- Painel informativo de RH na home (Dashboard) · pedido do usuário 2026-08-12.
-- 3 blocos: aniversariantes de colaboradores, próximos eventos (RH decide
-- quais aparecem) e comunicados de RH (mural próprio, isolado do mural do
-- Marketing). Tudo aditivo — nenhuma tabela existente perde coluna/dado.

-- 1) Aniversário de colaborador. NULL = ainda não preenchido (não aparece
-- em "aniversariantes do mês", sem quebrar nada existente em rh_funcionarios).
ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS data_nascimento date;

COMMENT ON COLUMN public.rh_funcionarios.data_nascimento IS
  'Data de nascimento do colaborador — alimenta o painel de aniversariantes do mês na home. NULL = não preenchido ainda.';

-- 2) Visibilidade no painel de RH da home. NULLABLE de propósito:
-- NULL = segue a regra automática por categoria (Rotina de Liturgia, Série,
-- Geracional, Rotina Staff, Feriado entram sozinhos) · true = RH força
-- aparecer (ex.: um "Evento Especial" que a área decidiu destacar) · false =
-- RH força esconder (mesmo sendo de uma categoria automática). events não
-- tem CREATE TABLE versionado neste repo (drift documentado no CLAUDE.md) —
-- por isso ALTER TABLE IF EXISTS, tolerante à tabela já existir fora de migration.
ALTER TABLE IF EXISTS public.events
  ADD COLUMN IF NOT EXISTS visivel_painel_rh boolean;

COMMENT ON COLUMN public.events.visivel_painel_rh IS
  'Visibilidade no painel de RH da home. NULL = automático por categoria (liturgia/série/geracional/staff/feriado) · true = RH força mostrar · false = RH força esconder.';

-- 3) Comunicados de RH — mural próprio, isolado do mural do Marketing
-- (tabela comunicados). Mesmo padrão de nomenclatura/estrutura, módulo rh.
CREATE TABLE IF NOT EXISTS public.rh_comunicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  corpo text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado', 'arquivado')),
  publicado_em timestamptz,
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rh_comunicados_pub
  ON public.rh_comunicados (status, publicado_em DESC) WHERE deleted_at IS NULL;

-- NOTA: rh_comunicados fica FORA de app_soft_deletable_tables() de propósito,
-- espelhando a tabela comunicados (Marketing) que já segue esse padrão: sem
-- PII (título/corpo são texto editorial, não dado de pessoa), soft-delete
-- aplicado por UPDATE direto no backend (service_role), não pela RPC
-- app_soft_delete — mesma régua da tabela irmã.

ALTER TABLE public.rh_comunicados ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado vê os publicados (painel geral da home);
-- RH nível >=1 vê tudo, inclusive rascunho/arquivado (pra gerenciar).
DROP POLICY IF EXISTS rh_comunicados_select ON public.rh_comunicados;
CREATE POLICY rh_comunicados_select ON public.rh_comunicados
  FOR SELECT TO authenticated
  USING (
    (status = 'publicado' AND deleted_at IS NULL)
    OR public.current_user_module_level('rh') >= 1
  );

DROP POLICY IF EXISTS rh_comunicados_write ON public.rh_comunicados;
CREATE POLICY rh_comunicados_write ON public.rh_comunicados
  FOR ALL TO authenticated
  USING (public.current_user_module_level('rh') >= 3)
  WITH CHECK (public.current_user_module_level('rh') >= 3);

DROP POLICY IF EXISTS rh_comunicados_service ON public.rh_comunicados;
CREATE POLICY rh_comunicados_service ON public.rh_comunicados
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.rh_comunicados IS
  'Comunicados/avisos criados pelo RH, exibidos no painel informativo da home (Dashboard). Isolado do mural do Marketing (tabela comunicados).';

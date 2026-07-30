-- Módulo Propostas · Fase 1A — catálogo do módulo + tabelas de CONFIGURAÇÃO.
-- Ciclo anual de propostas de Projetos/Eventos/Rotinas (spec Yago 2026-07-30).
-- Só config aqui; a proposta em si vem na migration _propostas_core.
-- Idempotente.

-- ── 1. Catálogo do módulo + seed da matriz de permissões ───────────────────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'propostas', 'Propostas', '/propostas', 'operacional', 999,
       'Ciclo anual de propostas de projetos, eventos e rotinas', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'propostas');

-- Copia as permissões de um módulo operacional existente (solicitacoes) como base.
DO $$
DECLARE base_id int;
BEGIN
  SELECT id INTO base_id FROM public.modulos WHERE slug = 'solicitacoes';
  IF base_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
      CROSS JOIN public.modulos novo
     WHERE cmp.modulo_id = base_id AND novo.slug = 'propostas'
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

-- ── 2. prop_ciclo · uma janela anual de submissão/avaliação/deliberação ────
CREATE TABLE IF NOT EXISTS public.prop_ciclo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL UNIQUE,
  data_abertura_submissao DATE,
  data_corte_submissao DATE,
  prazo_avaliacao DATE,
  orcamento_disponivel NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'configuracao'
    CHECK (estado IN ('configuracao','submissao_aberta','em_avaliacao','em_deliberacao','encerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. prop_area_diretor · qual área participa e quem é o diretor dela ──────
-- Reusa o catálogo `areas`; não duplica lista de áreas. Diretor por área fina
-- (o setor_diretor existente é grosso demais — só 3 setores).
CREATE TABLE IF NOT EXISTS public.prop_area_diretor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id INTEGER NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  diretor_usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ativa BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (area_id)
);

-- ── 4. prop_parametro · chave/valor por ciclo (RN03/RN11/RN16/RN19/RN20) ────
CREATE TABLE IF NOT EXISTS public.prop_parametro (
  ciclo_id UUID NOT NULL REFERENCES public.prop_ciclo(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  valor TEXT,
  PRIMARY KEY (ciclo_id, chave)
);
-- Chaves esperadas (semeadas pelo backend ao criar o ciclo):
--   faixa_custo_baixo_ate, faixa_custo_medio_ate  (RN19 · a definir pela CBRio)
--   min_avaliadores (default 3), prazo_recurso_dias (default 10)
--   desembolso_bloqueia_envio (default 'false')

-- ── 5. prop_criterio · critérios de avaliação por ciclo (N critérios) ───────
CREATE TABLE IF NOT EXISTS public.prop_criterio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES public.prop_ciclo(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  peso NUMERIC(6,2) NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prop_criterio_ciclo ON public.prop_criterio (ciclo_id) WHERE ativo;

-- ── RLS · config: leitura pra quem tem o módulo (>=1); escrita = admin do
--    módulo (nível 5) ou super-admin. service_role bypassa (backend). ────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['prop_ciclo','prop_area_diretor','prop_parametro','prop_criterio'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS %1$s_sel ON public.%1$s;
      CREATE POLICY %1$s_sel ON public.%1$s FOR SELECT TO authenticated
        USING (public.current_user_module_level('propostas') >= 1);
      DROP POLICY IF EXISTS %1$s_wr ON public.%1$s;
      CREATE POLICY %1$s_wr ON public.%1$s FOR ALL TO authenticated
        USING (public.current_user_module_level('propostas') >= 5 OR public.is_super_admin())
        WITH CHECK (public.current_user_module_level('propostas') >= 5 OR public.is_super_admin());
      DROP POLICY IF EXISTS %1$s_svc ON public.%1$s;
      CREATE POLICY %1$s_svc ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true);
    $p$, t);
  END LOOP;
END $$;

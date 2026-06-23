-- Cuidados · "Próximos passos" enxuto + "Visitas/atendimentos" como lista (Marcos · 2026-06-22)
-- ============================================================================
-- CONTEXTO (conversa do Marcos com o Marcelo da jornada)
-- O fluxo de "selecionar no Próximos passos → agendar visita → calendário" não vai
-- funcionar: quem atende (líderes de área) NÃO acessa o módulo Cuidados, então o
-- calendário de visitas vira tela morta. O que o Marcelo precisa é um registro leve,
-- inline, por convertido: QUEM ficou responsável + PRA ONDE foi direcionado.
--
-- ESTA MIGRATION (aditiva · idempotente · não destrói dado):
--   1) cui_convertidos += responsavel_atendimento (nome · lista fixa na UI) +
--      direcionamento (grupos/devocionais/voluntarios) + direcionamento_em.
--   2) Cria cui_visitas: lista de visitas pastorais e atendimentos avulsos (fora
--      do funil de convertidos). Substitui o calendário da aba "Visitas agendadas".
--
-- ENGAJAMENTO (decisão do Marcos): o "direcionamento" CRIA o encaminhamento (handoff)
-- pra caixa da área, mas NÃO conta engajamento. O engajamento só vem do sinal REAL
-- (entrou no grupo, virou voluntário, leu a 1ª devocional) — que o NSM v3 já mede via
-- fn_nsm_sinais_engajados (mem_grupo_membros / mem_voluntarios / mem_devocionais).
-- Criar jornada_encaminhamentos NÃO toca NSM (não há trigger; o NSM lê o sinal real).
-- Por isso esta migration NÃO mexe em nenhuma função de NSM/encaminhamento.
-- ============================================================================

-- 1) Colunas novas em cui_convertidos
ALTER TABLE public.cui_convertidos
  ADD COLUMN IF NOT EXISTS responsavel_atendimento text,
  ADD COLUMN IF NOT EXISTS direcionamento          text,
  ADD COLUMN IF NOT EXISTS direcionamento_em        timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cui_convertidos_direcionamento_check'
  ) THEN
    ALTER TABLE public.cui_convertidos
      ADD CONSTRAINT cui_convertidos_direcionamento_check
      CHECK (direcionamento IS NULL OR direcionamento IN ('grupos', 'devocionais', 'voluntarios'));
  END IF;
END $$;

COMMENT ON COLUMN public.cui_convertidos.responsavel_atendimento IS
  'Nome de quem ficou responsável pelo atendimento do convertido (lista fixa na UI · ex.: Arthur Cecconi). Texto livre porque essas pessoas não logam no Cuidados.';
COMMENT ON COLUMN public.cui_convertidos.direcionamento IS
  'Pra onde o responsável direcionou a pessoa: grupos | devocionais | voluntarios. Grupos/Voluntários geram handoff (encaminhamento). NÃO conta engajamento (sinal real = entrar no grupo / virar voluntário / ler 1ª devocional).';

-- 2) cui_visitas · visitas pastorais e atendimentos avulsos (fora dos convertidos)
-- PII (nome/telefone) · soft-delete via backend UPDATE deleted_at (mesmo padrão das
-- cui_j180_* · não entra na whitelist app_soft_deletable_tables · delete passa pelo backend).
CREATE TABLE IF NOT EXISTS public.cui_visitas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  membro_id   uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  telefone    text,
  data_visita date NOT NULL DEFAULT CURRENT_DATE,
  tipo        text NOT NULL DEFAULT 'visita',
  responsavel text,                       -- quem visitou / atendeu (texto livre · pastor/líder)
  status      text NOT NULL DEFAULT 'realizada',
  observacao  text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT cui_visitas_tipo_check   CHECK (tipo   IN ('visita', 'atendimento', 'hospital', 'luto', 'oracao', 'outro')),
  CONSTRAINT cui_visitas_status_check CHECK (status IN ('agendada', 'realizada', 'cancelada'))
);

CREATE INDEX IF NOT EXISTS idx_cui_visitas_data
  ON public.cui_visitas (data_visita DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.cui_visitas IS
  'Visitas pastorais e atendimentos avulsos (fora do funil de novos convertidos). Lista da aba "Visitas e atendimentos" do Cuidados · substituiu o calendário.';

-- RLS · scoped ao módulo Cuidados (read≥1 · write≥3 · delete super-admin · service_role bypassa)
ALTER TABLE public.cui_visitas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cui_visitas' AND policyname='cui_visitas_select') THEN
    EXECUTE 'CREATE POLICY cui_visitas_select ON public.cui_visitas FOR SELECT TO authenticated USING (public.current_user_module_level(''cuidados'') >= 1)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cui_visitas' AND policyname='cui_visitas_insert') THEN
    EXECUTE 'CREATE POLICY cui_visitas_insert ON public.cui_visitas FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level(''cuidados'') >= 3)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cui_visitas' AND policyname='cui_visitas_update') THEN
    EXECUTE 'CREATE POLICY cui_visitas_update ON public.cui_visitas FOR UPDATE TO authenticated USING (public.current_user_module_level(''cuidados'') >= 3) WITH CHECK (public.current_user_module_level(''cuidados'') >= 3)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cui_visitas' AND policyname='cui_visitas_delete') THEN
    EXECUTE 'CREATE POLICY cui_visitas_delete ON public.cui_visitas FOR DELETE TO authenticated USING (public.is_super_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cui_visitas' AND policyname='cui_visitas_service') THEN
    EXECUTE 'CREATE POLICY cui_visitas_service ON public.cui_visitas FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

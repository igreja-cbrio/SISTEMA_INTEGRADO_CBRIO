-- Aba "Acompanhamento" do Planejamento Estratégico (Marcos · 2026-06-09).
--
-- NÃO altera o módulo existente: marcos/tarefas/Gantt/Timeline continuam idênticos.
-- Adiciona só a camada CÍCLICA de PLANOS — o plano vigente "Expansão 2026–2029"
-- (Pr. Pedrão) e os planos já executados, com PARECER documental no encerramento.
-- Realiza a ideia do Marcos: acompanhar planos em execução + avaliar/registrar o
-- que houve nos planos passados (visão das entregas + parecer da área estratégica).
--
-- Reusa o módulo 'expansao' (mesma rota/slug/matriz de permissões). Tabela aditiva,
-- com RLS contextual no padrão do runbook de segurança. Não é PII; o "delete" é
-- soft via UPDATE deleted_at no backend (service_role) — por isso não entra na
-- whitelist app_soft_deletable_tables() (evita reescrever a lista grande às cegas).

CREATE TABLE IF NOT EXISTS public.pe_planos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  descricao      text,
  periodo_inicio date,
  periodo_fim    date,
  lider_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lider_nome     text,
  status         text NOT NULL DEFAULT 'em_execucao'
                   CHECK (status IN ('em_execucao','encerrado')),
  parecer        text,        -- parecer documental (retrospectiva) · preenchido no/após encerramento
  avaliacao      text CHECK (avaliacao IN ('atingido','parcial','nao_atingido')),
  score_pct      numeric,     -- % de atingimento (opcional)
  snapshot       jsonb,       -- congela os números das entregas no momento do encerramento
  encerrado_em   timestamptz,
  encerrado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pe_planos_active
  ON public.pe_planos (status, periodo_inicio) WHERE deleted_at IS NULL;

-- Seed do plano vigente (idempotente por nome + início)
INSERT INTO public.pe_planos (nome, descricao, periodo_inicio, periodo_fim, lider_nome, status)
SELECT 'Expansão', 'Quadriênio estratégico 2026–2029 do Pr. Pedrão.',
       DATE '2026-01-01', DATE '2029-12-31', 'Pr. Pedrão', 'em_execucao'
WHERE NOT EXISTS (
  SELECT 1 FROM public.pe_planos WHERE nome = 'Expansão' AND periodo_inicio = DATE '2026-01-01'
);

-- RLS contextual pelo módulo 'expansao'
ALTER TABLE public.pe_planos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pe_planos_select ON public.pe_planos;
CREATE POLICY pe_planos_select ON public.pe_planos
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('expansao') >= 1);

DROP POLICY IF EXISTS pe_planos_insert ON public.pe_planos;
CREATE POLICY pe_planos_insert ON public.pe_planos
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('expansao') >= 3);

DROP POLICY IF EXISTS pe_planos_update ON public.pe_planos;
CREATE POLICY pe_planos_update ON public.pe_planos
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('expansao') >= 3)
  WITH CHECK (public.current_user_module_level('expansao') >= 3);

DROP POLICY IF EXISTS pe_planos_delete ON public.pe_planos;
CREATE POLICY pe_planos_delete ON public.pe_planos
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS pe_planos_service ON public.pe_planos;
CREATE POLICY pe_planos_service ON public.pe_planos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.pe_planos IS 'Planos estratégicos plurianuais (camada cíclica do módulo Planejamento Estratégico · aba Acompanhamento). Plano vigente: Expansão 2026–2029.';

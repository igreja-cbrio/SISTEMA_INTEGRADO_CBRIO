-- Planejamento Anual · orçamento vira responsabilidade PRÓPRIA (2026-09-18)
--
-- Pedido do Diego: tirar o Pr. Pedro Junior (Pedro Luis Barreto Litwinczuk
-- Júnior · juninho.lit@cbrio.org) da AVALIAÇÃO DE NOTAS do ciclo, mantendo
-- só o julgamento/composição do ORÇAMENTO. Decisão confirmada com ele:
--   · a diretoria Financeiro SAI do quórum de notas (fica em 3 diretorias:
--     ministerial/operações/criativo) — sem substituto por ora;
--   · o acesso ao orçamento do ciclo deixa de depender do assento de
--     avaliador (`plan_ciclo_avaliadores`, diretoria='financeiro') e passa
--     a ser controlado por esta tabela nova.
--
-- Até aqui o MESMO assento controlava as duas coisas (ver
-- `assentoFinanceiro()` em backend/routes/planejamentoAnual.js) — por isso
-- não dava pra tirar uma sem tirar a outra. Esta migration separa.
--
-- Aditiva · idempotente.

CREATE TABLE IF NOT EXISTS public.plan_orcamento_responsaveis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id    uuid NOT NULL REFERENCES public.plan_ciclos(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, profile_id)
);

COMMENT ON TABLE public.plan_orcamento_responsaveis IS
  'Quem pode ver/compor/enviar o orçamento do ciclo — independente de ser avaliador de notas (plan_ciclo_avaliadores). Não é dado sensível por si só (não expõe valor nenhum), mas segue deny-by-default como as demais tabelas do módulo: quem decide visibilidade é o backend.';

ALTER TABLE public.plan_orcamento_responsaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_orcamento_responsaveis_select ON public.plan_orcamento_responsaveis;
CREATE POLICY plan_orcamento_responsaveis_select ON public.plan_orcamento_responsaveis
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS plan_orcamento_responsaveis_service ON public.plan_orcamento_responsaveis;
CREATE POLICY plan_orcamento_responsaveis_service ON public.plan_orcamento_responsaveis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Aplica a decisão no ciclo 2027 ───────────────────────────────────────
DO $$
DECLARE
  v_ciclo uuid;
  v_pedro_junior uuid;
BEGIN
  SELECT id INTO v_ciclo FROM public.plan_ciclos WHERE ano = 2027;
  IF v_ciclo IS NULL THEN RETURN; END IF;

  SELECT id INTO v_pedro_junior FROM public.profiles WHERE lower(email) = 'juninho.lit@cbrio.org' LIMIT 1;
  IF v_pedro_junior IS NULL THEN RETURN; END IF;

  -- Continua com acesso ao orçamento (ver/compor/enviar)
  INSERT INTO public.plan_orcamento_responsaveis (ciclo_id, profile_id)
  VALUES (v_ciclo, v_pedro_junior)
  ON CONFLICT (ciclo_id, profile_id) DO NOTHING;

  -- Sai do assento de avaliador de notas da diretoria Financeiro (quórum
  -- do ciclo passa de 4 para 3 diretorias). As notas que ele já tinha
  -- enviado NÃO são apagadas — ficam como registro histórico.
  DELETE FROM public.plan_ciclo_avaliadores
  WHERE ciclo_id = v_ciclo AND diretoria = 'financeiro' AND profile_id = v_pedro_junior;
END $$;

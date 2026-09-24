-- =====================================================================
-- Planejamento Anual · configuração de geração automática de solicitações
-- para propostas de ROTINA (Compras / Reserva de Espaço) · 2026-09-23
-- =====================================================================
-- Pedido do Diego: ao marcar uma proposta como `rotina`, o proponente pode
-- escolher uma categoria (Compras · Reserva de Espaço · Outros). Se Compras
-- ou Reserva de Espaço, ele preenche só os campos que faltam (a proposta já
-- pede recorrência/dia da semana/horário) e, depois que a proposta for
-- APROVADA, o sistema gera sozinho as solicitações correspondentes:
--   · Compras: uma solicitação a cada vez que a recorrência vencer (cron).
--   · Reserva de Espaço: uma única solicitação, no momento da aprovação,
--     com a recorrência escrita no texto (é uma reserva permanente).
--
-- ⚠️ Estes dados NUNCA podem vazar para as telas de avaliação (diretores) ou
-- decisão (Pastor) — por isso vivem em tabela PRÓPRIA, nunca em coluna de
-- `plan_propostas`. As rotas de avaliação/decisão (`GET /ciclos/:id/propostas`,
-- `GET /propostas/:id`, `GET /ciclos/:id/ranking`) fazem `select('*')` em
-- `plan_propostas` e repassam a linha crua adiante (`projetarProposta`/
-- `montarRanking`) — qualquer coluna nova ali vazaria para o payload dessas
-- telas. Isolar em tabela própria, nunca consultada por essas rotas, é o que
-- garante o isolamento por construção.
--
-- Migration ADITIVA · idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.plan_propostas_rotina_solicitacao (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id        uuid NOT NULL UNIQUE REFERENCES public.plan_propostas(id) ON DELETE CASCADE,
  categoria          text NOT NULL CHECK (categoria IN ('compras', 'reserva_espaco', 'outros')),
  dados              jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo              boolean NOT NULL DEFAULT true,
  ultima_geracao_em  timestamptz,
  proxima_geracao_em date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_prop_rotina_ativo
  ON public.plan_propostas_rotina_solicitacao (categoria) WHERE ativo;

CREATE OR REPLACE FUNCTION public.fn_plan_prop_rotina_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plan_prop_rotina_updated ON public.plan_propostas_rotina_solicitacao;
CREATE TRIGGER trg_plan_prop_rotina_updated BEFORE UPDATE ON public.plan_propostas_rotina_solicitacao
FOR EACH ROW EXECUTE FUNCTION public.fn_plan_prop_rotina_set_updated_at();

-- RLS · mesmo padrão de plan_propostas (staff do módulo lê · escrita só
-- backend/service_role, que já restringe ao próprio proponente na rota).
ALTER TABLE public.plan_propostas_rotina_solicitacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_prop_rotina_select ON public.plan_propostas_rotina_solicitacao;
CREATE POLICY plan_prop_rotina_select ON public.plan_propostas_rotina_solicitacao
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('planejamento-anual') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS plan_prop_rotina_service ON public.plan_propostas_rotina_solicitacao;
CREATE POLICY plan_prop_rotina_service ON public.plan_propostas_rotina_solicitacao
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.plan_propostas_rotina_solicitacao IS
  'Config de geração automática de solicitações (Compras/Reserva de Espaço) para propostas de rotina · NUNCA consultada pelas rotas de avaliação/decisão (isolamento de propósito) · ver CLAUDE.md.';

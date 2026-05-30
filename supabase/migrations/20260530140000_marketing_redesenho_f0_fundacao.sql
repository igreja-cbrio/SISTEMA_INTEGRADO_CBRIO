-- ============================================================================
-- Marketing · REDESENHO · Fase 0 · Fundação de dados
-- Marcos 2026-05-30: esqueleto do novo fluxo (dor → campanha → triagem → cards,
-- prazos em 2 camadas, slots/dia, colunas novas do Kanban).
--
-- ESTA MIGRATION E ADITIVA · NAO MUDA COMPORTAMENTO. As colunas/tabelas nascem
-- vazias/default e so passam a ser USADAS nas fases seguintes (1-5). O CHECK de
-- estado aceita os valores antigos E os novos (transicao · Fase 3 remapeia).
-- Idempotente.
--
-- (Soft-delete: marketing_campanhas tem deleted_at mas a inclusao na whitelist
--  app_soft_deletable_tables() fica pra Fase 2, quando o delete de campanha for
--  implementado · evita reescrever a lista grande as cegas agora.)
-- ============================================================================
BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1) marketing_campanhas · a "dor" triada (campanha/épico · agrupa N cards)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_campanhas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem          text NOT NULL CHECK (origem IN ('solicitacao','evento','interna')),
  solicitacao_id  uuid REFERENCES public.solicitacoes(id) ON DELETE SET NULL,
  event_id        uuid,                       -- FK logica p/ events (sem constraint dura · events fora do versionamento)
  titulo          text NOT NULL,
  dor_descricao   text,
  publico_alvo    text,
  complexidade    text CHECK (complexidade IS NULL OR complexidade IN ('simples','media','complexa')),
  prazo_entrega   timestamptz,                -- ao SOLICITANTE · Pedro define na triagem (conservador por complexidade)
  status          text NOT NULL DEFAULT 'triagem'
                    CHECK (status IN ('triagem','ativa','concluida','cancelada')),
  solicitante_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

COMMENT ON TABLE public.marketing_campanhas IS
  'Redesenho 2026-05-30 · a "dor" triada (campanha/épico estilo Trello) que agrupa N cards de producao. origem solicitacao|evento|interna. prazo_entrega = ao solicitante (distinto do prazo_producao do card).';

CREATE INDEX IF NOT EXISTS idx_marketing_campanhas_status
  ON public.marketing_campanhas (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_campanhas_solicitacao
  ON public.marketing_campanhas (solicitacao_id) WHERE deleted_at IS NULL;

ALTER TABLE public.marketing_campanhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mkt_campanhas_select  ON public.marketing_campanhas;
DROP POLICY IF EXISTS mkt_campanhas_service ON public.marketing_campanhas;
CREATE POLICY mkt_campanhas_select  ON public.marketing_campanhas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mkt_campanhas_service ON public.marketing_campanhas
  FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) marketing_kanban_cards · campos do novo modelo
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_kanban_cards
  ADD COLUMN IF NOT EXISTS campanha_id    uuid REFERENCES public.marketing_campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo_producao timestamptz,
  ADD COLUMN IF NOT EXISTS duracao_dias   integer CHECK (duracao_dias IS NULL OR duracao_dias > 0),
  ADD COLUMN IF NOT EXISTS pode_paralelo  boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.marketing_kanban_cards.prazo_producao IS
  'Deadline INTERNO do designer (Redesenho 2026-05-30) · distinto do prazo de entrega ao solicitante (marketing_campanhas.prazo_entrega). Buffer entre os dois = revisao do Pedro.';
COMMENT ON COLUMN public.marketing_kanban_cards.duracao_dias IS
  'Dias de trabalho estimados (Pedro define na triagem) · alimenta o planner por slots.';
COMMENT ON COLUMN public.marketing_kanban_cards.pode_paralelo IS
  'true = ocupa 1 slot/dia (paralela · padrao) · false = foco exclusivo. Redesenho 2026-05-30.';

CREATE INDEX IF NOT EXISTS idx_marketing_cards_campanha
  ON public.marketing_kanban_cards (campanha_id) WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) marketing_membros · slots por pessoa (planner)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_membros
  ADD COLUMN IF NOT EXISTS slots_dia integer NOT NULL DEFAULT 3 CHECK (slots_dia > 0);
COMMENT ON COLUMN public.marketing_membros.slots_dia IS
  'Max de demandas paralelas por DIA no planner (Redesenho) · default 3 · configuravel por pessoa.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4) marketing_compromissos_recorrentes · consome slot ou e so fundo?
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_compromissos_recorrentes
  ADD COLUMN IF NOT EXISTS eh_demanda_calendario boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.marketing_compromissos_recorrentes.eh_demanda_calendario IS
  'true = rotina que consome 1 slot/dia (ex: redes sociais da Lorena) · false = reuniao de fundo (so visivel, nao tira slot). Redesenho 2026-05-30.';

-- ──────────────────────────────────────────────────────────────────────────
-- 5) Estado do card · adiciona os novos valores mantendo os legados
--    (transicao · Fase 3 remapeia fila/em_producao/aguardando_solicitante e
--     remove os legados deste CHECK). Drop dinamico pra nao depender do nome.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con
    FROM pg_constraint
   WHERE conrelid = 'public.marketing_kanban_cards'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%estado%'
   LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.marketing_kanban_cards DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.marketing_kanban_cards
  ADD CONSTRAINT marketing_kanban_cards_estado_check CHECK (estado IN (
    'triagem','backlog','pesquisa','producao','revisao','concluido',  -- novos (régua final)
    'fila','em_producao','aguardando_solicitante'                      -- legados · removidos na Fase 3
  ));

COMMIT;

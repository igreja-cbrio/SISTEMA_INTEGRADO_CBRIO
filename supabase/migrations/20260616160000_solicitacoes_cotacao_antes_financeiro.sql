-- ============================================================================
-- Solicitacoes · Cotacao ANTES da aprovacao financeira (Compras + Servico)
-- ============================================================================
-- Marcos (2026-06-16): "o fluxo esta errado · primeiro vem a cotacao, depois a
-- aprovacao do financeiro". Hoje compras/servico iam: origem -> financeiro (Yago,
-- no escuro, sem o valor real) -> logistica cota e compra.
--
-- Fluxo novo (compras/servico):
--   origem (diretor) -> EM_COTACAO (logistica levanta valor + fornecedor)
--   -> aprovacao financeira (Yago decide sobre o valor COTADO) -> logistica compra.
-- Reembolso/pagamento (valor ja conhecido) seguem direto pro financeiro, sem cotacao.
--
-- O backend liga o fluxo no caminho normal: aprovar-origem manda compras/servico pra
-- 'em_cotacao'; o endpoint novo registrar-cotacao grava valor+fornecedor e move pra
-- 'aguardando_aprovacao_financeira'.
--
-- Esta migration prepara o SCHEMA (status + campos) E recria o trigger
-- tg_solicitacoes_calcula_sla (secao 3) pra cobrir o ATALHO da origem DISPENSADA
-- (diretoria/sem-diretor nao passam pelo aprovar-origem): nesse caso compras/servico
-- caem em 'em_cotacao' ja no INSERT, em vez de pular direto pro Yago. O resto do
-- trigger (SLA deadlines, alcada) e' identico ao 20260601120000.
--
-- Idempotente. Atomica. Aditiva (nao-destrutiva).
-- ============================================================================

BEGIN;

-- 1 · novo status 'em_cotacao' (etapa da logistica, entre a origem e o financeiro)
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_status_check
  CHECK (status IN (
    'aguardando_aprovacao_origem',
    'em_cotacao',
    'pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido',
    'aguardando_aprovacao_financeira', 'em_atendimento', 'aguardando_entrega', 'avaliado',
    'aguardando_ajuste', 'cancelado'
  ));

-- 2 · campos da cotacao · a logistica preenche antes de mandar pro financeiro
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS valor_cotado        numeric,
  ADD COLUMN IF NOT EXISTS cotacao_fornecedor  text,
  ADD COLUMN IF NOT EXISTS cotacao_observacao  text,
  ADD COLUMN IF NOT EXISTS cotacao_em          timestamptz,
  ADD COLUMN IF NOT EXISTS cotacao_por         uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.solicitacoes.valor_cotado IS
  'Valor cotado pela logistica (compras/servico) · base da aprovacao financeira do Yago. Fluxo cotacao->financeiro · 2026-06-16.';

-- 3 · trigger de SLA · compras/servico vao pra 'em_cotacao' no INSERT quando a aprovacao
--     de origem e' DISPENSADA (diretoria geral / sem diretor mapeado · esses NAO passam
--     pelo aprovar-origem do backend, que e' quem manda pra cotacao no fluxo normal).
--     Sem isto, o ramo antigo mandava direto pra 'aguardando_aprovacao_financeira',
--     PULANDO a cotacao pra quem dispensa origem. Espelha 20260601120000 · a unica
--     mudanca e' o destino de compras/servico nesse IF de INSERT (em_cotacao).
CREATE OR REPLACE FUNCTION public.tg_solicitacoes_calcula_sla()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_dl RECORD;
  v_limite numeric;
BEGIN
  IF NEW.area_responsavel IS NOT NULL
     AND (NEW.sla_resposta_deadline IS NULL OR
          (TG_OP = 'UPDATE' AND NEW.eh_urgente IS DISTINCT FROM OLD.eh_urgente))
  THEN
    SELECT * INTO v_dl FROM public.calcular_sla_deadlines(
      NEW.area_responsavel,
      NEW.subcategoria,
      NEW.eh_urgente,
      coalesce(NEW.created_at, now())
    );
    NEW.sla_resposta_deadline := v_dl.resposta;
    NEW.sla_resolucao_deadline := v_dl.resolucao;
  END IF;

  -- Aprovacao financeira:
  --   compras/reembolso/pagamento/servico SEMPRE; outros se valor > alcada
  IF TG_OP = 'INSERT' THEN
    IF NEW.categoria IN ('compras', 'reembolso', 'pagamento', 'servico') THEN
      NEW.precisa_aprovacao_financeira := true;
      IF NEW.status = 'pendente' OR NEW.status IS NULL THEN
        -- compras/servico cotam ANTES do financeiro (2026-06-16) · reembolso/pagamento direto
        IF NEW.categoria IN ('compras', 'servico') THEN
          NEW.status := 'em_cotacao';
        ELSE
          NEW.status := 'aguardando_aprovacao_financeira';
        END IF;
      END IF;
    ELSIF NEW.valor_estimado IS NOT NULL
       AND NEW.area_cliente IS NOT NULL
       AND NEW.area_responsavel != 'financeiro'
    THEN
      SELECT limite_aprovacao INTO v_limite
        FROM public.area_alcadas
       WHERE area_cliente = NEW.area_cliente;
      v_limite := COALESCE(v_limite, 1000);
      IF NEW.valor_estimado > v_limite THEN
        NEW.precisa_aprovacao_financeira := true;
        IF NEW.status = 'pendente' OR NEW.status IS NULL THEN
          NEW.status := 'aguardando_aprovacao_financeira';
        END IF;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMIT;

-- ============================================================================
-- Solicitacoes · adiciona os fluxos PAGAMENTOS e SERVICOS + enriquece COMPRAS
--
-- Marcos (2026-06-01): a administracao recebe 5 fluxos distintos com donos
-- diferentes (Reembolso, Reserva de Espaco, Compras, Pagamentos, Servicos).
-- So 3 existiam · Compras era flat (so valor) · Pagamentos e Servicos caiam no
-- limbo do 'Outro' (area_responsavel=NULL · sem dono, sem SLA, sem aprovacao
-- financeira automatica). Esta migration:
--   · Aceita 'pagamento' e 'servico' na CHECK de categoria
--   · Roteia (no backend) pagamento -> financeiro (subcategoria 'pagamento')
--                          servico   -> logistica_compras (subcategoria 'servico')
--   · Estende o gatilho de aprovacao financeira (Yago) pra incluir os 2 novos
--     (compras/reembolso/pagamento/servico SEMPRE passam pelo financeiro)
--   · Adiciona colunas estruturadas reusando ao maximo as que ja existem
--     (documento_url / forma_pagamento / chave_pix / banco / agencia / conta /
--      valor_estimado / data_necessaria=vencimento p/ pagamento)
--   · Seeda o SLA das 2 novas subcategorias
--
-- ADITIVA · nao-destrutiva · idempotente · atomica. Nao remove nada · so amplia
-- dominios e adiciona colunas/linhas. Seguro reaplicar.
-- ============================================================================

BEGIN;

-- ── 1. CHECK de categoria aceita pagamento + servico (mantem as existentes) ──
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_categoria_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_categoria_check
  CHECK (categoria = ANY (ARRAY[
    'ti','compras','reembolso','espaco','reserva_espaco','infraestrutura',
    'ferias','licenca','marketing','pagamento','servico','outro'
  ]::text[]));

-- ── 2. Colunas estruturadas novas (compartilhadas entre os fluxos) ───────────
-- favorecido_*   · pagamento: quem recebe · servico/compras: fornecedor sugerido
-- itens          · compras: o que comprar (+ qtd) · servico: qual servico
-- link_referencia· compras/servico: link do produto / proposta online
-- recorrente     · pagamento/servico que se repetem (aluguel, mensalidade, etc)
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS favorecido_nome      text,
  ADD COLUMN IF NOT EXISTS favorecido_documento text,
  ADD COLUMN IF NOT EXISTS itens                text,
  ADD COLUMN IF NOT EXISTS link_referencia      text,
  ADD COLUMN IF NOT EXISTS recorrente           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recorrencia          text;

-- ── 3. Gatilho de aprovacao financeira · inclui pagamento + servico ──────────
-- Espelha 20260522150000 · UNICA mudanca e' a lista de categorias que SEMPRE
-- exigem o Yago. O resto (SLA deadlines, valor>alcada pras demais) e' identico,
-- preservando a interacao com a aprovacao hierarquica de origem (Spec 001):
-- quando o backend ja gravou status='aguardando_aprovacao_origem', o IF de
-- status='pendente' nao dispara · so seta precisa_aprovacao_financeira=true e o
-- portao financeiro entra DEPOIS que o diretor de origem aprova.
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
        NEW.status := 'aguardando_aprovacao_financeira';
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

-- ── 4. SLA das novas subcategorias ───────────────────────────────────────────
-- financeiro/pagamento · financeiro NAO tem subcategoria 'default', entao
-- precisa de linha propria (senao cai no fallback hardcoded 24h/48h).
-- logistica_compras/servico · contratar fornecedor leva mais tempo que comprar.
INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao) VALUES
  ('financeiro',       'pagamento', false, 48, 120, 'Pagamento a fornecedor · resposta 2d + pagamento 5d'),
  ('financeiro',       'pagamento', true,  24, 48,  'Pagamento urgente · vencimento iminente'),
  ('logistica_compras','servico',   false, 72, 336, 'Contratacao de servico · 3d resposta + ate 14d fechar fornecedor'),
  ('logistica_compras','servico',   true,  24, 72,  'Servico urgente · evento iminente')
ON CONFLICT (area_responsavel, subcategoria, eh_urgente) DO NOTHING;

COMMIT;

-- ── Conferencia ──────────────────────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'solicitacoes_categoria_check';  -- inclui pagamento/servico
-- SELECT area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas
--   FROM sla_definicoes WHERE subcategoria IN ('pagamento','servico') ORDER BY 1,2,3;
-- ============================================================================

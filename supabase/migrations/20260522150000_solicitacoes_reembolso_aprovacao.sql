-- Solicitacoes · campos de reembolso + fluxo de aprovacao financeira
-- 2026-05-22 · Marcos pediu:
--   "quando chegar pedido de compra, antes de chegar pro Amaury comprar,
--    deve ser aprovado pelo Yago (responsavel financeiro)"
--   "reembolso deve ter motivo, anexar comprovante, data da compra,
--    forma de pagamento, pix para receber"

-- 1. ADD COLUMNS pra reembolso (campos que ja eram enviados pelo
-- frontend mas iam silenciosamente pra lugar nenhum)
ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS motivo_reembolso text,
  ADD COLUMN IF NOT EXISTS data_compra date,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS chave_pix text,
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text,
  ADD COLUMN IF NOT EXISTS documento_url text;

-- 2. Trigger novo · compras E reembolsos SEMPRE precisam aprovacao
-- financeira. Outros casos continuam dependendo de valor > alcada.
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
  --   compras e reembolsos SEMPRE; outros se valor > alcada
  IF TG_OP = 'INSERT' THEN
    IF NEW.categoria IN ('compras', 'reembolso') THEN
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

-- 3. Cadastra Yago como responsavel da area 'financeiro' (idempotente)
INSERT INTO area_solicitacoes_responsaveis (area, profile_id)
SELECT 'financeiro', p.id
FROM profiles p
WHERE LOWER(p.email) IN ('yago.torres@cbrio.com', 'yago.torres@cbrio.com.br', 'yago.torres@cbrio.org')
   OR LOWER(p.name) LIKE '%yago%torres%'
ON CONFLICT (area, profile_id) DO NOTHING;

COMMIT;

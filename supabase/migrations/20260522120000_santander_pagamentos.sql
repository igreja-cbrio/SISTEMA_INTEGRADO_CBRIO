-- Santander Pagamentos · boletos, tributos, concessionarias
-- Roadmap APIs novas Santander (2/3 · pos #629)

CREATE TABLE IF NOT EXISTS santander_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text UNIQUE,                                       -- ID retornado Santander
  tipo text NOT NULL CHECK (tipo IN ('boleto', 'tributo', 'concessionaria', 'darf')),
  codigo_barras text,                                            -- 44 digitos (gerado a partir da linha)
  linha_digitavel text NOT NULL,                                 -- 47 (boleto) ou 48 (tributo)
  valor numeric(14, 2) NOT NULL CHECK (valor > 0),
  data_vencimento date,
  data_pagamento date NOT NULL,                                  -- quando vai liquidar
  beneficiario_nome text,
  beneficiario_cnpj text,
  descricao text,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'AGENDADO', 'EFETIVADO', 'REJEITADO', 'CANCELADO', 'AGUARDANDO_APROVACAO', 'ERRO')),
  status_detalhe text,                                           -- mensagem do banco
  origem text,                                                   -- 'manual_admin' | 'contas_pagar' | 'solicitacao'
  conta_pagar_id uuid REFERENCES fin_contas_pagar(id) ON DELETE SET NULL,
  metadata jsonb,
  criado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cancelado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cancelado_em timestamptz,
  efetivado_em timestamptz,
  rejeitado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS santander_pagamentos_status_idx
  ON santander_pagamentos(status, data_pagamento DESC);
CREATE INDEX IF NOT EXISTS santander_pagamentos_tipo_idx
  ON santander_pagamentos(tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS santander_pagamentos_conta_idx
  ON santander_pagamentos(conta_pagar_id) WHERE conta_pagar_id IS NOT NULL;

CREATE OR REPLACE FUNCTION santander_pagamentos_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_santander_pagamentos_touch ON santander_pagamentos;
CREATE TRIGGER tg_santander_pagamentos_touch
  BEFORE UPDATE ON santander_pagamentos
  FOR EACH ROW EXECUTE FUNCTION santander_pagamentos_touch();

-- RLS · financeiro >= 3 le · service_role bypass
ALTER TABLE santander_pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS santander_pagamentos_service ON santander_pagamentos;
CREATE POLICY santander_pagamentos_service ON santander_pagamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS santander_pagamentos_admin_read ON santander_pagamentos;
CREATE POLICY santander_pagamentos_admin_read ON santander_pagamentos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 3
  );

COMMIT;

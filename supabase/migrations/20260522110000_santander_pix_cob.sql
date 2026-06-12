-- Santander PIX Cobranca · QR Code gerado via API
-- Roadmap APIs novas Santander (1/3 · pos #628)
-- Idempotente.

CREATE TABLE IF NOT EXISTS santander_pix_cob (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txid text UNIQUE NOT NULL,
  valor numeric(12, 2) NOT NULL CHECK (valor > 0),
  devedor_nome text,
  devedor_cpf_cnpj text,
  solicitacao_pagador text,
  expira_em_segundos int NOT NULL DEFAULT 3600,
  status text NOT NULL DEFAULT 'ATIVA'
    CHECK (status IN ('ATIVA', 'CONCLUIDA', 'REMOVIDA_PELO_USUARIO_RECEBEDOR', 'REMOVIDA_PELO_PSP', 'ERRO')),
  qrcode_payload text,                      -- BR Code (copia e cola)
  location_url text,                         -- qrcodes-pix.santander.com.br/...
  loc_id text,
  chave_pix text,
  revisao int DEFAULT 0,
  pago_em timestamptz,
  pago_valor numeric(12, 2),
  pago_e2e_id text,
  origem text,                               -- 'site_doacao' | 'evento_inscricao' | 'manual_admin'
  metadata jsonb,
  criado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS santander_pix_cob_status_idx
  ON santander_pix_cob(status, created_at DESC);
CREATE INDEX IF NOT EXISTS santander_pix_cob_origem_idx
  ON santander_pix_cob(origem) WHERE origem IS NOT NULL;

CREATE OR REPLACE FUNCTION santander_pix_cob_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_santander_pix_cob_touch ON santander_pix_cob;
CREATE TRIGGER tg_santander_pix_cob_touch
  BEFORE UPDATE ON santander_pix_cob
  FOR EACH ROW EXECUTE FUNCTION santander_pix_cob_touch();

-- RLS · so financeiro >=3 e super-admin leem
ALTER TABLE santander_pix_cob ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS santander_pix_cob_service ON santander_pix_cob;
CREATE POLICY santander_pix_cob_service ON santander_pix_cob
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS santander_pix_cob_admin_read ON santander_pix_cob;
CREATE POLICY santander_pix_cob_admin_read ON santander_pix_cob
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 3
  );

COMMIT;

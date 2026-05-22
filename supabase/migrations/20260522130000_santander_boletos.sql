-- Santander Boletos · emissao de boletos via API
-- Roadmap APIs novas Santander (3/3 · pos #630)

CREATE TABLE IF NOT EXISTS santander_boletos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nosso_numero text UNIQUE NOT NULL,                            -- gerado a partir da sequence
  bill_id text,                                                  -- ID do Santander
  workspace_id text,                                             -- workspace usado na emissao
  valor numeric(14, 2) NOT NULL CHECK (valor > 0),
  data_vencimento date NOT NULL,
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  pagador_nome text NOT NULL,
  pagador_documento text,
  pagador_tipo_doc text CHECK (pagador_tipo_doc IN ('CPF', 'CNPJ')),
  pagador_email text,
  pagador_telefone text,
  pagador_logradouro text,
  pagador_numero text,
  pagador_bairro text,
  pagador_cidade text,
  pagador_uf text,
  pagador_cep text,
  descricao text,
  instrucoes text,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'REGISTRADO', 'LIQUIDADO', 'BAIXADO', 'PROTESTADO', 'CANCELADO', 'ERRO')),
  status_detalhe text,
  linha_digitavel text,
  codigo_barras text,
  qrcode_pix text,                                               -- Pix copia-e-cola se for boleto hibrido
  pdf_url text,
  multa_pct numeric(5, 2),
  juros_pct_dia numeric(5, 4),
  desconto_valor numeric(14, 2),
  desconto_data_limite date,
  liquidado_em timestamptz,
  liquidado_valor numeric(14, 2),
  origem text,                                                   -- 'manual_admin' | 'cobranca_solicitacao'
  metadata jsonb,
  criado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cancelado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cancelado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS santander_boletos_status_idx
  ON santander_boletos(status, data_vencimento DESC);
CREATE INDEX IF NOT EXISTS santander_boletos_pagador_doc_idx
  ON santander_boletos(pagador_documento) WHERE pagador_documento IS NOT NULL;

CREATE OR REPLACE FUNCTION santander_boletos_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_santander_boletos_touch ON santander_boletos;
CREATE TRIGGER tg_santander_boletos_touch
  BEFORE UPDATE ON santander_boletos
  FOR EACH ROW EXECUTE FUNCTION santander_boletos_touch();

-- Sequencia pro nosso_numero (Santander aceita ate 13 digitos numericos)
CREATE SEQUENCE IF NOT EXISTS santander_boletos_nosso_numero_seq
  START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1;

-- Helper RPC pra chamar nextval sem precisar de SQL direto
CREATE OR REPLACE FUNCTION public.santander_proximo_nosso_numero()
RETURNS bigint
LANGUAGE sql
VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nextval('santander_boletos_nosso_numero_seq');
$$;

REVOKE ALL ON FUNCTION public.santander_proximo_nosso_numero() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.santander_proximo_nosso_numero() TO authenticated, service_role;

-- RLS · financeiro >= 3 le · service_role bypass
ALTER TABLE santander_boletos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS santander_boletos_service ON santander_boletos;
CREATE POLICY santander_boletos_service ON santander_boletos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS santander_boletos_admin_read ON santander_boletos;
CREATE POLICY santander_boletos_admin_read ON santander_boletos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 3
  );

COMMIT;

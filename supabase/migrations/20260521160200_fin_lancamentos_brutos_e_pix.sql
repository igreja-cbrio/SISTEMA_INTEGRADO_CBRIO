-- Estrutura fiscal · Lancamentos brutos (OFX) + Detalhes PIX (com hora) + Matching
-- Toda transacao crua entra primeiro em fin_lancamentos_brutos.
-- Quando vem do extrato PIX (CSV/Excel), o detalhe vai pra fin_pix_detalhe.
-- Engine de matching liga as duas (data + valor + CPF) e enriquece com hora real.

-- ============================================================
-- 1. LANCAMENTOS BRUTOS · transacoes cruas do OFX / API Santander
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_lancamentos_brutos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL CHECK (fonte IN ('ofx', 'santander_api', 'manual', 'csv')),
  conta_id uuid REFERENCES fin_contas(id) ON DELETE SET NULL,
  data_lancamento date NOT NULL,
  hora_lancamento time,                     -- preenchida via matching com PIX detalhe
  hora_origem text,                         -- 'ofx' | 'api' | 'pix_match' | 'manual'
  valor numeric(18, 2) NOT NULL,            -- positivo=credito · negativo=debito
  tipo_trn text NOT NULL CHECK (tipo_trn IN ('CREDIT', 'DEBIT')),
  memo text,                                -- descricao original do banco
  fitid text,                               -- FITID OFX
  end_to_end_id text,                       -- ID PIX (quando aplicavel)
  documento_contraparte text,               -- CPF/CNPJ extraido do MEMO
  nome_contraparte text,                    -- nome extraido
  banco_origem text,                        -- banco do pagador (PIX)
  ja_classificado boolean NOT NULL DEFAULT false,
  raw_data jsonb,                           -- registro original
  upload_id uuid,                           -- agrupa transacoes do mesmo upload
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

-- Indices
CREATE INDEX IF NOT EXISTS fin_lanc_brutos_data_idx ON fin_lancamentos_brutos(data_lancamento DESC);
CREATE INDEX IF NOT EXISTS fin_lanc_brutos_classif_idx ON fin_lancamentos_brutos(ja_classificado, data_lancamento DESC);
CREATE INDEX IF NOT EXISTS fin_lanc_brutos_doc_idx ON fin_lancamentos_brutos(documento_contraparte) WHERE documento_contraparte IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_lanc_brutos_fitid_idx ON fin_lancamentos_brutos(fitid) WHERE fitid IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_lanc_brutos_upload_idx ON fin_lancamentos_brutos(upload_id) WHERE upload_id IS NOT NULL;

-- UNIQUE composto: nao duplica mesma transacao do mesmo banco
CREATE UNIQUE INDEX IF NOT EXISTS fin_lanc_brutos_fitid_conta_uq
  ON fin_lancamentos_brutos(conta_id, fitid) WHERE fitid IS NOT NULL;

-- ============================================================
-- 2. DETALHES PIX · vem do extrato PIX (Excel/CSV)
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_pix_detalhe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  end_to_end_id text NOT NULL UNIQUE,       -- chave do PIX
  conta_id uuid REFERENCES fin_contas(id) ON DELETE SET NULL,
  data date NOT NULL,                       -- BRT (calculado do ID)
  hora time NOT NULL,                       -- BRT (UTC - 3h)
  datetime_brt timestamp NOT NULL,          -- combinado
  datetime_utc timestamp,                   -- original do ID
  valor numeric(18, 2) NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('recebido', 'enviado')),
  banco_origem text,                        -- banco do pagador
  ispb_origem text,                         -- 8 dig extraido do ID
  pagador_nome text,
  pagador_documento text,                   -- CPF/CNPJ se conhecido
  titularidade text,                        -- ex: 'Pix recebido-outra inst-dif tit'
  identificador_pagamento text,             -- campo extra do banco
  culto_slot_id uuid REFERENCES fin_culto_slots(id),
  lancamento_bruto_id uuid REFERENCES fin_lancamentos_brutos(id) ON DELETE SET NULL,
  match_score numeric,                      -- 0-1 confianca do match
  match_status text DEFAULT 'pendente' CHECK (match_status IN ('pendente', 'matched', 'sem_match', 'manual')),
  raw_data jsonb,
  upload_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_pix_detalhe_data_idx ON fin_pix_detalhe(data DESC, hora);
CREATE INDEX IF NOT EXISTS fin_pix_detalhe_match_idx ON fin_pix_detalhe(match_status);
CREATE INDEX IF NOT EXISTS fin_pix_detalhe_culto_idx ON fin_pix_detalhe(culto_slot_id);
CREATE INDEX IF NOT EXISTS fin_pix_detalhe_lanc_idx ON fin_pix_detalhe(lancamento_bruto_id);
CREATE INDEX IF NOT EXISTS fin_pix_detalhe_upload_idx ON fin_pix_detalhe(upload_id) WHERE upload_id IS NOT NULL;

-- ============================================================
-- 3. UPLOADS · registro de cada importacao
-- ============================================================
CREATE TABLE IF NOT EXISTS fin_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('ofx', 'pix_csv', 'pix_xlsx', 'cartao_csv')),
  conta_id uuid REFERENCES fin_contas(id),
  arquivo_nome text NOT NULL,
  arquivo_tamanho int,
  total_registros int DEFAULT 0,
  total_novos int DEFAULT 0,
  total_duplicados int DEFAULT 0,
  total_classificados_auto int DEFAULT 0,
  total_matched_pix int DEFAULT 0,
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'concluido', 'erro')),
  erro_msg text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  concluido_em timestamptz
);

CREATE INDEX IF NOT EXISTS fin_uploads_tipo_idx ON fin_uploads(tipo, created_at DESC);

-- ============================================================
-- 4. TRIGGER · auto-popula data/hora/culto em fin_pix_detalhe
-- ============================================================
CREATE OR REPLACE FUNCTION fin_pix_detalhe_preencher_datetime()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dt timestamp;
BEGIN
  -- Se nao veio datetime_brt explicito, extrai do ID
  IF NEW.datetime_brt IS NULL AND NEW.end_to_end_id IS NOT NULL THEN
    v_dt := fin_extrai_datetime_pix(NEW.end_to_end_id);
    IF v_dt IS NOT NULL THEN
      NEW.datetime_brt := v_dt;
      NEW.datetime_utc := v_dt + interval '3 hours';
      NEW.data := v_dt::date;
      NEW.hora := v_dt::time;
    END IF;
  END IF;

  -- ISPB do banco emissor
  IF NEW.ispb_origem IS NULL AND NEW.end_to_end_id IS NOT NULL AND length(NEW.end_to_end_id) >= 9 THEN
    NEW.ispb_origem := substring(NEW.end_to_end_id FROM 2 FOR 8);
  END IF;

  -- Identifica culto pelo datetime
  IF NEW.culto_slot_id IS NULL AND NEW.datetime_brt IS NOT NULL THEN
    NEW.culto_slot_id := fin_identifica_culto(NEW.datetime_brt);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fin_pix_detalhe_datetime ON fin_pix_detalhe;
CREATE TRIGGER tg_fin_pix_detalhe_datetime
  BEFORE INSERT OR UPDATE ON fin_pix_detalhe
  FOR EACH ROW
  EXECUTE FUNCTION fin_pix_detalhe_preencher_datetime();

COMMIT;

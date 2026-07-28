-- Porta 1 · Eventos Externos entra no Contrato de Inscrição (F3.1 · PR 1)
-- Specs: docs/modulo-inscricoes/ (decisões D1–D9 + ajuste 28/07).
-- SÓ ADD — nenhuma linha existente muda; inscrições antigas do Celebra
-- (só nome+telefone) continuam válidas e visíveis para sempre.

-- ext_eventos: regulariza o schema drift do capa_url (a coluna existe em
-- produção sem migration; grep em supabase/ = 0 hits antes desta)
ALTER TABLE public.ext_eventos ADD COLUMN IF NOT EXISTS capa_url TEXT;

-- ext_inscricoes: campos padrão do contrato + rastreio
ALTER TABLE public.ext_inscricoes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmada',
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'formulario_publico',
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS sexo TEXT,
  ADD COLUMN IF NOT EXISTS endereco TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_optin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_optin_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dados_anterior JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- CHECKs (idempotentes via catálogo). Colunas novas: nenhum dado legado viola.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ext_insc_status') THEN
    ALTER TABLE public.ext_inscricoes
      ADD CONSTRAINT chk_ext_insc_status CHECK (status IN ('confirmada','cancelada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ext_insc_origem') THEN
    ALTER TABLE public.ext_inscricoes
      ADD CONSTRAINT chk_ext_insc_origem CHECK (origem IN ('formulario_publico','manual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ext_insc_sexo') THEN
    ALTER TABLE public.ext_inscricoes
      ADD CONSTRAINT chk_ext_insc_sexo CHECK (sexo IS NULL OR sexo IN ('masculino','feminino'));
  END IF;
END $$;

-- Índices de dedup/consulta. NÃO-únicos de propósito: unicidade física só
-- depois do saneamento das duplicatas legadas; o dedup das inscrições NOVAS
-- é por CPF na aplicação, com telefone como fallback das linhas legadas.
CREATE INDEX IF NOT EXISTS idx_ext_insc_evento_cpf
  ON public.ext_inscricoes (evento_id, cpf) WHERE deleted_at IS NULL AND cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ext_insc_evento_tel
  ON public.ext_inscricoes (evento_id, telefone) WHERE deleted_at IS NULL;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.fn_ext_inscricoes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_ext_inscricoes_updated_at ON public.ext_inscricoes;
CREATE TRIGGER trg_ext_inscricoes_updated_at
  BEFORE UPDATE ON public.ext_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_ext_inscricoes_updated_at();

COMMENT ON COLUMN public.ext_inscricoes.status IS
  'confirmada|cancelada — RSVP; check-in/pagamento chegam com a espinha (Fase 2).';
COMMENT ON COLUMN public.ext_inscricoes.dados_anterior IS
  'Snapshot do jsonb dados antes do último merge de re-inscrição (resposta nunca é sobrescrita com vazio).';

-- ============================================================================
-- Modulo NEXT - porta de entrada da CBRio (3 primeiros domingos do mes)
--
-- Pessoa se inscreve via formulario publico -> chega notificacao para o
-- responsavel do NEXT -> no domingo do evento o responsavel faz check-in
-- na chegada -> durante/apos pode marcar indicacoes (quer batizar, servir,
-- entrar em grupo, comecar dizimo) -> notifica responsavel da area.
--
-- Indicadores alimentados (pos-PR de coletor):
--   NEXT-01: % inscritos nao batizados que viraram batizandos pos-NEXT
--   NEXT-02: % inscritos nao voluntarios que viraram voluntarios pos-NEXT
--   NEXT-03: % inscritos com registro de oferta/dizimo pos-NEXT
--   NEXT-04: NPS do NEXT (manual via questionario)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Eventos do NEXT (1 por domingo)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS next_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL UNIQUE,
  titulo TEXT,
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'realizado', 'cancelado')),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_next_eventos_data ON next_eventos(data DESC);
CREATE INDEX IF NOT EXISTS idx_next_eventos_status ON next_eventos(status);

-- ----------------------------------------------------------------------------
-- 2. Inscricoes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS next_inscricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID REFERENCES next_eventos(id) ON DELETE SET NULL,

  -- Dados pessoais
  nome TEXT NOT NULL,
  sobrenome TEXT,
  cpf TEXT,
  telefone TEXT,
  email TEXT,
  data_nascimento DATE,
  observacoes TEXT,

  -- Vinculo opcional com membro existente (cruzamento futuro)
  membro_id UUID,

  -- Snapshot do status pre-NEXT (preenchido na inscricao):
  -- usado para o coletor saber "estava nao-batizado quando se inscreveu?"
  ja_batizado BOOLEAN DEFAULT false,
  ja_voluntario BOOLEAN DEFAULT false,
  ja_doador BOOLEAN DEFAULT false,

  -- Check-in (preenchido no domingo do evento)
  check_in_at TIMESTAMPTZ,
  check_in_by UUID,

  -- Indicacoes feitas pela pessoa no NEXT
  indicou_batismo BOOLEAN DEFAULT false,
  indicou_servir BOOLEAN DEFAULT false,
  indicou_grupo BOOLEAN DEFAULT false,
  indicou_dizimo BOOLEAN DEFAULT false,
  indicacao_observacoes TEXT,
  indicacao_marcada_em TIMESTAMPTZ,
  indicacao_marcada_por UUID,

  -- Origem
  origem TEXT NOT NULL DEFAULT 'formulario'
    CHECK (origem IN ('formulario', 'manual')),
  registered_by UUID,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_next_inscricoes_evento ON next_inscricoes(evento_id);
CREATE INDEX IF NOT EXISTS idx_next_inscricoes_email ON next_inscricoes(email);
CREATE INDEX IF NOT EXISTS idx_next_inscricoes_cpf ON next_inscricoes(cpf);
CREATE INDEX IF NOT EXISTS idx_next_inscricoes_created ON next_inscricoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_next_inscricoes_checkin ON next_inscricoes(check_in_at)
  WHERE check_in_at IS NOT NULL;

-- Evita duplicidade de inscricao do mesmo CPF/email no mesmo evento
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_insc_evento_cpf
  ON next_inscricoes(evento_id, cpf) WHERE cpf IS NOT NULL AND evento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_insc_evento_email
  ON next_inscricoes(evento_id, email) WHERE email IS NOT NULL AND evento_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Indicacoes derivadas (notificam outras areas)
--    Cada indicacao gera uma linha aqui que vira pendencia para a area
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS next_indicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_id UUID NOT NULL REFERENCES next_inscricoes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('batismo', 'servir', 'grupo', 'dizimo')),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_andamento', 'concluido', 'cancelado')),
  area_destino TEXT,
  observacoes TEXT,
  atendido_por UUID,
  atendido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (inscricao_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_next_indic_status ON next_indicacoes(status);
CREATE INDEX IF NOT EXISTS idx_next_indic_tipo ON next_indicacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_next_indic_inscricao ON next_indicacoes(inscricao_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE next_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_inscricoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_indicacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "next_eventos_read" ON next_eventos;
CREATE POLICY "next_eventos_read" ON next_eventos FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "next_inscricoes_read" ON next_inscricoes;
CREATE POLICY "next_inscricoes_read" ON next_inscricoes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "next_indicacoes_read" ON next_indicacoes;
CREATE POLICY "next_indicacoes_read" ON next_indicacoes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Backend (service role) faz escritas

-- ═════════════════════════════════════════════════════════════════════
-- Planejamento Anual CBRio — PR-A (fundação)
-- ═════════════════════════════════════════════════════════════════════
--
-- Contexto: Todo outubro a CBRio planeja o ano seguinte. Líderes propõem
-- eventos/séries/projetos para o ano. Diretor de setor (Criativo/
-- Ministerial/Gestão) faz 1ª aprovação. Diretoria geral faz aprovação
-- final. Cada proposta aprovada vira event/project oficial.
--
-- Esta migration cria a FUNDAÇÃO: schema completo. PR-A traz endpoints
-- básicos (criar ciclo, criar proposta). PR-B traz workflow de aprovação.
-- PR-C traz litúrgicos + filtros de ano em outras telas.

-- ─── 1. Setores (Criativo, Ministerial, Gestão) ────────────────────────
-- Operações fica dentro de Gestão por decisão do Marcos.
-- diretor_id = quem aprova proposições no 1º estágio. Pode ser ajustado
-- depois quando o sistema de permissões definitivo for finalizado.

CREATE TABLE IF NOT EXISTS planejamento_setores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL UNIQUE,
  diretor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  descricao     TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO planejamento_setores (nome, descricao) VALUES
  ('Criativo', 'Marketing, Produção, Adoração e demais áreas criativas'),
  ('Ministerial', 'Ministérios, cuidados, integração, voluntariado'),
  ('Gestão', 'Administrativo, Financeiro, Logística, Operações, RH')
ON CONFLICT (nome) DO NOTHING;

COMMENT ON COLUMN planejamento_setores.diretor_id IS
  'Diretor do setor que faz a 1ª aprovação de propostas. Preencher manualmente após migration aplicada.';

-- ─── 2. Mapa área → setor (qual área pertence a qual setor) ────────────
-- Usado pelo backend pra determinar "quem aprova a proposta de Marketing".

CREATE TABLE IF NOT EXISTS planejamento_areas_setor (
  area      TEXT PRIMARY KEY,
  setor_id  UUID NOT NULL REFERENCES planejamento_setores(id) ON DELETE RESTRICT
);

-- Seed das áreas conhecidas (vw_workload e cycle_phase_tasks usam estes nomes)
INSERT INTO planejamento_areas_setor (area, setor_id)
SELECT a.area, s.id FROM (VALUES
  ('marketing',   'Criativo'),
  ('producao',    'Criativo'),
  ('adoracao',    'Criativo'),
  ('cozinha',     'Gestão'),
  ('limpeza',     'Gestão'),
  ('manutencao',  'Gestão'),
  ('compras',     'Gestão'),
  ('financeiro',  'Gestão'),
  ('adm',         'Gestão'),
  ('logistica',   'Gestão'),
  ('rh',          'Gestão'),
  ('ministerial', 'Ministerial'),
  ('integracao',  'Ministerial'),
  ('cuidados',    'Ministerial'),
  ('voluntariado','Ministerial'),
  ('kids',        'Ministerial')
) AS a(area, setor_nome)
JOIN planejamento_setores s ON s.nome = a.setor_nome
ON CONFLICT (area) DO NOTHING;

-- ─── 3. Ciclos de planejamento (janela do ano) ─────────────────────────

CREATE TABLE IF NOT EXISTS planejamento_ciclos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year            INTEGER NOT NULL UNIQUE,  -- ano sendo planejado (ex: 2027)
  status          TEXT NOT NULL DEFAULT 'aberto'
                  CHECK (status IN ('aberto', 'fechado')),
  description     TEXT,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at       TIMESTAMPTZ,
  closed_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN planejamento_ciclos.status IS
  'aberto = aceita novas propostas. fechado = bloqueia novas, mas pendentes continuam tramitando.';

CREATE INDEX IF NOT EXISTS idx_planejamento_ciclos_year ON planejamento_ciclos(year DESC);
CREATE INDEX IF NOT EXISTS idx_planejamento_ciclos_status ON planejamento_ciclos(status);

-- ─── 4. Propostas (a entidade central do fluxo) ────────────────────────

CREATE TABLE IF NOT EXISTS planejamento_propostas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id                UUID NOT NULL REFERENCES planejamento_ciclos(id) ON DELETE CASCADE,
  tipo                    TEXT NOT NULL CHECK (tipo IN ('evento', 'serie', 'projeto')),
  area                    TEXT NOT NULL,                  -- ex: 'marketing'
  setor_id                UUID NOT NULL REFERENCES planejamento_setores(id),
  proposto_por            UUID NOT NULL REFERENCES profiles(id),
  proposto_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  payload_original        JSONB NOT NULL,                 -- snapshot imutável do que foi enviado
  payload_atual           JSONB NOT NULL,                 -- pode ser editado por diretor/diretoria

  status                  TEXT NOT NULL DEFAULT 'pendente_diretor'
                          CHECK (status IN (
                            'pendente_diretor',
                            'pendente_diretoria',
                            'aprovado',
                            'aprovado_com_ressalvas',
                            'rejeitado'
                          )),

  -- decisão do diretor de setor
  diretor_decisao_por     UUID REFERENCES profiles(id),
  diretor_decisao_em      TIMESTAMPTZ,
  diretor_decisao         TEXT CHECK (diretor_decisao IN ('aprovado', 'aprovado_com_ressalvas', 'rejeitado')),
  diretor_comentario      TEXT,

  -- decisão da diretoria geral
  diretoria_decisao_por   UUID REFERENCES profiles(id),
  diretoria_decisao_em    TIMESTAMPTZ,
  diretoria_decisao       TEXT CHECK (diretoria_decisao IN ('aprovado', 'aprovado_com_ressalvas', 'rejeitado')),
  diretoria_comentario    TEXT,

  -- FKs pro item materializado quando aprovado final
  created_event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
  created_project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN planejamento_propostas.payload_original IS
  'Snapshot imutável do que o líder enviou. Nunca alterado. Usado pra diff na devolutiva.';
COMMENT ON COLUMN planejamento_propostas.payload_atual IS
  'Estado atual da proposta. Pode ser editado por diretor de setor ou diretoria geral.';

CREATE INDEX IF NOT EXISTS idx_propostas_ciclo ON planejamento_propostas(ciclo_id);
CREATE INDEX IF NOT EXISTS idx_propostas_status ON planejamento_propostas(status);
CREATE INDEX IF NOT EXISTS idx_propostas_setor_status ON planejamento_propostas(setor_id, status);
CREATE INDEX IF NOT EXISTS idx_propostas_proposto_por ON planejamento_propostas(proposto_por);

-- ─── 5. Audit log de edições no payload ────────────────────────────────
-- Cada alteração de campo durante o trâmite cria uma linha. Usado pra
-- devolutiva diff campo-a-campo pro líder.

CREATE TABLE IF NOT EXISTS planejamento_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id   UUID NOT NULL REFERENCES planejamento_propostas(id) ON DELETE CASCADE,
  quem          UUID NOT NULL REFERENCES profiles(id),
  quando        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  etapa         TEXT NOT NULL CHECK (etapa IN ('diretor', 'diretoria')),
  campo         TEXT NOT NULL,
  valor_antes   JSONB,
  valor_depois  JSONB,
  comentario    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_proposta ON planejamento_audit(proposta_id, quando DESC);

-- ─── 6. Colunas novas em events/projects (audit de origem) ─────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS proposta_id UUID REFERENCES planejamento_propostas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criacao_origem TEXT NOT NULL DEFAULT 'legado'
    CHECK (criacao_origem IN ('legado', 'ciclo_planejamento', 'criacao_direta_admin', 'liturgico'));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS proposta_id UUID REFERENCES planejamento_propostas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criacao_origem TEXT NOT NULL DEFAULT 'legado'
    CHECK (criacao_origem IN ('legado', 'ciclo_planejamento', 'criacao_direta_admin', 'liturgico'));

COMMENT ON COLUMN events.criacao_origem IS
  'Rastreabilidade: legado (pré-sistema), ciclo_planejamento (via ciclo aprovado), criacao_direta_admin (mid-year), liturgico (gerado por template fixo).';
COMMENT ON COLUMN projects.criacao_origem IS
  'Mesma semântica de events.criacao_origem.';

-- ─── 7. Trigger pra updated_at ─────────────────────────────────────────
-- Reusa função set_updated_at já existente no schema.

DROP TRIGGER IF EXISTS planejamento_setores_updated_at ON planejamento_setores;
CREATE TRIGGER planejamento_setores_updated_at BEFORE UPDATE ON planejamento_setores
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS planejamento_ciclos_updated_at ON planejamento_ciclos;
CREATE TRIGGER planejamento_ciclos_updated_at BEFORE UPDATE ON planejamento_ciclos
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS planejamento_propostas_updated_at ON planejamento_propostas;
CREATE TRIGGER planejamento_propostas_updated_at BEFORE UPDATE ON planejamento_propostas
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ─── 8. RLS — autenticados podem ler/escrever ──────────────────────────
-- Autorização granular fica no backend (req.user.role + setor + diretoria).
-- RLS aqui só bloqueia anon.

ALTER TABLE planejamento_setores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE planejamento_areas_setor  ENABLE ROW LEVEL SECURITY;
ALTER TABLE planejamento_ciclos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE planejamento_propostas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE planejamento_audit        ENABLE ROW LEVEL SECURITY;

CREATE POLICY planejamento_setores_auth ON planejamento_setores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY planejamento_areas_setor_auth ON planejamento_areas_setor FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY planejamento_ciclos_auth ON planejamento_ciclos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY planejamento_propostas_auth ON planejamento_propostas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY planejamento_audit_auth ON planejamento_audit FOR ALL TO authenticated USING (true) WITH CHECK (true);

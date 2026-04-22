-- Módulo de Integração — funil visitante → membro ativo
-- Seguro para rodar em produção (IF NOT EXISTS / idempotente)

-- ── int_visitantes — visitantes cadastrados via ficha de acolhimento ─────────
CREATE TABLE IF NOT EXISTS int_visitantes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  telefone       text,
  email          text,
  idade          int,
  data_visita    date NOT NULL DEFAULT current_date,
  culto_id       uuid REFERENCES vol_services(id) ON DELETE SET NULL,
  origem         text CHECK (origem IN ('amigo','redes_sociais','site','evento','busca','outro')),
  veio_acompanhado boolean DEFAULT false,
  fez_decisao    boolean DEFAULT false,
  tipo_decisao   text CHECK (tipo_decisao IS NULL OR tipo_decisao IN ('presencial','online')),
  responsavel_id uuid REFERENCES vol_profiles(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo','primeiro_contato','acompanhamento','discipulado','batizado','membro_ativo','inativo','mudou_cidade')),
  membresia_id   uuid REFERENCES mem_membros(id) ON DELETE SET NULL,
  observacoes    text,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS int_visitantes_status_idx ON int_visitantes(status);
CREATE INDEX IF NOT EXISTS int_visitantes_data_idx ON int_visitantes(data_visita DESC);
CREATE INDEX IF NOT EXISTS int_visitantes_responsavel_idx ON int_visitantes(responsavel_id);
CREATE INDEX IF NOT EXISTS int_visitantes_culto_idx ON int_visitantes(culto_id);

-- ── int_acompanhamentos — registros de contato 1:1 ──────────────────────────
CREATE TABLE IF NOT EXISTS int_acompanhamentos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitante_id        uuid NOT NULL REFERENCES int_visitantes(id) ON DELETE CASCADE,
  voluntario_id       uuid REFERENCES vol_profiles(id) ON DELETE SET NULL,
  data_contato        timestamptz NOT NULL DEFAULT now(),
  tipo                text NOT NULL
                        CHECK (tipo IN ('whatsapp','ligacao','visita','cafe','culto','presencial','outro')),
  resultado           text CHECK (resultado IS NULL OR resultado IN ('sucesso','sem_resposta','reagendou','recusou')),
  observacoes         text,
  proximo_passo       text,
  data_proximo_contato date,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS int_acompanhamentos_visitante_idx ON int_acompanhamentos(visitante_id);
CREATE INDEX IF NOT EXISTS int_acompanhamentos_data_idx ON int_acompanhamentos(data_contato DESC);
CREATE INDEX IF NOT EXISTS int_acompanhamentos_proximo_idx ON int_acompanhamentos(data_proximo_contato)
  WHERE data_proximo_contato IS NOT NULL;

-- ── RLS: policies permissivas (backend usa service_role, bypass RLS) ────────
ALTER TABLE int_visitantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE int_acompanhamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "int_visitantes_auth_read" ON int_visitantes;
CREATE POLICY "int_visitantes_auth_read" ON int_visitantes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "int_acompanhamentos_auth_read" ON int_acompanhamentos;
CREATE POLICY "int_acompanhamentos_auth_read" ON int_acompanhamentos
  FOR SELECT TO authenticated USING (true);

-- Trigger para manter updated_at em int_visitantes
CREATE OR REPLACE FUNCTION int_visitantes_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS int_visitantes_updated_at ON int_visitantes;
CREATE TRIGGER int_visitantes_updated_at
  BEFORE UPDATE ON int_visitantes
  FOR EACH ROW EXECUTE FUNCTION int_visitantes_set_updated_at();

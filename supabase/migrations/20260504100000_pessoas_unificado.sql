-- ============================================================================
-- Pessoas unificadas: mem_membros e fonte unica
--
-- Pedido do Marcos (2026-05-04): "todas as outras listas devem ser filtros
-- de uma lista principal de Membresia. Ao se inscrever em qualquer area,
-- altera Membresia. Áreas especificas sao consultas filtradas."
--
-- Esta migration prepara o banco:
--  1. int_visitantes ganha cpf (faltava)
--  2. vol_profiles ganha membresia_id (FK pra mem_membros)
--  3. next_inscricoes ja tem membro_id, mas cria FK explicita
--  4. Backfill: liga registros existentes a mem_membros via cpf/email
--
-- Uma vez aplicada esta migration, o backend pode fazer:
--    POST /api/pessoas/lookup?cpf=xxx -> retorna mem_membros (se existir)
--    +  papeis ativos (voluntario, visitante, inscrito_next).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. int_visitantes ganha cpf
-- ----------------------------------------------------------------------------
ALTER TABLE int_visitantes
  ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE INDEX IF NOT EXISTS int_visitantes_cpf_idx ON int_visitantes(cpf) WHERE cpf IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. vol_profiles ganha vinculo com mem_membros
-- ----------------------------------------------------------------------------
ALTER TABLE vol_profiles
  ADD COLUMN IF NOT EXISTS membresia_id UUID REFERENCES mem_membros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vol_profiles_membresia_idx ON vol_profiles(membresia_id) WHERE membresia_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. next_inscricoes: FK explicita pra mem_membros (estava sem constraint)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='next_inscricoes' AND constraint_type='FOREIGN KEY' AND constraint_name='next_inscricoes_membro_fkey'
  ) THEN
    ALTER TABLE next_inscricoes
      ADD CONSTRAINT next_inscricoes_membro_fkey
      FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS next_inscricoes_membro_idx ON next_inscricoes(membro_id) WHERE membro_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Backfill: linkar registros existentes a mem_membros
-- ----------------------------------------------------------------------------

-- next_inscricoes -> mem_membros (via cpf, depois email)
UPDATE next_inscricoes ni
SET membro_id = mm.id, updated_at = now()
FROM mem_membros mm
WHERE ni.membro_id IS NULL
  AND ni.cpf IS NOT NULL
  AND mm.cpf IS NOT NULL
  AND regexp_replace(ni.cpf, '\D', '', 'g') = regexp_replace(mm.cpf, '\D', '', 'g');

UPDATE next_inscricoes ni
SET membro_id = mm.id, updated_at = now()
FROM mem_membros mm
WHERE ni.membro_id IS NULL
  AND ni.email IS NOT NULL
  AND mm.email IS NOT NULL
  AND lower(trim(ni.email)) = lower(trim(mm.email));

-- vol_profiles -> mem_membros (via email; vol_profiles nao tem cpf)
UPDATE vol_profiles vp
SET membresia_id = mm.id, updated_at = now()
FROM mem_membros mm
WHERE vp.membresia_id IS NULL
  AND vp.email IS NOT NULL
  AND mm.email IS NOT NULL
  AND lower(trim(vp.email)) = lower(trim(mm.email));

-- ----------------------------------------------------------------------------
-- 5. View consolidada: vw_pessoas_papeis
-- Retorna pessoa (mem_membros) + flags de cada papel ativo
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS vw_pessoas_papeis;

CREATE VIEW vw_pessoas_papeis AS
SELECT
  m.id AS membresia_id,
  m.nome,
  m.email,
  m.telefone,
  m.cpf,
  m.status,
  m.foto_url,
  m.familia_id,
  m.active,
  -- papel: voluntario
  EXISTS (SELECT 1 FROM vol_profiles vp WHERE vp.membresia_id = m.id) AS is_voluntario,
  (SELECT id FROM vol_profiles vp WHERE vp.membresia_id = m.id LIMIT 1) AS vol_profile_id,
  -- papel: visitante (tem entrada em int_visitantes)
  EXISTS (SELECT 1 FROM int_visitantes iv WHERE iv.membresia_id = m.id) AS is_visitante,
  (SELECT id FROM int_visitantes iv WHERE iv.membresia_id = m.id ORDER BY data_visita DESC LIMIT 1) AS visitante_id,
  -- papel: inscrito em algum NEXT
  EXISTS (SELECT 1 FROM next_inscricoes ni WHERE ni.membro_id = m.id) AS is_inscrito_next,
  (SELECT count(*) FROM next_inscricoes ni WHERE ni.membro_id = m.id) AS total_inscricoes_next,
  -- papel: em grupo ativo
  EXISTS (SELECT 1 FROM mem_grupo_membros gm WHERE gm.membro_id = m.id AND gm.saiu_em IS NULL) AS in_grupo_ativo,
  -- papel: contribuinte (ultimo 90d)
  EXISTS (SELECT 1 FROM mem_contribuicoes mc WHERE mc.membro_id = m.id AND mc.data >= (CURRENT_DATE - INTERVAL '90 days')) AS is_contribuinte
FROM mem_membros m
WHERE m.active = true;

-- ----------------------------------------------------------------------------
-- 6. Validacoes
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM mem_membros WHERE active=true;
-- SELECT count(*) FROM vol_profiles WHERE membresia_id IS NOT NULL;
-- SELECT count(*) FROM vol_profiles WHERE membresia_id IS NULL; -- voluntarios sem mem_membros (precisam ser linkados manual)
-- SELECT count(*) FROM next_inscricoes WHERE membro_id IS NOT NULL;
-- SELECT count(*) FROM int_visitantes WHERE cpf IS NOT NULL;

COMMIT;

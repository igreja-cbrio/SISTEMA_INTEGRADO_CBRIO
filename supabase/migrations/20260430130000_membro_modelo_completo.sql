-- ============================================================================
-- Membro Modelo - Fechamento dos 4 gaps do fluxo de jornada
--
-- Implementa:
--   Gap 1: int_visitantes.fez_decisao=true -> cria mem_membros (se necessario)
--          e mem_trilha_valores etapa='conversao' (auto)
--   Gap 2: batismo_inscricoes.status='realizado' -> cria mem_trilha_valores
--          etapa='batismo' (auto) + atualiza status do visitante e do membro
--   Gap 3: tabela mem_devocionais para alimentar KID-04 (Familias com devocionais)
--   Gap 4 (parcial): atualiza fonte_auto de AMI-01/02/05/06 (split AMI vs Bridge),
--                    KID-04 (devocionais.familias), CBA-01 (batismos/conversoes),
--                    CBA-04 (contato em 5 dias)
--
-- Codigo correlato:
--   - backend/services/kpiAutoCollector.js: novos coletores cultos.ami_*,
--     cultos.bridge_*, devocionais.familias, cba.batismos_conversoes,
--     cba.contato_5dias. Coletor de cuidados.membros_2mais_valores agora
--     inclui etapa='batismo' como valor "Seguir Jesus".
--
-- Fluxo demo do membro modelo apos esta migration:
--   1. Visitante chega, registra-se em int_visitantes
--   2. Marca fez_decisao=true (UI de Acolhimento)
--      -> trigger cria mem_membros + trilha 'conversao'
--      -> KPI INTG-01, CBA-01 sobem automaticamente
--      -> Jornada dashboard mostra +1 em "Seguir Jesus"
--   3. Inscreve no batismo (batismo_inscricoes)
--   4. Realiza batismo (status='realizado')
--      -> trigger cria trilha 'batismo' + status mem_membros='membro_ativo'
--      -> Jornada continua reconhecendo "Seguir Jesus"
--   5. Membro entra em grupo / serve / contribui / faz devocional
--      -> Jornada calcula valores ao vivo, KPIs auto-coletam
--   6. Quando atinge 2+ valores -> aparece no dashboard "Membro Modelo"
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. mem_devocionais (Gap 3) — tabela para tracking de devocionais
-- ============================================================================

CREATE TABLE IF NOT EXISTS mem_devocionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES mem_membros(id) ON DELETE CASCADE,
  data_devocional date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL DEFAULT 'pessoal'
    CHECK (tipo IN ('pessoal','familiar','grupo')),
  topico text,
  observacoes text,
  concluida boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mem_devocionais_membro ON mem_devocionais(membro_id);
CREATE INDEX IF NOT EXISTS idx_mem_devocionais_data ON mem_devocionais(data_devocional DESC);
CREATE INDEX IF NOT EXISTS idx_mem_devocionais_tipo ON mem_devocionais(tipo);

-- Mesmo membro nao registra 2 devocionais do mesmo tipo no mesmo dia
CREATE UNIQUE INDEX IF NOT EXISTS uq_mem_devocionais_dia
  ON mem_devocionais(membro_id, data_devocional, tipo);

ALTER TABLE mem_devocionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_devocionais" ON mem_devocionais;
CREATE POLICY "auth_read_devocionais" ON mem_devocionais
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_write_devocionais" ON mem_devocionais;
CREATE POLICY "auth_write_devocionais" ON mem_devocionais
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_devocionais" ON mem_devocionais;
CREATE POLICY "auth_update_devocionais" ON mem_devocionais
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_delete_devocionais" ON mem_devocionais;
CREATE POLICY "auth_delete_devocionais" ON mem_devocionais
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- 2. Gap 1 — Trigger: visitante.fez_decisao=true -> mem_membros + trilha
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_visitante_decisao_to_trilha()
RETURNS TRIGGER AS $$
DECLARE
  v_membro_id uuid;
BEGIN
  -- Dispara quando fez_decisao muda para true (ou ja vem true em INSERT)
  IF NEW.fez_decisao = true
     AND (TG_OP = 'INSERT' OR OLD.fez_decisao IS DISTINCT FROM NEW.fez_decisao)
  THEN
    -- Se ja tem membresia vinculada, usa
    IF NEW.membresia_id IS NOT NULL THEN
      v_membro_id := NEW.membresia_id;
    ELSE
      -- Cria mem_membros automatico (status visitante)
      INSERT INTO mem_membros (nome, email, telefone, status, active)
      VALUES (
        NEW.nome,
        NULLIF(TRIM(COALESCE(NEW.email,'')), ''),
        NULLIF(TRIM(COALESCE(NEW.telefone,'')), ''),
        'visitante',
        true
      )
      RETURNING id INTO v_membro_id;

      NEW.membresia_id := v_membro_id;
    END IF;

    -- Cria trilha 'conversao' (idempotente)
    INSERT INTO mem_trilha_valores (membro_id, etapa, concluida, data_conclusao, observacoes)
    SELECT v_membro_id, 'conversao', true,
           COALESCE(NEW.data_visita, CURRENT_DATE),
           'Auto: visitante ' || NEW.id::text || ' fez decisao'
    WHERE NOT EXISTS (
      SELECT 1 FROM mem_trilha_valores
      WHERE membro_id = v_membro_id AND etapa = 'conversao'
    );

    -- Avanca status do visitante se ainda 'novo'
    IF NEW.status = 'novo' THEN
      NEW.status := 'primeiro_contato';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_visitante_decisao ON int_visitantes;
CREATE TRIGGER trg_visitante_decisao
  BEFORE INSERT OR UPDATE ON int_visitantes
  FOR EACH ROW
  EXECUTE FUNCTION fn_visitante_decisao_to_trilha();

-- ============================================================================
-- 3. Gap 2 — Trigger: batismo realizado -> trilha 'batismo' + status updates
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_batismo_realizado_to_trilha()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'realizado'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.membro_id IS NOT NULL
  THEN
    -- Cria trilha 'batismo' (idempotente)
    INSERT INTO mem_trilha_valores (membro_id, etapa, concluida, data_conclusao, observacoes)
    SELECT NEW.membro_id, 'batismo', true,
           COALESCE(NEW.data_batismo, CURRENT_DATE),
           'Auto: batismo realizado ' || NEW.id::text
    WHERE NOT EXISTS (
      SELECT 1 FROM mem_trilha_valores
      WHERE membro_id = NEW.membro_id AND etapa = 'batismo'
    );

    -- Avanca status do visitante linkado
    UPDATE int_visitantes SET status = 'batizado'
    WHERE membresia_id = NEW.membro_id
      AND status NOT IN ('batizado','membro_ativo');

    -- Promove a 'membro_ativo' (batismo = oficializa membresia)
    UPDATE mem_membros SET status = 'membro_ativo'
    WHERE id = NEW.membro_id AND status IN ('visitante', 'novo');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_batismo_realizado ON batismo_inscricoes;
CREATE TRIGGER trg_batismo_realizado
  AFTER INSERT OR UPDATE OF status ON batismo_inscricoes
  FOR EACH ROW
  EXECUTE FUNCTION fn_batismo_realizado_to_trilha();

-- ============================================================================
-- 4. Atualizar fonte_auto para os coletores novos
-- ============================================================================

-- AMI: separar AMI de Bridge (planilha trata como KPIs distintos)
UPDATE kpi_indicadores_taticos
  SET fonte_auto = 'cultos.ami_freq', updated_at = now()
  WHERE id = 'AMI-01';

UPDATE kpi_indicadores_taticos
  SET fonte_auto = 'cultos.ami_conv', updated_at = now()
  WHERE id = 'AMI-02';

UPDATE kpi_indicadores_taticos
  SET fonte_auto = 'cultos.bridge_freq', updated_at = now()
  WHERE id = 'AMI-05';

UPDATE kpi_indicadores_taticos
  SET fonte_auto = 'cultos.bridge_conv', updated_at = now()
  WHERE id = 'AMI-06';

-- KID-04: famílias com devocionais
UPDATE kpi_indicadores_taticos
  SET fonte_auto = 'devocionais.familias', updated_at = now()
  WHERE id = 'KID-04';

-- CBA-01: % batismos/conversoes
UPDATE kpi_indicadores_taticos
  SET fonte_auto = 'cba.batismos_conversoes', updated_at = now()
  WHERE id = 'CBA-01';

-- CBA-04: % contato em <=5 dias
UPDATE kpi_indicadores_taticos
  SET fonte_auto = 'cba.contato_5dias', updated_at = now()
  WHERE id = 'CBA-04';

-- CBA-02/03/05/06 ficam manuais (sem fonte de dados confiavel ainda)
-- - CBA-02: questionario de interessados iniciais (sem schema)
-- - CBA-03: % conversao Next nao batizados (proximo a NEXT-01 mas escopo CBA)
-- - CBA-05: questionario pos-batismo (sem schema)
-- - CBA-06: NPS batismo (sem pesquisa cadastrada)

-- ============================================================================
-- 5. Validacoes
-- ============================================================================
-- SELECT id, fonte_auto FROM kpi_indicadores_taticos
-- WHERE id IN ('AMI-01','AMI-02','AMI-05','AMI-06','KID-04','CBA-01','CBA-04')
-- ORDER BY id;
--
-- Esperado:
--   AMI-01 | cultos.ami_freq
--   AMI-02 | cultos.ami_conv
--   AMI-05 | cultos.bridge_freq
--   AMI-06 | cultos.bridge_conv
--   CBA-01 | cba.batismos_conversoes
--   CBA-04 | cba.contato_5dias
--   KID-04 | devocionais.familias
--
-- Teste manual do trigger Gap 1:
--   INSERT INTO int_visitantes (nome, fez_decisao) VALUES ('Teste Decisao', true);
--   SELECT * FROM mem_trilha_valores WHERE etapa='conversao' ORDER BY created_at DESC LIMIT 1;
--   -- deve mostrar a trilha criada
--   SELECT membresia_id FROM int_visitantes WHERE nome='Teste Decisao';
--   -- deve estar preenchido
--
-- Teste manual do trigger Gap 2:
--   INSERT INTO batismo_inscricoes (nome, sobrenome, status, membro_id, data_batismo)
--     VALUES ('Teste','Batismo','realizado', '<membro_id existente>', CURRENT_DATE);
--   SELECT * FROM mem_trilha_valores WHERE etapa='batismo' ORDER BY created_at DESC LIMIT 1;

COMMIT;

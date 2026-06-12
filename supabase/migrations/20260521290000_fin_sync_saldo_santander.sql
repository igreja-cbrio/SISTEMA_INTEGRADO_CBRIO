-- Sincroniza saldo Santander · santander_saldo_snapshot → fin_contas
-- Quando snapshot diario eh atualizado, atualiza fin_contas.saldo
-- da conta Santander correspondente. Permite que o Dashboard
-- financeiro mostre saldo real consolidado de todos os bancos.
-- Idempotente.

-- ============================================================
-- 1. Garante que existe conta Santander cadastrada em fin_contas
-- ============================================================
-- Cria a conta se nao existir · usa env-like fixos (3957 / 130004222)
INSERT INTO fin_contas (nome, banco, agencia, conta, tipo, saldo, ativa)
SELECT
  'Santander Ag 3957 C/C 13000422-2',
  'Santander',
  '3957',
  '130004222',
  'corrente',
  0,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM fin_contas
  WHERE banco ILIKE '%santander%'
     OR conta = '130004222'
);

-- ============================================================
-- 2. Funcao trigger · atualiza fin_contas.saldo a partir do snapshot
-- ============================================================
CREATE OR REPLACE FUNCTION fin_sync_saldo_santander()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo_total numeric(18, 2);
BEGIN
  -- Saldo total = available + blocked + invested (mesmo que negativo)
  v_saldo_total := COALESCE(NEW.available_amount, 0)
                 + COALESCE(NEW.blocked_amount, 0)
                 + COALESCE(NEW.invested_amount, 0);

  -- Atualiza a conta Santander (busca por banco ou conta)
  UPDATE fin_contas
     SET saldo = v_saldo_total
   WHERE banco ILIKE '%santander%'
      OR conta ILIKE '%130004222%';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fin_sync_saldo_santander ON santander_saldo_snapshot;
CREATE TRIGGER tg_fin_sync_saldo_santander
  AFTER INSERT OR UPDATE ON santander_saldo_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION fin_sync_saldo_santander();

-- ============================================================
-- 3. Backfill imediato · sincroniza com snapshot mais recente
-- ============================================================
-- Pega o snapshot mais recente e dispara o update agora
DO $$
DECLARE
  v_snap RECORD;
  v_saldo numeric(18, 2);
BEGIN
  SELECT * INTO v_snap
  FROM santander_saldo_snapshot
  ORDER BY capturado_em DESC
  LIMIT 1;

  IF v_snap.id IS NOT NULL THEN
    v_saldo := COALESCE(v_snap.available_amount, 0)
             + COALESCE(v_snap.blocked_amount, 0)
             + COALESCE(v_snap.invested_amount, 0);

    UPDATE fin_contas
       SET saldo = v_saldo
     WHERE banco ILIKE '%santander%'
        OR conta ILIKE '%130004222%';
  END IF;
END$$;

COMMIT;

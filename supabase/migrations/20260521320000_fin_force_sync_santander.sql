-- Fix · força sync do saldo Santander pra fin_contas
-- A migration 20260521290000 criou o trigger mas o backfill nao funcionou
-- em casos onde nao havia snapshot ainda. Esta migration roda novamente
-- o backfill com mais robustez.
-- Idempotente.

-- ============================================================
-- 1. Garante conta Santander existe (idempotente)
-- ============================================================
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
-- 2. Update direto · sem depender de trigger
-- ============================================================
-- Pega snapshot mais recente E atualiza fin_contas
-- Funciona mesmo se trigger nao foi criado na migration anterior
UPDATE fin_contas
SET saldo = COALESCE((
  SELECT COALESCE(available_amount, 0)
       + COALESCE(blocked_amount, 0)
       + COALESCE(invested_amount, 0)
  FROM santander_saldo_snapshot
  ORDER BY capturado_em DESC
  LIMIT 1
), 0)
WHERE banco ILIKE '%santander%';

-- ============================================================
-- 3. Funcao publica · pode ser chamada via RPC do backend
-- ============================================================
CREATE OR REPLACE FUNCTION fin_force_sync_saldo_bancos()
RETURNS TABLE (banco text, saldo_anterior numeric, saldo_novo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old numeric;
  v_new numeric;
BEGIN
  -- Santander
  SELECT saldo INTO v_old FROM fin_contas WHERE banco ILIKE '%santander%' LIMIT 1;
  v_new := COALESCE((
    SELECT COALESCE(available_amount, 0)
         + COALESCE(blocked_amount, 0)
         + COALESCE(invested_amount, 0)
    FROM santander_saldo_snapshot
    ORDER BY capturado_em DESC LIMIT 1
  ), 0);

  UPDATE fin_contas SET saldo = v_new WHERE banco ILIKE '%santander%';

  banco := 'santander';
  saldo_anterior := COALESCE(v_old, 0);
  saldo_novo := v_new;
  RETURN NEXT;

  -- Aqui podem entrar outros bancos no futuro (Itau, Bradesco, etc)
END;
$$;

-- ============================================================
-- 4. Garante trigger esta ativo (re-cria se nao existe)
-- ============================================================
CREATE OR REPLACE FUNCTION fin_sync_saldo_santander()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo_total numeric(18, 2);
BEGIN
  v_saldo_total := COALESCE(NEW.available_amount, 0)
                 + COALESCE(NEW.blocked_amount, 0)
                 + COALESCE(NEW.invested_amount, 0);

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

COMMIT;

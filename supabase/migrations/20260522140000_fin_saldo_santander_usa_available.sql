-- FIX · saldo no fin_contas deve refletir APENAS o available_amount
-- (saldo disponivel real). A soma com invested_amount estava errada
-- porque o Santander retorna automaticallyInvestedAmount com valores
-- exoticos (negativos), inflando o saldo na direcao errada.
-- Caso real 2026-05-22:
--   available_amount = -7980.18 (saldo real · confirmado pelo titular)
--   invested_amount  = -15400.01 (anomalia da API · campo nao confiavel)
--   resultado bugado = -23380.19 (mostrado no dashboard)
-- Pos-fix: dashboard mostra -7980.18 (saldo real).

CREATE OR REPLACE FUNCTION fin_sync_saldo_santander()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Saldo do dashboard reflete o saldo disponivel (available_amount)
  -- · NAO somar invested_amount (campo nao-confiavel em 2026-05-22)
  UPDATE fin_contas
     SET saldo = COALESCE(NEW.available_amount, 0)
   WHERE banco ILIKE '%santander%'
      OR conta ILIKE '%130004222%';

  RETURN NEW;
END;
$$;

-- Backfill imediato com snapshot mais recente
DO $$
DECLARE
  v_snap RECORD;
BEGIN
  SELECT * INTO v_snap
  FROM santander_saldo_snapshot
  ORDER BY capturado_em DESC
  LIMIT 1;

  IF v_snap.id IS NOT NULL THEN
    UPDATE fin_contas
       SET saldo = COALESCE(v_snap.available_amount, 0)
     WHERE banco ILIKE '%santander%'
        OR conta ILIKE '%130004222%';
  END IF;
END$$;

COMMIT;

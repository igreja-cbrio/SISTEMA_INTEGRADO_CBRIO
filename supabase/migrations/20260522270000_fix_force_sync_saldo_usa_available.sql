-- FIX · fin_force_sync_saldo_bancos somava available+blocked+invested
-- Mesmo bug do trigger (corrigido em 20260522140000) · esta funcao tambem
-- usava soma errada. Agora usa apenas available_amount (saldo real).
-- Caso visto 2026-05-22 · botao 'Sincronizar saldos' levava saldo a -R$ 20.391,30
-- quando o real era -R$ 7.854,71 (somava -7854 + -12536 invested).

CREATE OR REPLACE FUNCTION public.fin_force_sync_saldo_bancos()
RETURNS TABLE(banco text, saldo_anterior numeric, saldo_novo numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_old numeric;
  v_new numeric;
BEGIN
  SELECT fc.saldo INTO v_old
    FROM fin_contas fc WHERE fc.banco ILIKE '%santander%' LIMIT 1;
  v_new := COALESCE((
    SELECT COALESCE(s.available_amount, 0)
    FROM santander_saldo_snapshot s
    ORDER BY s.capturado_em DESC LIMIT 1
  ), 0);
  UPDATE fin_contas fc SET saldo = v_new WHERE fc.banco ILIKE '%santander%';
  banco := 'santander';
  saldo_anterior := COALESCE(v_old, 0);
  saldo_novo := v_new;
  RETURN NEXT;
END;
$$;

COMMIT;

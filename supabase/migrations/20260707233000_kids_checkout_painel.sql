-- Kids · check-out SIMPLES (pedido do Matheus · 2026-07-07):
-- 1) Painel ao vivo faz check-out com um botão só (sem escolher qual
--    responsável retirou).
-- 2) No check-in do totem, criança com check-in aberto de um CULTO ANTERIOR
--    (check-out esquecido) pode ser regularizada na hora.
-- Ambos gravam checkout_metodo = 'painel' (sem snapshot de responsável) —
-- a CHECK atual não aceita esse valor, então ela é recriada com ele.
DO $$
DECLARE v_name text;
BEGIN
  SELECT con.conname INTO v_name
    FROM pg_constraint con
   WHERE con.conrelid = 'public.kids_checkins'::regclass
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%checkout_metodo%'
   LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.kids_checkins DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'kids_checkins: CHECK % recriada com o valor painel', v_name;
  END IF;
END $$;

ALTER TABLE public.kids_checkins ADD CONSTRAINT kids_checkins_checkout_metodo_check
  CHECK (checkout_metodo IN (
    'codigo_digitado', 'barcode_escaneado', 'responsavel_autorizado',
    'override_supervisor', 'checkout_forcado', 'painel'
  ));

COMMENT ON CONSTRAINT kids_checkins_checkout_metodo_check ON public.kids_checkins IS
  'painel = check-out simples pela equipe (painel ao vivo / regularização de culto anterior), sem snapshot de responsável.';

-- Permite registrar uploads do Balanço (planilha do sistema financeiro legado)
-- na tabela fin_uploads, alimentando o histórico de importações do /financeiro-v2.
-- Aditivo e backward-compatible: apenas amplia o CHECK de `tipo` com 'balanco'.
-- Idempotente.

DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.fin_uploads'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%tipo%ofx%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.fin_uploads DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.fin_uploads
  ADD CONSTRAINT fin_uploads_tipo_check
  CHECK (tipo IN ('ofx', 'pix_csv', 'pix_xlsx', 'cartao_csv', 'balanco'));

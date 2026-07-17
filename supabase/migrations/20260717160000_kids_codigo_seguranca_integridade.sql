-- Impede que dois totens atribuam o mesmo código ativo a famílias diferentes.
-- Linhas do mesmo checkin_grupo_id podem compartilhar o código de propósito
-- (irmãos e/ou múltiplos cultos).

CREATE INDEX IF NOT EXISTS idx_kids_checkins_codigo_ativo
  ON public.kids_checkins (codigo_seguranca)
  WHERE checkout_at IS NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.fn_kids_validar_codigo_seguranca_ativo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_grupo_novo uuid;
BEGIN
  IF NEW.checkout_at IS NOT NULL OR NEW.deleted_at IS NOT NULL OR NEW.codigo_seguranca IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serializa somente concorrentes do mesmo código, sem bloquear check-ins normais.
  PERFORM pg_advisory_xact_lock(hashtextextended('kids-checkin:' || NEW.codigo_seguranca, 0));
  v_grupo_novo := COALESCE(NEW.checkin_grupo_id, NEW.id);

  IF EXISTS (
    SELECT 1
      FROM public.kids_checkins k
     WHERE k.codigo_seguranca = NEW.codigo_seguranca
       AND k.checkout_at IS NULL
       AND k.deleted_at IS NULL
       AND k.id IS DISTINCT FROM NEW.id
       AND COALESCE(k.checkin_grupo_id, k.id) IS DISTINCT FROM v_grupo_novo
  ) THEN
    RAISE EXCEPTION 'Colisão de código de segurança ativo; gere outro código'
      USING ERRCODE = '23505', CONSTRAINT = 'kids_codigo_seguranca_ativo_grupo';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_kids_validar_codigo_seguranca_ativo ON public.kids_checkins;
CREATE TRIGGER trg_kids_validar_codigo_seguranca_ativo
BEFORE INSERT OR UPDATE OF codigo_seguranca, checkout_at, deleted_at, checkin_grupo_id
ON public.kids_checkins
FOR EACH ROW EXECUTE FUNCTION public.fn_kids_validar_codigo_seguranca_ativo();

-- O gerador também ignora linhas apagadas; o trigger acima é a garantia contra
-- a corrida entre a consulta do gerador e o INSERT.
CREATE OR REPLACE FUNCTION public.fn_kids_gerar_codigo_seguranca()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codigo text;
  tentativa integer := 0;
BEGIN
  LOOP
    tentativa := tentativa + 1;
    codigo := '';
    FOR i IN 1..4 LOOP
      codigo := codigo || substr(chars, 1 + floor(random() * length(chars))::integer, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.kids_checkins
       WHERE codigo_seguranca = codigo
         AND checkout_at IS NULL
         AND deleted_at IS NULL
    );

    IF tentativa >= 100 THEN
      RAISE EXCEPTION 'Não foi possível gerar código de segurança livre';
    END IF;
  END LOOP;
  RETURN codigo;
END;
$$;


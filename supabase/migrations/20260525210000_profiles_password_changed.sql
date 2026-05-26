-- Flag de "ja trocou a senha padrao"
-- Usada pra mostrar popup de "trocar senha" no primeiro login de email/password

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- Helper · marca a senha do user logado como trocada
-- Chamado pelo frontend depois de Supabase auth.updateUser({password})
CREATE OR REPLACE FUNCTION public.app_marcar_senha_trocada()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no auth.uid'; END IF;
  UPDATE public.profiles
     SET password_changed_at = now()
   WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_marcar_senha_trocada() TO authenticated;

COMMIT;

-- =====================================================================
-- Fix · audit_log_changes() falha em tabelas com PK composta
-- =====================================================================
-- A funcao original em 20260521230000_onda3_audit_log_pii.sql usa
-- `COALESCE(NEW.id::text, NEW::text)` · que falha em compile-time pra
-- tabelas sem coluna `id` (ex: cargo_modulo_permissao, com PK composta
-- (cargo_id, modulo_id)).
--
-- Erro reproduzido em 2026-05-25 ao tentar INSERT em
-- cargo_modulo_permissao via SQL Editor:
--   ERROR: record "new" has no field "id"
--   CONTEXT: PL/pgSQL function audit_log_changes() line 16
--
-- Correcao · usar `to_jsonb(NEW)->>'id'` que retorna NULL no runtime se
-- a coluna nao existe, em vez de erro de compilacao. Pra tabelas com PK
-- composta cai no fallback NEW::text (que serializa a tupla inteira).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_row_id TEXT;
  v_changes JSONB;
  v_col TEXT;
  v_old JSONB;
  v_new JSONB;
  v_audited_cols TEXT[];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id LIMIT 1;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row_id := COALESCE(to_jsonb(OLD)->>'id', OLD::text);
    v_old := to_jsonb(OLD);
    v_changes := v_old;
  ELSIF TG_OP = 'INSERT' THEN
    v_row_id := COALESCE(to_jsonb(NEW)->>'id', NEW::text);
    v_new := to_jsonb(NEW);
    v_changes := v_new;
  ELSE -- UPDATE
    v_row_id := COALESCE(to_jsonb(NEW)->>'id', NEW::text);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    IF TG_NARGS >= 1 AND TG_ARGV[0] IS NOT NULL AND TG_ARGV[0] != '' THEN
      v_audited_cols := string_to_array(TG_ARGV[0], ',');
    END IF;

    v_changes := '{}'::jsonb;
    FOR v_col IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_col IN ('updated_at','created_at') THEN CONTINUE; END IF;
      IF v_audited_cols IS NOT NULL AND NOT (v_col = ANY(v_audited_cols)) THEN
        CONTINUE;
      END IF;
      IF v_new->v_col IS DISTINCT FROM v_old->v_col THEN
        v_changes := v_changes || jsonb_build_object(v_col,
          jsonb_build_object('old', v_old->v_col, 'new', v_new->v_col));
      END IF;
    END LOOP;

    IF v_changes = '{}'::jsonb THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  INSERT INTO public.app_audit_log (table_name, row_id, action, user_id, user_email, changes)
  VALUES (TG_TABLE_NAME, v_row_id, TG_OP, v_user_id, v_user_email, v_changes);

  RETURN COALESCE(NEW, OLD);
END
$$;

COMMENT ON FUNCTION public.audit_log_changes() IS
  'Trigger generica de audit log. TG_ARGV[0] opcional · CSV de colunas a auditar (default · todas exceto updated_at/created_at). Usa to_jsonb(NEW)->>id em vez de NEW.id::text pra suportar tabelas com PK composta sem coluna id (ex · cargo_modulo_permissao).';

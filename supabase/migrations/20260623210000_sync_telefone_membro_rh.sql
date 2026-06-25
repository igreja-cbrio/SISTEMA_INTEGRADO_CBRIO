-- ============================================================================
-- Telefone do colaborador · app/membresia → cadastro de RH (rh_funcionarios)
-- ============================================================================
-- Pedido do Matheus: quando o colaborador adiciona o celular (no app, que grava
-- mem_membros.telefone), o número deve aparecer no cadastro dele em /admin/rh.
-- rh_funcionarios não tem FK pra pessoa → casa por CPF (11 díg) ou e-mail (lower).
-- Só PREENCHE quando o telefone do RH está vazio (não sobrescreve o que o RH
-- cadastrou à mão). Trigger cobre todos os caminhos de escrita + backfill inicial.

CREATE OR REPLACE FUNCTION public.fn_sync_telefone_rh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tel_digits text := regexp_replace(coalesce(NEW.telefone, ''), '\D', '', 'g');
  cpf_digits text := regexp_replace(coalesce(NEW.cpf, ''), '\D', '', 'g');
BEGIN
  IF length(tel_digits) < 10 THEN
    RETURN NEW;
  END IF;
  UPDATE public.rh_funcionarios r
     SET telefone = NEW.telefone, updated_at = now()
   WHERE r.deleted_at IS NULL
     AND (r.telefone IS NULL OR btrim(r.telefone) = '')
     AND (
       (length(cpf_digits) = 11 AND regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g') = cpf_digits)
       OR (NEW.email IS NOT NULL AND r.email IS NOT NULL AND lower(btrim(r.email)) = lower(btrim(NEW.email)))
     );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_telefone_rh ON public.mem_membros;
CREATE TRIGGER trg_sync_telefone_rh
AFTER INSERT OR UPDATE OF telefone ON public.mem_membros
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_telefone_rh();

-- Backfill: colaboradores sem telefone no RH que já têm telefone no app/membresia.
UPDATE public.rh_funcionarios r
   SET telefone = m.telefone, updated_at = now()
  FROM public.mem_membros m
 WHERE r.deleted_at IS NULL
   AND (r.telefone IS NULL OR btrim(r.telefone) = '')
   AND m.deleted_at IS NULL
   AND m.telefone IS NOT NULL
   AND length(regexp_replace(m.telefone, '\D', '', 'g')) >= 10
   AND (
     (length(regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g')) = 11
        AND regexp_replace(coalesce(r.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g'))
     OR (r.email IS NOT NULL AND m.email IS NOT NULL AND lower(btrim(r.email)) = lower(btrim(m.email)))
   );

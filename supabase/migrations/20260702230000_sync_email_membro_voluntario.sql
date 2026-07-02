-- ============================================================================
-- Sincronização de e-mail · mem_membros (canônico) ⇄ vol_profiles (provisório)
--
-- Regra (Matheus · 2026-07-02): o e-mail que a pessoa cadastra ela mesma
-- (cadastro de membresia/app/totem/edição admin → mem_membros.email) é
-- CANÔNICO e substitui o provisório importado do Planning Center em
-- vol_profiles.email. Enquanto só existir o do PCO, ele vale — e aparece
-- também na ficha da membresia. Objetivo: nunca ter um voluntário com dois
-- e-mails divergentes entre os módulos.
--
-- Padrão do template 20260623210000_sync_telefone_membro_rh.sql
-- (função SECURITY DEFINER + trigger + backfill idempotente).
-- Só age em vínculos membresia_id JÁ existentes — não cria vínculo novo
-- (não mexe nas regras de dedup/merge da membresia).
-- ============================================================================

-- ── Trigger A · canônico desce (mem_membros → vol_profiles) ─────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_email_membro_para_vol()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NULLIF(trim(COALESCE(NEW.email, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.vol_profiles
     SET email = lower(trim(NEW.email))
   WHERE membresia_id = NEW.id
     AND email IS DISTINCT FROM lower(trim(NEW.email));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_email_membro_para_vol ON public.mem_membros;
CREATE TRIGGER trg_sync_email_membro_para_vol
  AFTER INSERT OR UPDATE OF email ON public.mem_membros
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fn_sync_email_membro_para_vol();

-- ── Trigger B · guardião da precedência + provisório sobe ───────────────────
-- Em vol_profiles (email ou vínculo mudou):
--   1. membro TEM e-mail e difere → restaura o canônico no vol (protege contra
--      o sync horário do PCO regravar o provisório e cobre o momento do vínculo)
--   2. membro SEM e-mail e vol tem → preenche mem_membros (nunca sobrescreve)
CREATE OR REPLACE FUNCTION public.fn_sync_email_vol_para_membro()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email_membro TEXT;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(lower(trim(COALESCE(email, ''))), '') INTO v_email_membro
    FROM public.mem_membros
   WHERE id = NEW.membresia_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_email_membro IS NOT NULL THEN
    -- canônico vence
    IF NEW.email IS DISTINCT FROM v_email_membro THEN
      UPDATE public.vol_profiles SET email = v_email_membro WHERE id = NEW.id;
    END IF;
  ELSIF NULLIF(trim(COALESCE(NEW.email, '')), '') IS NOT NULL THEN
    -- provisório sobe (só preenche vazio)
    UPDATE public.mem_membros
       SET email = lower(trim(NEW.email))
     WHERE id = NEW.membresia_id
       AND (email IS NULL OR trim(email) = '')
       AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_email_vol_para_membro ON public.vol_profiles;
CREATE TRIGGER trg_sync_email_vol_para_membro
  AFTER INSERT OR UPDATE OF email, membresia_id ON public.vol_profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fn_sync_email_vol_para_membro();

-- ── Backfill one-time (idempotente) ─────────────────────────────────────────
-- 1. Divergências atuais: o e-mail do membro (canônico) vence.
UPDATE public.vol_profiles v
   SET email = lower(trim(m.email))
  FROM public.mem_membros m
 WHERE m.id = v.membresia_id
   AND m.deleted_at IS NULL
   AND NULLIF(trim(COALESCE(m.email, '')), '') IS NOT NULL
   AND v.email IS DISTINCT FROM lower(trim(m.email));

-- 2. Propagação do provisório: membro vinculado sem e-mail recebe o do vol
--    (perfil mais recente quando houver mais de um).
UPDATE public.mem_membros m
   SET email = sub.email
  FROM (
    SELECT DISTINCT ON (membresia_id) membresia_id, lower(trim(email)) AS email
      FROM public.vol_profiles
     WHERE membresia_id IS NOT NULL
       AND NULLIF(trim(COALESCE(email, '')), '') IS NOT NULL
       AND arquivado = false
     ORDER BY membresia_id, updated_at DESC
  ) sub
 WHERE sub.membresia_id = m.id
   AND (m.email IS NULL OR trim(m.email) = '')
   AND m.deleted_at IS NULL;

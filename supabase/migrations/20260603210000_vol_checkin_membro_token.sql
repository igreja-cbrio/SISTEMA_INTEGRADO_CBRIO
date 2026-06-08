-- =====================================================================
-- Check-in de voluntário aceita o QR unificado do cartão de membro (2026-06-03)
-- =====================================================================
-- O app de membros passou a exibir UM único QR por pessoa = mem_qrcodes.token.
-- O leitor de check-in de voluntário (POST /api/voluntariado/qr-lookup) deve
-- aceitar esse token além do vol_profiles.qr_code, SEM quebrar o fluxo atual.
--
-- Esta função resolve o token → cpf → membro e diz se a pessoa é VOLUNTÁRIA
-- ATIVA (via vol_profiles OU mem_voluntarios). Não-voluntário → is_voluntario
-- false (o backend recusa com 403). ADITIVA · idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_vol_resolver_membro_token(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH q AS (SELECT cpf FROM public.mem_qrcodes WHERE token = p_token LIMIT 1),
  dig AS (SELECT regexp_replace(COALESCE((SELECT cpf FROM q),''),'\D','','g') AS cpf_dig),
  membro AS (
    SELECT m.id, m.nome
      FROM public.mem_membros m, dig
     WHERE dig.cpf_dig <> '' AND m.deleted_at IS NULL
       AND regexp_replace(COALESCE(m.cpf,''),'\D','','g') = dig.cpf_dig
     ORDER BY m.created_at LIMIT 1
  ),
  prof AS (
    SELECT p.id, p.planning_center_id, p.full_name
      FROM public.vol_profiles p, dig
     WHERE ((SELECT id FROM membro) IS NOT NULL AND p.membresia_id = (SELECT id FROM membro))
        OR (dig.cpf_dig <> '' AND regexp_replace(COALESCE(p.cpf,''),'\D','','g') = dig.cpf_dig)
     LIMIT 1
  )
  SELECT CASE WHEN (SELECT cpf FROM q) IS NULL THEN NULL ELSE jsonb_build_object(
    'cpf', (SELECT cpf_dig FROM dig),
    'membro_id', (SELECT id FROM membro),
    'nome', COALESCE((SELECT full_name FROM prof), (SELECT nome FROM membro)),
    'vol_profile_id', (SELECT id FROM prof),
    'planning_center_id', (SELECT planning_center_id FROM prof),
    'is_voluntario', (
      (SELECT id FROM prof) IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.mem_voluntarios mv
                 WHERE mv.membro_id = (SELECT id FROM membro) AND mv.deleted_at IS NULL AND mv.ate IS NULL)
    )
  ) END;
$$;

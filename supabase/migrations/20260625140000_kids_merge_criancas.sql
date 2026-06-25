-- Kids · fundir crianças duplicadas (2026-06-25)
-- Migra TODOS os vínculos das crianças duplicadas pra a criança mantida
-- (responsáveis, check-ins, chamadas, atendimentos, decisões, solicitações),
-- enriquece o keep com campos que faltam e faz soft-delete das fundidas.
-- SECURITY DEFINER · chamado pelo backend (service role) após a equipe escolher.
CREATE OR REPLACE FUNCTION public.merge_kids_criancas(p_keep uuid, p_merge uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_keep IS NULL OR p_merge IS NULL OR array_length(p_merge, 1) IS NULL THEN
    RAISE EXCEPTION 'keep e merge obrigatórios';
  END IF;
  IF p_keep = ANY(p_merge) THEN
    RAISE EXCEPTION 'a criança mantida não pode estar na lista de fundidas';
  END IF;

  -- Responsáveis: evita violar o unique (crianca_id, membro_id) — remove os que
  -- já existem no keep, migra o resto.
  DELETE FROM kids_responsaveis r
   WHERE r.crianca_id = ANY(p_merge)
     AND EXISTS (SELECT 1 FROM kids_responsaveis k WHERE k.crianca_id = p_keep AND k.membro_id = r.membro_id);
  UPDATE kids_responsaveis SET crianca_id = p_keep WHERE crianca_id = ANY(p_merge);

  -- Demais filhas
  UPDATE kids_checkins        SET crianca_id = p_keep       WHERE crianca_id = ANY(p_merge);
  UPDATE kids_chamadas        SET crianca_id = p_keep       WHERE crianca_id = ANY(p_merge);
  UPDATE kids_atendimentos    SET crianca_id = p_keep       WHERE crianca_id = ANY(p_merge);
  UPDATE cultos_decisoes_pessoas SET kids_crianca_id = p_keep WHERE kids_crianca_id = ANY(p_merge);
  UPDATE kids_vinculo_solicitacoes SET crianca_id = p_keep        WHERE crianca_id = ANY(p_merge);
  UPDATE kids_vinculo_solicitacoes SET crianca_criada_id = p_keep WHERE crianca_criada_id = ANY(p_merge);

  -- Enriquece o keep com campos que faltam (pega da 1ª fundida que tiver valor)
  UPDATE kids_criancas k SET
    data_nascimento        = COALESCE(k.data_nascimento, m.data_nascimento),
    sexo                   = COALESCE(k.sexo, m.sexo),
    serie                  = COALESCE(k.serie, m.serie),
    foto_url               = COALESCE(k.foto_url, m.foto_url),
    foto_storage_path      = COALESCE(k.foto_storage_path, m.foto_storage_path),
    observacoes_medicas    = COALESCE(k.observacoes_medicas, m.observacoes_medicas),
    necessidades_especiais = COALESCE(k.necessidades_especiais, m.necessidades_especiais),
    planning_center_id     = COALESCE(k.planning_center_id, m.planning_center_id),
    data_conversao         = COALESCE(k.data_conversao, m.data_conversao),
    data_batismo           = COALESCE(k.data_batismo, m.data_batismo)
  FROM (
    SELECT
      max(data_nascimento) AS data_nascimento, max(sexo) AS sexo, max(serie) AS serie,
      max(foto_url) AS foto_url, max(foto_storage_path) AS foto_storage_path,
      max(observacoes_medicas) AS observacoes_medicas, max(necessidades_especiais) AS necessidades_especiais,
      max(planning_center_id) AS planning_center_id, max(data_conversao) AS data_conversao, max(data_batismo) AS data_batismo
    FROM kids_criancas WHERE id = ANY(p_merge)
  ) m
  WHERE k.id = p_keep;

  -- Soft-delete das fundidas
  UPDATE kids_criancas
     SET deleted_at = now(), ativo = false,
         motivo_inativacao = 'Fundida na criança ' || p_keep::text
   WHERE id = ANY(p_merge);
END;
$$;

COMMENT ON FUNCTION public.merge_kids_criancas(uuid, uuid[]) IS 'Funde crianças duplicadas: migra vínculos pra a mantida e soft-delete das outras.';

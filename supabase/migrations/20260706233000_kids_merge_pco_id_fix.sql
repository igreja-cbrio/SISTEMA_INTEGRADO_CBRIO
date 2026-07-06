-- Kids · fix da fusão de crianças (2026-07-06)
-- Sintoma: "duplicate key value violates unique constraint idx_kids_criancas_pco_id"
-- ao fundir duplicadas. Causa: o merge herdava o planning_center_id de uma fundida
-- pro keep (COALESCE), mas as fundidas ficam só soft-deleted MANTENDO o pco_id — e
-- o índice único cobria TODAS as linhas (não excluía as deletadas) → colisão.
--
-- Correção dupla:
--  1) Índice único vira PARCIAL (só linhas vivas · deleted_at IS NULL) — semântica
--     correta do soft-delete e destrava a fusão. Mantém a idempotência do sync (o
--     roster PCO só tem crianças vivas).
--  2) A função limpa o pco_id das fundidas ANTES de o keep herdar (rede de
--     segurança, mesmo com o índice parcial · evita que a linha soft-deletada
--     "prenda" o pco do keep num futuro hard-delete/restauração).

-- 1) Índice único parcial ------------------------------------------------------
DROP INDEX IF EXISTS public.idx_kids_criancas_pco_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_kids_criancas_pco_id
  ON public.kids_criancas (planning_center_id)
  WHERE deleted_at IS NULL;

-- 2) Função de fusão · herda o pco com segurança -------------------------------
CREATE OR REPLACE FUNCTION public.merge_kids_criancas(p_keep uuid, p_merge uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pco text;
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

  -- Captura o pco a herdar (se houver) e LIMPA das fundidas antes de repassar,
  -- pra nunca colidir com o keep no índice único.
  SELECT max(planning_center_id) INTO v_pco
    FROM kids_criancas WHERE id = ANY(p_merge) AND planning_center_id IS NOT NULL;
  UPDATE kids_criancas SET planning_center_id = NULL WHERE id = ANY(p_merge);

  -- Enriquece o keep com campos que faltam (pega da 1ª fundida que tiver valor).
  -- planning_center_id fica de fora aqui (tratado logo abaixo com o valor capturado).
  UPDATE kids_criancas k SET
    data_nascimento        = COALESCE(k.data_nascimento, m.data_nascimento),
    sexo                   = COALESCE(k.sexo, m.sexo),
    serie                  = COALESCE(k.serie, m.serie),
    foto_url               = COALESCE(k.foto_url, m.foto_url),
    foto_storage_path      = COALESCE(k.foto_storage_path, m.foto_storage_path),
    observacoes_medicas    = COALESCE(k.observacoes_medicas, m.observacoes_medicas),
    necessidades_especiais = COALESCE(k.necessidades_especiais, m.necessidades_especiais),
    data_conversao         = COALESCE(k.data_conversao, m.data_conversao),
    data_batismo           = COALESCE(k.data_batismo, m.data_batismo)
  FROM (
    SELECT
      max(data_nascimento) AS data_nascimento, max(sexo) AS sexo, max(serie) AS serie,
      max(foto_url) AS foto_url, max(foto_storage_path) AS foto_storage_path,
      max(observacoes_medicas) AS observacoes_medicas, max(necessidades_especiais) AS necessidades_especiais,
      max(data_conversao) AS data_conversao, max(data_batismo) AS data_batismo
    FROM kids_criancas WHERE id = ANY(p_merge)
  ) m
  WHERE k.id = p_keep;

  -- Herda o pco só se o keep estiver sem (as fundidas já foram limpas acima).
  UPDATE kids_criancas
     SET planning_center_id = v_pco
   WHERE id = p_keep AND planning_center_id IS NULL AND v_pco IS NOT NULL;

  -- Soft-delete das fundidas
  UPDATE kids_criancas
     SET deleted_at = now(), ativo = false,
         motivo_inativacao = 'Fundida na criança ' || p_keep::text
   WHERE id = ANY(p_merge);
END;
$$;

COMMENT ON FUNCTION public.merge_kids_criancas(uuid, uuid[]) IS 'Funde crianças duplicadas: migra vínculos pra a mantida, herda o pco_id com segurança e soft-delete das outras.';

-- Respostas e convites da avaliação 360: transações restritas ao backend.
-- Sem alterações de tabelas ou ampliação de acesso a anon/authenticated.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_aval360_formulario(p_convite_id uuid, p_avaliador_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_convite rh_aval360_convite%ROWTYPE;
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_avaliado rh_funcionarios%ROWTYPE;
  v_competencias jsonb;
BEGIN
  SELECT * INTO v_convite FROM rh_aval360_convite
    WHERE id = p_convite_id AND avaliador_id = p_avaliador_id
      AND deleted_at IS NULL AND suprimido_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite indisponível para este colaborador.' USING ERRCODE = 'P0403'; END IF;
  IF v_convite.papel = 'par' AND v_convite.aprovado_em IS NULL THEN
    RAISE EXCEPTION 'A indicação de par ainda não foi aprovada.' USING ERRCODE = 'P0409';
  END IF;
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = v_convite.ciclo_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_ciclo.status <> 'coleta' OR
    v_ciclo.coleta_ate < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'A janela de respostas deste ciclo não está aberta.' USING ERRCODE = 'P0409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rh_funcionarios WHERE id = p_avaliador_id AND status = 'ativo' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Colaborador indisponível.' USING ERRCODE = 'P0403';
  END IF;
  IF v_convite.papel IN ('par', 'liderado') AND (SELECT count(DISTINCT c.avaliador_id)
    FROM rh_aval360_convite c JOIN rh_funcionarios f ON f.id = c.avaliador_id
    WHERE c.ciclo_id = v_ciclo.id AND c.avaliado_id = v_convite.avaliado_id AND c.papel = v_convite.papel
      AND c.deleted_at IS NULL AND c.suprimido_em IS NULL AND f.deleted_at IS NULL AND f.status = 'ativo'
      AND (c.papel <> 'par' OR c.aprovado_em IS NOT NULL)) < v_ciclo.piso_respondentes THEN
    RAISE EXCEPTION 'Este papel não atingiu o piso de participantes para coleta.' USING ERRCODE = 'P0409';
  END IF;
  SELECT * INTO v_avaliado FROM rh_funcionarios WHERE id = v_convite.avaliado_id AND status = 'ativo' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliado indisponível.' USING ERRCODE = 'P0409'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', cp.id, 'codigo', cp.codigo,
    'nome', cp.nome, 'descricao', cp.descricao, 'aplica_a', cp.aplica_a, 'eixo', cp.eixo)
    ORDER BY cc.ordem, cp.id), '[]'::jsonb) INTO v_competencias
  FROM rh_aval360_ciclo_competencia cc JOIN rh_aval360_competencia cp ON cp.id = cc.competencia_id
  WHERE cc.ciclo_id = v_ciclo.id AND cc.deleted_at IS NULL AND cp.deleted_at IS NULL AND cp.ativo
    AND (cp.aplica_a = 'todos'
      OR (cp.aplica_a = 'area' AND cp.area = v_avaliado.area)
      OR (cp.aplica_a = 'gestores' AND EXISTS (SELECT 1 FROM rh_funcionarios f
        WHERE f.gestor_id = v_avaliado.id AND f.id <> v_avaliado.id AND f.status = 'ativo' AND f.deleted_at IS NULL)));
  RETURN jsonb_build_object('convite', jsonb_build_object('id', v_convite.id,
    'papel', v_convite.papel, 'avaliado_id', v_convite.avaliado_id, 'ciclo_id', v_convite.ciclo_id,
    'respondido_em', v_convite.respondido_em,
    'ciclo', jsonb_build_object('id', v_ciclo.id, 'nome', v_ciclo.nome, 'status', v_ciclo.status, 'escala_max', v_ciclo.escala_max),
    'avaliado', jsonb_build_object('id', v_avaliado.id, 'nome', v_avaliado.nome, 'cargo', v_avaliado.cargo, 'area', v_avaliado.area)),
    'competencias', v_competencias, 'escala_max', v_ciclo.escala_max);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_aval360_responder(p_convite_id uuid, p_avaliador_id uuid, p_notas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ciclo_id uuid;
  v_convite rh_aval360_convite%ROWTYPE;
  v_form jsonb;
  v_nota jsonb;
  v_resposta uuid;
  v_esperadas text[];
  v_recebidas text[];
BEGIN
  -- Todos os escritores desta API bloqueiam ciclo antes de convite.
  SELECT ciclo_id INTO v_ciclo_id FROM rh_aval360_convite
    WHERE id = p_convite_id AND avaliador_id = p_avaliador_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite indisponível para este colaborador.' USING ERRCODE = 'P0403'; END IF;
  PERFORM 1 FROM rh_aval360_ciclo WHERE id = v_ciclo_id FOR UPDATE;
  SELECT * INTO v_convite FROM rh_aval360_convite WHERE id = p_convite_id FOR UPDATE;
  v_form := fn_aval360_formulario(p_convite_id, p_avaliador_id);
  IF v_convite.respondido_em IS NOT NULL OR EXISTS (SELECT 1 FROM rh_aval360_resposta WHERE convite_id = p_convite_id) THEN
    RAISE EXCEPTION 'Esta avaliação já possui uma resposta. Se houve falha anterior, solicite revisão ao RH.' USING ERRCODE = 'P0409';
  END IF;
  IF p_notas IS NULL OR jsonb_typeof(p_notas) <> 'array' THEN
    RAISE EXCEPTION 'Envie a lista de notas.' USING ERRCODE = 'P0400';
  END IF;
  IF jsonb_array_length(p_notas) = 0 OR jsonb_array_length(p_notas) > 500 THEN
    RAISE EXCEPTION 'Quantidade de notas inválida.' USING ERRCODE = 'P0400';
  END IF;
  SELECT array_agg(c->>'id' ORDER BY c->>'id') INTO v_esperadas FROM jsonb_array_elements(v_form->'competencias') c;
  SELECT array_agg(n->>'competencia_id' ORDER BY n->>'competencia_id') INTO v_recebidas FROM jsonb_array_elements(p_notas) n;
  IF v_esperadas IS NULL OR v_recebidas IS DISTINCT FROM v_esperadas THEN
    RAISE EXCEPTION 'Responda exatamente as competências deste formulário, sem repetições.' USING ERRCODE = 'P0400';
  END IF;
  FOR v_nota IN SELECT value FROM jsonb_array_elements(p_notas) LOOP
    IF jsonb_typeof(v_nota->'nota') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Nota inválida.' USING ERRCODE = 'P0400';
    END IF;
    IF (v_nota->>'nota')::numeric <> trunc((v_nota->>'nota')::numeric)
      OR (v_nota->>'nota')::numeric < 1 OR (v_nota->>'nota')::numeric > (v_form->>'escala_max')::int THEN
      RAISE EXCEPTION 'Nota fora da escala do ciclo.' USING ERRCODE = 'P0400';
    END IF;
    IF v_nota ? 'comentario' AND v_nota->'comentario' <> 'null'::jsonb AND
      (jsonb_typeof(v_nota->'comentario') <> 'string' OR length(v_nota->>'comentario') > 5000) THEN
      RAISE EXCEPTION 'O comentário deve ser um texto de até 5.000 caracteres.' USING ERRCODE = 'P0400';
    END IF;
  END LOOP;
  INSERT INTO rh_aval360_resposta(ciclo_id, avaliado_id, papel, convite_id)
    VALUES (v_convite.ciclo_id, v_convite.avaliado_id, v_convite.papel, v_convite.id) RETURNING id INTO v_resposta;
  INSERT INTO rh_aval360_nota(resposta_id, competencia_id, nota, comentario)
    SELECT v_resposta, (n->>'competencia_id')::uuid, (n->>'nota')::numeric::int, NULLIF(btrim(n->>'comentario'), '')
    FROM jsonb_array_elements(p_notas) n;
  UPDATE rh_aval360_convite SET respondido_em = now() WHERE id = p_convite_id;
  RETURN jsonb_build_object('ok', true, 'respostas', jsonb_array_length(p_notas));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_aval360_gerar_convites(p_ciclo_id uuid, p_linhas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ciclo rh_aval360_ciclo%ROWTYPE;
  v_esperadas jsonb;
  v_enviadas jsonb;
  v_gravados int;
BEGIN
  SELECT * INTO v_ciclo FROM rh_aval360_ciclo WHERE id = p_ciclo_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_ciclo.status NOT IN ('rascunho', 'indicacao') THEN
    RAISE EXCEPTION 'O ciclo não está aberto para gerar convites.' USING ERRCODE = 'P0409';
  END IF;
  -- Recalcula os elegíveis no banco: o retrato lido pela API pode ter mudado.
  WITH ativos AS (SELECT id, gestor_id FROM rh_funcionarios WHERE status = 'ativo' AND deleted_at IS NULL),
  desejados AS (
    SELECT id AS avaliado_id, id AS avaliador_id, 'auto'::text AS papel FROM ativos
    UNION ALL
    SELECT f.id, g.id, 'gestor' FROM ativos f JOIN ativos g ON g.id = f.gestor_id AND g.id <> f.id
    UNION ALL
    SELECT g.id, f.id, 'liderado' FROM ativos g JOIN ativos f ON f.gestor_id = g.id AND f.id <> g.id
      WHERE (SELECT count(*) FROM ativos l WHERE l.gestor_id = g.id AND l.id <> g.id) >= v_ciclo.piso_respondentes
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('avaliado_id', avaliado_id, 'avaliador_id', avaliador_id, 'papel', papel)
      ORDER BY avaliado_id, avaliador_id, papel), '[]'::jsonb) INTO v_esperadas FROM desejados;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'Lista de convites inválida.' USING ERRCODE = 'P0400';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('avaliado_id', n->>'avaliado_id', 'avaliador_id', n->>'avaliador_id', 'papel', n->>'papel')
    ORDER BY n->>'avaliado_id', n->>'avaliador_id', n->>'papel'), '[]'::jsonb) INTO v_enviadas FROM jsonb_array_elements(p_linhas) n;
  IF v_enviadas <> v_esperadas THEN
    RAISE EXCEPTION 'A equipe mudou. Atualize o retrato antes de gerar os convites.' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM rh_aval360_convite c WHERE c.ciclo_id = p_ciclo_id AND c.origem = 'automatico'
    AND c.papel IN ('auto', 'gestor', 'liderado') AND c.deleted_at IS NULL AND c.suprimido_em IS NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_esperadas) n WHERE n->>'avaliado_id' = c.avaliado_id::text
      AND n->>'avaliador_id' = c.avaliador_id::text AND n->>'papel' = c.papel)) THEN
    RAISE EXCEPTION 'Há convites antigos incompatíveis com a equipe atual. O RH precisa revisá-los antes de continuar.' USING ERRCODE = 'P0409';
  END IF;
  IF EXISTS (SELECT 1 FROM rh_aval360_convite c JOIN jsonb_array_elements(v_esperadas) n
    ON n->>'avaliado_id' = c.avaliado_id::text AND n->>'avaliador_id' = c.avaliador_id::text AND n->>'papel' = c.papel
    WHERE c.ciclo_id = p_ciclo_id AND (c.deleted_at IS NOT NULL OR c.suprimido_em IS NOT NULL)) THEN
    RAISE EXCEPTION 'Há convites excluídos ou suprimidos. O RH precisa revisá-los antes de continuar.' USING ERRCODE = 'P0409';
  END IF;
  INSERT INTO rh_aval360_convite(ciclo_id, avaliado_id, avaliador_id, papel, origem)
    SELECT p_ciclo_id, (n->>'avaliado_id')::uuid, (n->>'avaliador_id')::uuid, n->>'papel', 'automatico'
    FROM jsonb_array_elements(v_esperadas) n
    ON CONFLICT (ciclo_id, avaliado_id, avaliador_id, papel) DO NOTHING;
  GET DIAGNOSTICS v_gravados = ROW_COUNT;
  RETURN jsonb_build_object('gravados', v_gravados, 'existentes', jsonb_array_length(v_esperadas) - v_gravados);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_aval360_formulario(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_responder(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_aval360_gerar_convites(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aval360_formulario(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_responder(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_aval360_gerar_convites(uuid, jsonb) TO service_role;
COMMIT;

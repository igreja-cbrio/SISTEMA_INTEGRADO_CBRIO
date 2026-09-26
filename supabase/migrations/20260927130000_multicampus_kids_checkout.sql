-- Checkout e devolução do pager formam uma única operação do campus do ato.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_campus_kids_checkout(
  p_igreja_id uuid,p_checkin_id uuid,p_usuario_id uuid,p_metodo text,
  p_codigo text DEFAULT NULL,p_responsavel_id uuid DEFAULT NULL,p_responsavel_nome text DEFAULT NULL,
  p_override_motivo text DEFAULT NULL,p_override_autorizado boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_alvo public.kids_checkins%ROWTYPE; v_grupo uuid; v_crianca uuid; v_resp uuid; v_nome text; v_total integer; v_resultado jsonb; v_pais jsonb;
BEGIN
  IF p_igreja_id IS NULL OR p_checkin_id IS NULL OR p_usuario_id IS NULL OR p_metodo IS NULL
    OR p_metodo NOT IN ('codigo_digitado','barcode_escaneado','responsavel_autorizado','override_supervisor','painel') THEN
    RAISE EXCEPTION 'Dados de retirada inválidos.' USING ERRCODE='P0400'; END IF;
  SELECT * INTO v_alvo FROM public.kids_checkins WHERE id=p_checkin_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Check-in não encontrado neste campus.' USING ERRCODE='P0404'; END IF;
  v_grupo:=v_alvo.checkin_grupo_id; v_crianca:=v_alvo.crianca_id;
  -- Mesma ordem dos produtores: culto → sessão → sala → check-in.
  SELECT jsonb_agg(jsonb_build_array(k.id,k.sessao_id,k.sala_id,s.culto_id) ORDER BY k.id) INTO v_pais
    FROM public.kids_checkins k LEFT JOIN public.kids_sessoes s ON s.id=k.sessao_id
    WHERE k.id=p_checkin_id OR (v_grupo IS NOT NULL AND k.checkin_grupo_id=v_grupo);
  PERFORM id FROM public.cultos WHERE id IN (SELECT (p->>3)::uuid FROM jsonb_array_elements(v_pais) p) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.kids_sessoes WHERE id IN (SELECT (p->>1)::uuid FROM jsonb_array_elements(v_pais) p) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.kids_salas WHERE id IN (SELECT (p->>2)::uuid FROM jsonb_array_elements(v_pais) p) ORDER BY id FOR UPDATE;
  -- Trava o grupo inteiro em ordem estável; um grupo não pode atravessar campus/criança.
  PERFORM id FROM public.kids_checkins WHERE (id=p_checkin_id OR (v_grupo IS NOT NULL AND checkin_grupo_id=v_grupo)) ORDER BY id FOR UPDATE;
  IF v_pais IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_array(k.id,k.sessao_id,k.sala_id,s.culto_id) ORDER BY k.id)
    FROM public.kids_checkins k LEFT JOIN public.kids_sessoes s ON s.id=k.sessao_id
    WHERE k.id=p_checkin_id OR (v_grupo IS NOT NULL AND k.checkin_grupo_id=v_grupo)) THEN
    RAISE EXCEPTION 'Grupo de check-in alterado. Tente novamente.' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.kids_checkins WHERE checkin_grupo_id=v_grupo AND (igreja_id IS DISTINCT FROM p_igreja_id OR crianca_id IS DISTINCT FROM v_crianca)) THEN
    RAISE EXCEPTION 'Grupo de check-in com origem divergente.' USING ERRCODE='P0403'; END IF;
  SELECT * INTO v_alvo FROM public.kids_checkins WHERE id=p_checkin_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_alvo.checkin_grupo_id IS DISTINCT FROM v_grupo OR v_alvo.checkout_at IS NOT NULL THEN
    RAISE EXCEPTION 'Check-in alterado ou já encerrado.' USING ERRCODE='23514'; END IF;
  IF p_metodo IN ('codigo_digitado','barcode_escaneado') THEN
    IF NULLIF(upper(btrim(p_codigo)),'') IS NULL OR upper(btrim(p_codigo)) IS DISTINCT FROM upper(v_alvo.codigo_seguranca) THEN
      RAISE EXCEPTION 'Código de segurança não confere.' USING ERRCODE='P0403'; END IF;
    v_resp:=v_alvo.responsavel_checkin_id; v_nome:=v_alvo.responsavel_checkin_nome;
  ELSIF p_metodo='responsavel_autorizado' THEN
    SELECT m.id,m.nome INTO v_resp,v_nome FROM public.kids_responsaveis r JOIN public.mem_membros m ON m.id=r.membro_id
      WHERE r.crianca_id=v_alvo.crianca_id AND r.membro_id=p_responsavel_id AND r.autorizado_buscar AND m.deleted_at IS NULL FOR SHARE OF r,m;
    IF NOT FOUND THEN RAISE EXCEPTION 'Responsável não autorizado para esta criança.' USING ERRCODE='P0403'; END IF;
  ELSIF p_metodo='override_supervisor' THEN
    IF p_override_autorizado IS DISTINCT FROM true OR length(btrim(COALESCE(p_override_motivo,'')))<10 OR NULLIF(btrim(p_responsavel_nome),'') IS NULL THEN
      RAISE EXCEPTION 'A retirada excepcional exige supervisor, responsável e justificativa.' USING ERRCODE='P0403'; END IF;
    v_nome:=btrim(p_responsavel_nome);
  END IF;
  UPDATE public.kids_checkins SET checkout_at=now(),responsavel_checkout_id=v_resp,responsavel_checkout_nome=v_nome,
    checkout_metodo=p_metodo,checkout_por=p_usuario_id,
    override_motivo=CASE WHEN p_metodo='override_supervisor' THEN btrim(p_override_motivo) ELSE NULL END,
    override_aprovado_por=CASE WHEN p_metodo='override_supervisor' THEN p_usuario_id ELSE NULL END,
    pager_devolvido_at=CASE WHEN pager_numero IS NOT NULL THEN COALESCE(pager_devolvido_at,now()) ELSE pager_devolvido_at END,
    pager_devolvido_por=CASE WHEN pager_numero IS NOT NULL AND pager_devolvido_at IS NULL THEN p_usuario_id ELSE pager_devolvido_por END
    WHERE igreja_id=p_igreja_id AND crianca_id=v_crianca AND deleted_at IS NULL AND checkout_at IS NULL
      AND (id=p_checkin_id OR (v_grupo IS NOT NULL AND checkin_grupo_id=v_grupo));
  GET DIAGNOSTICS v_total=ROW_COUNT;
  SELECT to_jsonb(k)||jsonb_build_object('crianca',jsonb_build_object('id',c.id,'nome',c.nome),
    'sala',jsonb_build_object('id',s.id,'nome',s.nome),'cultos_encerrados',v_total)
    INTO v_resultado FROM public.kids_checkins k JOIN public.kids_criancas c ON c.id=k.crianca_id
      JOIN public.kids_salas s ON s.id=k.sala_id AND s.igreja_id=p_igreja_id
    WHERE k.id=p_checkin_id AND k.igreja_id=p_igreja_id;
  IF v_resultado IS NULL THEN RAISE EXCEPTION 'Dados do check-in inconsistentes.' USING ERRCODE='23514'; END IF;
  RETURN v_resultado;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_kids_checkout(uuid,uuid,uuid,text,text,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_kids_checkout(uuid,uuid,uuid,text,text,uuid,text,text,boolean) TO service_role;
COMMIT;

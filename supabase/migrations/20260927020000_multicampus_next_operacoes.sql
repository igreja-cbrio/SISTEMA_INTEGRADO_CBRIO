-- Escritas atômicas do piloto Next. Apenas service_role; o backend valida módulo
-- e resolve o campus antes de chamar. Não ativa isolamento nem concede vínculos.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_campus_next_recomputar(p_turma_id uuid,p_igreja_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_total integer;
BEGIN
  PERFORM 1 FROM public.next_turmas WHERE id=p_turma_id AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma não encontrada.' USING ERRCODE='P0404'; END IF;
  SELECT count(*) INTO v_total FROM public.next_encontros WHERE turma_id=p_turma_id AND igreja_id=p_igreja_id;
  UPDATE public.next_matriculas m SET status=CASE
    WHEN v_total>0 AND (SELECT count(*) FROM public.next_presencas p JOIN public.next_encontros e ON e.id=p.encontro_id
      WHERE p.matricula_id=m.id AND p.igreja_id=p_igreja_id AND e.turma_id=p_turma_id AND p.presente) >= v_total THEN 'formado'
    WHEN m.status='incompleto' THEN 'incompleto' ELSE 'matriculado' END, updated_at=now()
  WHERE m.turma_id=p_turma_id AND m.igreja_id=p_igreja_id AND m.deleted_at IS NULL AND m.status<>'desistiu';
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_recomputar(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_recomputar(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_campus_next_criar_turma(
  p_igreja_id uuid,p_nome text,p_responsavel_id uuid,p_observacoes text,p_encontros jsonb,
  p_auto_domingo date DEFAULT NULL,p_puxar_fila boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_turma public.next_turmas%ROWTYPE; v_puxados integer:=0; v_pessoa record;
BEGIN
  PERFORM 1 FROM public.igrejas WHERE id=p_igreja_id AND ativa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campus indisponível.' USING ERRCODE='P0404'; END IF;
  IF NULLIF(btrim(p_nome),'') IS NULL OR p_encontros IS NULL OR jsonb_typeof(p_encontros)<>'array'
    OR jsonb_array_length(p_encontros)<1 OR jsonb_array_length(p_encontros)>6 THEN
    RAISE EXCEPTION 'Informe nome e de um a seis encontros.' USING ERRCODE='P0400';
  END IF;
  IF p_responsavel_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuario_igrejas WHERE usuario_id=p_responsavel_id AND igreja_id=p_igreja_id) THEN
    RAISE EXCEPTION 'Responsável sem vínculo com o campus.' USING ERRCODE='P0403';
  END IF;
  INSERT INTO public.next_turmas(igreja_id,nome,responsavel_id,observacoes,auto_domingo,status)
    VALUES(p_igreja_id,btrim(p_nome),p_responsavel_id,p_observacoes,p_auto_domingo,'aberta')
    ON CONFLICT(igreja_id,auto_domingo) DO NOTHING RETURNING * INTO v_turma;
  IF NOT FOUND THEN
    SELECT * INTO v_turma FROM public.next_turmas WHERE igreja_id=p_igreja_id AND auto_domingo=p_auto_domingo;
    RETURN to_jsonb(v_turma)||jsonb_build_object('ja_existia',true,'puxados_da_espera',0);
  END IF;
  INSERT INTO public.next_encontros(igreja_id,turma_id,numero,data,tema)
    SELECT p_igreja_id,v_turma.id,COALESCE((e.item->>'numero')::integer,e.ord::integer),
      NULLIF(e.item->>'data','')::date,NULLIF(e.item->>'tema','')
    FROM jsonb_array_elements(p_encontros) WITH ORDINALITY e(item,ord);
  IF p_puxar_fila AND NOT EXISTS(SELECT 1 FROM public.next_turmas WHERE igreja_id=p_igreja_id AND deleted_at IS NULL AND status='aberta' AND id<>v_turma.id) THEN
    FOR v_pessoa IN SELECT id FROM public.next_matriculas WHERE igreja_id=p_igreja_id AND turma_id IS NULL AND deleted_at IS NULL FOR UPDATE LOOP
      BEGIN
        UPDATE public.next_matriculas SET turma_id=v_turma.id,status='matriculado',updated_at=now()
          WHERE id=v_pessoa.id AND igreja_id=p_igreja_id AND turma_id IS NULL AND deleted_at IS NULL;
        IF FOUND THEN v_puxados:=v_puxados+1; END IF;
      EXCEPTION WHEN unique_violation THEN NULL; -- mantém conflito na fila para revisão humana
      END;
    END LOOP;
  END IF;
  RETURN to_jsonb(v_turma)||jsonb_build_object('ja_existia',false,'puxados_da_espera',v_puxados);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_criar_turma(uuid,text,uuid,text,jsonb,date,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_criar_turma(uuid,text,uuid,text,jsonb,date,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_campus_soft_delete_next(p_tabela text,p_id uuid,p_igreja_id uuid,p_usuario_id uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_tabela NOT IN ('next_turmas','next_matriculas') OR p_tabela IS NULL OR p_id IS NULL OR p_igreja_id IS NULL OR p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Operação de exclusão inválida.' USING ERRCODE='P0400';
  END IF;
  EXECUTE format('SELECT id FROM public.%I WHERE id=$1 AND igreja_id=$2 AND deleted_at IS NULL FOR UPDATE',p_tabela)
    INTO v_id USING p_id,p_igreja_id;
  IF v_id IS NULL THEN RETURN false; END IF;
  RETURN public.app_soft_delete(p_tabela,p_id::text,p_usuario_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_soft_delete_next(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_soft_delete_next(text,uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_campus_next_presencas(
  p_encontro_id uuid,p_igreja_id uuid,p_matricula_ids uuid[],p_modo text
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_turma uuid; v_validos integer; v_ids uuid[];
BEGIN
  IF p_modo IS NULL OR p_modo NOT IN ('substituir','marcar','desmarcar') OR p_matricula_ids IS NULL OR cardinality(p_matricula_ids)>5000
    OR array_position(p_matricula_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Lista de presenças inválida.' USING ERRCODE='P0400';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT id),'{}'::uuid[]) INTO v_ids FROM unnest(p_matricula_ids) id;
  IF p_modo<>'substituir' AND cardinality(v_ids)<>1 THEN RAISE EXCEPTION 'Informe uma matrícula.' USING ERRCODE='P0400'; END IF;
  SELECT turma_id INTO v_turma FROM public.next_encontros WHERE id=p_encontro_id AND igreja_id=p_igreja_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Encontro não encontrado.' USING ERRCODE='P0404'; END IF;
  PERFORM 1 FROM public.next_turmas WHERE id=v_turma AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma não encontrada.' USING ERRCODE='P0404'; END IF;
  PERFORM 1 FROM public.next_encontros WHERE id=p_encontro_id AND turma_id=v_turma AND igreja_id=p_igreja_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Encontro alterado; tente novamente.' USING ERRCODE='P0404'; END IF;
  PERFORM id FROM public.next_matriculas WHERE id=ANY(v_ids) AND turma_id=v_turma AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
  GET DIAGNOSTICS v_validos = ROW_COUNT;
  IF v_validos<>cardinality(v_ids) THEN RAISE EXCEPTION 'Matrícula fora da turma ou do campus.' USING ERRCODE='P0403'; END IF;
  -- Presença antiga é mantida como false; não apaga o histórico para regravar.
  IF p_modo='substituir' THEN
    UPDATE public.next_presencas SET presente=false WHERE encontro_id=p_encontro_id AND igreja_id=p_igreja_id AND NOT(matricula_id=ANY(v_ids));
  END IF;
  INSERT INTO public.next_presencas(encontro_id,matricula_id,igreja_id,presente)
    SELECT p_encontro_id,id,p_igreja_id,p_modo<>'desmarcar' FROM unnest(v_ids) id
    ON CONFLICT(encontro_id,matricula_id) DO UPDATE SET presente=EXCLUDED.presente;
  IF p_modo<>'substituir' THEN
    UPDATE public.next_matriculas SET check_in_at=CASE WHEN p_modo='marcar' THEN COALESCE(check_in_at,now()) ELSE NULL END,updated_at=now()
      WHERE id=ANY(v_ids) AND igreja_id=p_igreja_id AND turma_id=v_turma AND deleted_at IS NULL;
  END IF;
  PERFORM public.fn_campus_next_recomputar(v_turma,p_igreja_id);
  RETURN jsonb_build_object('ok',true,'presente',p_modo<>'desmarcar');
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_presencas(uuid,uuid,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_presencas(uuid,uuid,uuid[],text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_campus_next_atualizar_turma(p_id uuid,p_igreja_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_turma public.next_turmas%ROWTYPE;
BEGIN
  SELECT * INTO v_turma FROM public.next_turmas WHERE id=p_id AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma não encontrada.' USING ERRCODE='P0404'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Dados inválidos.' USING ERRCODE='P0400'; END IF;
  IF p_patch ? 'status' AND (p_patch->>'status' IS NULL OR p_patch->>'status' NOT IN ('aberta','encerrada','cancelada')) THEN
    RAISE EXCEPTION 'Status inválido.' USING ERRCODE='P0400'; END IF;
  IF p_patch ? 'nome' AND NULLIF(btrim(p_patch->>'nome'),'') IS NULL THEN RAISE EXCEPTION 'Nome obrigatório.' USING ERRCODE='P0400'; END IF;
  IF NULLIF(p_patch->>'responsavel_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.usuario_igrejas WHERE usuario_id=(p_patch->>'responsavel_id')::uuid AND igreja_id=p_igreja_id) THEN
    RAISE EXCEPTION 'Responsável sem vínculo com o campus.' USING ERRCODE='P0403'; END IF;
  UPDATE public.next_turmas SET
    nome=CASE WHEN p_patch ? 'nome' THEN btrim(p_patch->>'nome') ELSE nome END,
    status=CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
    responsavel_id=CASE WHEN p_patch ? 'responsavel_id' THEN NULLIF(p_patch->>'responsavel_id','')::uuid ELSE responsavel_id END,
    observacoes=CASE WHEN p_patch ? 'observacoes' THEN p_patch->>'observacoes' ELSE observacoes END,updated_at=now()
    WHERE id=p_id AND igreja_id=p_igreja_id RETURNING * INTO v_turma;
  IF p_patch->>'status'='encerrada' THEN
    PERFORM public.fn_campus_next_recomputar(p_id,p_igreja_id);
    UPDATE public.next_matriculas SET status='incompleto',updated_at=now() WHERE turma_id=p_id AND igreja_id=p_igreja_id AND deleted_at IS NULL AND status NOT IN ('formado','desistiu');
  ELSIF p_patch->>'status'='aberta' THEN
    UPDATE public.next_matriculas SET status='matriculado',updated_at=now() WHERE turma_id=p_id AND igreja_id=p_igreja_id AND deleted_at IS NULL AND status='incompleto';
    PERFORM public.fn_campus_next_recomputar(p_id,p_igreja_id);
  END IF;
  RETURN to_jsonb(v_turma);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_atualizar_turma(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_atualizar_turma(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_campus_next_transferir(p_id uuid,p_igreja_id uuid,p_destino_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_origem uuid; v_matricula public.next_matriculas%ROWTYPE; v_destino_nome text;
BEGIN
  SELECT turma_id INTO v_origem FROM public.next_matriculas WHERE id=p_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula não encontrada.' USING ERRCODE='P0404'; END IF;
  IF v_origem=p_destino_id THEN RAISE EXCEPTION 'A pessoa já está nessa turma.' USING ERRCODE='P0400'; END IF;
  -- Ordem estável: turmas antes da matrícula, como na escrita de presença.
  PERFORM id FROM public.next_turmas WHERE id IN (v_origem,p_destino_id) AND igreja_id=p_igreja_id ORDER BY id FOR UPDATE;
  SELECT nome INTO v_destino_nome FROM public.next_turmas WHERE id=p_destino_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma de destino não encontrada.' USING ERRCODE='P0404'; END IF;
  SELECT * INTO v_matricula FROM public.next_matriculas WHERE id=p_id AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_matricula.turma_id IS DISTINCT FROM v_origem THEN RAISE EXCEPTION 'Matrícula alterada; tente novamente.' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.next_presencas WHERE matricula_id=p_id) THEN
    RAISE EXCEPTION 'Matrícula com presenças não pode mudar de turma; crie uma nova matrícula para preservar o histórico.' USING ERRCODE='23514'; END IF;
  UPDATE public.next_matriculas SET turma_id=p_destino_id,status='matriculado',check_in_at=null,updated_at=now()
    WHERE id=p_id AND igreja_id=p_igreja_id AND deleted_at IS NULL RETURNING * INTO v_matricula;
  RETURN to_jsonb(v_matricula)||jsonb_build_object('turma_destino_nome',v_destino_nome);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_transferir(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_transferir(uuid,uuid,uuid) TO service_role;
COMMIT;

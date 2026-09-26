-- Administração de batismo: transações locais e exclusão lógica auditável.
BEGIN;
DO $outer$
DECLARE existentes text[];
BEGIN
 SELECT array_agg(DISTINCT t ORDER BY t) INTO existentes
 FROM unnest(public.app_soft_deletable_tables() || ARRAY['batismo_horarios']) AS t;
 EXECUTE format('CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $body$ SELECT %L::text[] $body$',existentes);
END $outer$;

CREATE OR REPLACE FUNCTION public.fn_campus_batismo_excluir_horario(p_igreja_id uuid,p_id uuid,p_ator uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF p_igreja_id IS NULL OR p_id IS NULL OR p_ator IS NULL THEN RAISE EXCEPTION 'Contexto obrigatório.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM batismo_horarios WHERE id=p_id AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Horário não encontrado neste campus.' USING ERRCODE='23514'; END IF;
 -- Não torna órfãs reservas futuras; fechar horário é a operação apropriada.
 IF EXISTS(SELECT 1 FROM batismo_inscricoes WHERE igreja_id=p_igreja_id AND horario_id=p_id AND deleted_at IS NULL
   AND data_batismo >= (now() AT TIME ZONE 'America/Sao_Paulo')::date AND (status IS NULL OR status NOT IN('cancelado','rejeitado'))) THEN
   RAISE EXCEPTION 'Há inscrições neste horário. Feche-o para impedir novas reservas.' USING ERRCODE='23514';
 END IF;
 RETURN public.app_soft_delete('batismo_horarios',p_id::text,p_ator);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_batismo_excluir_horario(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_batismo_excluir_horario(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_campus_batismo_status_lote(p_igreja_id uuid,p_ids uuid[],p_status text)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r batismo_inscricoes%ROWTYPE; ids uuid[]; n integer:=0;
BEGIN
 SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(p_ids) AS id;
 IF p_igreja_id IS NULL OR coalesce(cardinality(ids),0)=0 OR cardinality(ids)>500
   OR array_position(ids,NULL) IS NOT NULL OR p_status IS NULL OR p_status NOT IN('pendente','confirmado','realizado','cancelado') THEN
   RAISE EXCEPTION 'Seleção ou status inválidos.' USING ERRCODE='23514';
 END IF;
 -- Mesma ordem de locks da reserva simples: eventos, horários, inscrições.
 PERFORM 1 FROM batismo_eventos WHERE igreja_id=p_igreja_id AND id IN(SELECT evento_id FROM batismo_inscricoes WHERE id=ANY(ids) AND igreja_id=p_igreja_id) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM batismo_horarios WHERE igreja_id=p_igreja_id AND id IN(SELECT horario_id FROM batismo_inscricoes WHERE id=ANY(ids) AND igreja_id=p_igreja_id) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM batismo_inscricoes WHERE id=ANY(ids) AND igreja_id=p_igreja_id AND deleted_at IS NULL ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM batismo_inscricoes WHERE id=ANY(ids) AND igreja_id=p_igreja_id AND deleted_at IS NULL)<>cardinality(ids) THEN
   RAISE EXCEPTION 'Uma inscrição não está disponível neste campus.' USING ERRCODE='23514';
 END IF;
 FOR r IN SELECT * FROM batismo_inscricoes WHERE id=ANY(ids) AND igreja_id=p_igreja_id ORDER BY id LOOP
   IF r.evento_id IS NOT NULL AND r.horario_id IS NOT NULL THEN
     PERFORM public.fn_campus_batismo_reservar(p_igreja_id,r.evento_id,r.horario_id,r.id,r.membro_id,r.nome,r.sobrenome,
       r.cpf,r.telefone,r.email,r.data_nascimento,p_status,r.origem,r.area_kpi,r.tamanho_camisa,r.eh_crianca,
       r.possui_deficiencia,r.deficiencia_descricao,r.endereco,r.cep,r.sexo,r.fez_next,r.observacoes,true);
   ELSE
     -- Registros históricos não agendados continuam sem reservar vaga.
     UPDATE batismo_inscricoes SET status=p_status,updated_at=now() WHERE id=r.id AND igreja_id=p_igreja_id;
   END IF;
   n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_batismo_status_lote(uuid,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_batismo_status_lote(uuid,uuid[],text) TO service_role;
COMMIT;

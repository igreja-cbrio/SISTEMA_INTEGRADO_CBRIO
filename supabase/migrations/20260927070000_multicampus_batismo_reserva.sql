-- Reserva transacional por campus/evento/horário. Exclusiva do backend:
-- autorização da porta, normalização/DV e matcher canônico vêm ANTES da RPC.
-- Parâmetros explícitos: payload não pode editar check-in, auditoria ou campus.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_campus_batismo_reservar(
 p_igreja_id uuid,p_evento_id uuid,p_horario_id uuid,p_inscricao_id uuid,
 p_membro_id uuid,p_nome text,p_sobrenome text,
 p_cpf text DEFAULT NULL,p_telefone text DEFAULT NULL,p_email text DEFAULT NULL,
 p_data_nascimento date DEFAULT NULL,p_status text DEFAULT 'pendente',
 p_origem text DEFAULT 'publico',p_area_kpi text DEFAULT 'sede',
 p_tamanho_camisa text DEFAULT NULL,p_eh_crianca boolean DEFAULT false,
 p_possui_deficiencia boolean DEFAULT false,p_deficiencia_descricao text DEFAULT NULL,
 p_endereco text DEFAULT NULL,p_cep text DEFAULT NULL,p_sexo text DEFAULT NULL,
 p_fez_next boolean DEFAULT NULL,p_observacoes text DEFAULT NULL,p_editar boolean DEFAULT false,p_inscrito_por uuid DEFAULT NULL
) RETURNS public.batismo_inscricoes LANGUAGE plpgsql SET search_path=public AS $$
DECLARE e public.batismo_eventos%ROWTYPE; h public.batismo_horarios%ROWTYPE;
 atual public.batismo_inscricoes%ROWTYPE; resultado public.batismo_inscricoes%ROWTYPE; total bigint; nova_vaga boolean;
BEGIN
 IF p_igreja_id IS NULL OR p_evento_id IS NULL OR p_horario_id IS NULL OR p_inscricao_id IS NULL
   OR NULLIF(btrim(p_nome),'') IS NULL OR NULLIF(btrim(p_sobrenome),'') IS NULL
   OR p_status NOT IN('pendente','confirmado','realizado','cancelado') OR p_status IS NULL THEN
   RAISE EXCEPTION 'Reserva exige campus, evento, horário, identificador e dados válidos.' USING ERRCODE='23514';
 END IF;
 -- Ordem única de locks: evento, horário, inscrição. Serializa o último lugar.
 SELECT * INTO e FROM public.batismo_eventos WHERE id=p_evento_id AND igreja_id=p_igreja_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Evento inexistente neste campus.' USING ERRCODE='23514'; END IF;
 SELECT * INTO h FROM public.batismo_horarios WHERE id=p_horario_id AND igreja_id=p_igreja_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Horário inexistente neste campus.' USING ERRCODE='23514'; END IF;
 SELECT * INTO atual FROM public.batismo_inscricoes WHERE id=p_inscricao_id FOR UPDATE;
 IF FOUND THEN
   IF atual.igreja_id<>p_igreja_id OR atual.deleted_at IS NOT NULL THEN
     RAISE EXCEPTION 'Inscrição indisponível neste campus.' USING ERRCODE='23514';
   END IF;
   IF NOT p_editar THEN
     IF atual.evento_id IS DISTINCT FROM p_evento_id OR atual.horario_id IS DISTINCT FROM p_horario_id
       OR atual.membro_id IS DISTINCT FROM p_membro_id OR atual.nome IS DISTINCT FROM btrim(p_nome)
       OR atual.sobrenome IS DISTINCT FROM btrim(p_sobrenome) OR atual.cpf IS DISTINCT FROM p_cpf THEN
       RAISE EXCEPTION 'Identificador de reserva já utilizado para outros dados.' USING ERRCODE='23505';
     END IF;
     RETURN atual;
   END IF;
 ELSIF p_editar THEN
   RAISE EXCEPTION 'Inscrição a editar não encontrada.' USING ERRCODE='23514';
 END IF;
 nova_vaga:=atual.id IS NULL OR atual.evento_id IS DISTINCT FROM p_evento_id
   OR atual.horario_id IS DISTINCT FROM p_horario_id OR atual.status IN('cancelado','rejeitado');
 IF p_status<>'cancelado' THEN
   -- Fechamento não impede editar contato de quem já ocupa exatamente esta vaga.
   IF nova_vaga AND (NOT e.aberto OR NOT h.aberto OR h.deleted_at IS NOT NULL) THEN
     RAISE EXCEPTION 'Evento ou horário fechado para novas reservas.' USING ERRCODE='23514';
   END IF;
   IF EXISTS(SELECT 1 FROM public.batismo_inscricoes i WHERE i.igreja_id=p_igreja_id AND i.evento_id=p_evento_id
      AND i.id<>p_inscricao_id AND i.deleted_at IS NULL AND (i.status IS NULL OR i.status NOT IN('cancelado','rejeitado'))
      AND ((p_membro_id IS NOT NULL AND i.membro_id=p_membro_id) OR (NULLIF(p_cpf,'') IS NOT NULL AND i.cpf=p_cpf))) THEN
     RAISE EXCEPTION 'Pessoa já inscrita neste evento de batismo.' USING ERRCODE='23505';
   END IF;
   SELECT count(*) INTO total FROM public.batismo_inscricoes i WHERE i.igreja_id=p_igreja_id
     AND i.evento_id=p_evento_id AND i.horario_id=p_horario_id AND i.id<>p_inscricao_id
     AND i.deleted_at IS NULL AND (i.status IS NULL OR i.status NOT IN('cancelado','rejeitado'));
   IF nova_vaga AND h.limite IS NOT NULL AND total>=h.limite THEN
     RAISE EXCEPTION 'Não há vagas neste horário de batismo.' USING ERRCODE='23514';
   END IF;
 END IF;
 IF atual.id IS NULL THEN
   INSERT INTO public.batismo_inscricoes(id,igreja_id,evento_id,horario_id,membro_id,nome,sobrenome,
     cpf,telefone,email,data_nascimento,status,origem,area_kpi,tamanho_camisa,eh_crianca,possui_deficiencia,
     deficiencia_descricao,endereco,cep,sexo,fez_next,observacoes,inscrito_por)
   VALUES(p_inscricao_id,p_igreja_id,p_evento_id,p_horario_id,p_membro_id,btrim(p_nome),btrim(p_sobrenome),
     p_cpf,p_telefone,p_email,p_data_nascimento,p_status,p_origem,p_area_kpi,p_tamanho_camisa,p_eh_crianca,
     p_possui_deficiencia,p_deficiencia_descricao,p_endereco,p_cep,p_sexo,p_fez_next,p_observacoes,p_inscrito_por)
   RETURNING * INTO resultado;
 ELSE
   UPDATE public.batismo_inscricoes SET evento_id=p_evento_id,horario_id=p_horario_id,
     data_batismo=e.data,horario_culto=h.horario,membro_id=p_membro_id,nome=btrim(p_nome),sobrenome=btrim(p_sobrenome),
     cpf=p_cpf,telefone=p_telefone,email=p_email,data_nascimento=p_data_nascimento,status=p_status,
     area_kpi=p_area_kpi,tamanho_camisa=p_tamanho_camisa,eh_crianca=p_eh_crianca,
     possui_deficiencia=p_possui_deficiencia,deficiencia_descricao=p_deficiencia_descricao,endereco=p_endereco,
     cep=p_cep,sexo=p_sexo,fez_next=p_fez_next,observacoes=p_observacoes,updated_at=now()
   WHERE id=p_inscricao_id RETURNING * INTO resultado;
 END IF;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_batismo_reservar(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,date,text,text,text,text,boolean,boolean,text,text,text,text,boolean,text,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_batismo_reservar(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,date,text,text,text,text,boolean,boolean,text,text,text,text,boolean,text,boolean,uuid) TO service_role;
COMMIT;

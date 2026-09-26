-- Fanout Next transacional. Identidade já resolvida pelo funil canônico no backend.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
  OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
  RAISE EXCEPTION 'Backfill dos encaminhamentos exige preparação e uma única Sede ativa.';
 END IF;
END $$;
ALTER TABLE public.jornada_encaminhamentos ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.jornada_encaminhamentos j SET igreja_id=COALESCE(
 (SELECT igreja_id FROM public.cui_convertidos WHERE id=j.convertido_id),
 (SELECT igreja_id FROM public.next_matriculas WHERE id=j.next_matricula_id),
 (SELECT igreja_id FROM public.next_inscricoes WHERE id=j.next_inscricao_id),public.fn_campus_legado_escrita());
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.jornada_encaminhamentos j
  LEFT JOIN public.cui_convertidos c ON c.id=j.convertido_id
  LEFT JOIN public.next_matriculas m ON m.id=j.next_matricula_id
  LEFT JOIN public.next_inscricoes i ON i.id=j.next_inscricao_id
  WHERE (c.id IS NOT NULL AND c.igreja_id<>j.igreja_id) OR (m.id IS NOT NULL AND m.igreja_id<>j.igreja_id) OR (i.id IS NOT NULL AND i.igreja_id<>j.igreja_id)) THEN
  RAISE EXCEPTION 'Encaminhamentos com origens divergentes exigem reconciliação.';
 END IF;
END $$;
ALTER TABLE public.jornada_encaminhamentos ALTER COLUMN igreja_id SET NOT NULL;
CREATE INDEX jornada_encaminhamentos_campus_vivos ON public.jornada_encaminhamentos(igreja_id,destino,status) WHERE deleted_at IS NULL;
ALTER TABLE public.jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.cui_convertidos ADD CONSTRAINT cui_convertidos_id_campus_jornada_key UNIQUE(id,igreja_id);
ALTER TABLE public.jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_convertido_campus_fkey
 FOREIGN KEY(convertido_id,igreja_id) REFERENCES public.cui_convertidos(id,igreja_id) ON DELETE SET NULL(convertido_id);
ALTER TABLE public.next_matriculas ADD CONSTRAINT next_matriculas_id_campus_jornada_key UNIQUE(id,igreja_id);
ALTER TABLE public.next_inscricoes ADD CONSTRAINT next_inscricoes_id_campus_jornada_key UNIQUE(id,igreja_id);
ALTER TABLE public.jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_matricula_campus_fkey
 FOREIGN KEY(next_matricula_id,igreja_id) REFERENCES public.next_matriculas(id,igreja_id) ON DELETE SET NULL(next_matricula_id);
ALTER TABLE public.jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_inscricao_campus_fkey
 FOREIGN KEY(next_inscricao_id,igreja_id) REFERENCES public.next_inscricoes(id,igreja_id) ON DELETE SET NULL(next_inscricao_id);
-- Auditoria read-only: zero duplicatas ativas em 27/09. Se aparecerem, falha sem apagar histórico.
CREATE UNIQUE INDEX jornada_encaminhamentos_next_destino_campus_unique ON public.jornada_encaminhamentos(igreja_id,next_matricula_id,destino)
 WHERE next_matricula_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX vol_inscricoes_next_campus_unique ON public.vol_inscricoes(igreja_id,next_matricula_id)
 WHERE next_matricula_id IS NOT NULL AND deleted_at IS NULL;
CREATE OR REPLACE FUNCTION public.tg_jornada_encaminhamento_campus()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW);r record;pai jsonb;campus uuid;parent_id uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.igreja_id IS NOT DISTINCT FROM OLD.igreja_id
  AND NEW.convertido_id IS NOT DISTINCT FROM OLD.convertido_id AND NEW.next_matricula_id IS NOT DISTINCT FROM OLD.next_matricula_id
  AND NEW.next_inscricao_id IS NOT DISTINCT FROM OLD.next_inscricao_id AND NEW.membro_id IS NOT DISTINCT FROM OLD.membro_id THEN RETURN NEW;END IF;
 FOR r IN SELECT * FROM(VALUES('convertido_id','cui_convertidos'),('next_matricula_id','next_matriculas'),('next_inscricao_id','next_inscricoes')) x(coluna,tabela) LOOP
  parent_id:=NULLIF(j->>r.coluna,'')::uuid;IF parent_id IS NULL THEN CONTINUE;END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE id=$1 FOR SHARE',r.tabela) INTO pai USING parent_id;
  IF pai IS NULL OR pai->>'igreja_id' IS NULL THEN RAISE EXCEPTION 'Origem do encaminhamento não encontrada.' USING ERRCODE='23514';END IF;
  IF campus IS NOT NULL AND campus<>(pai->>'igreja_id')::uuid THEN RAISE EXCEPTION 'Encaminhamento tem pais de campi diferentes.' USING ERRCODE='23514';END IF;
  campus:=(pai->>'igreja_id')::uuid;
  IF NEW.membro_id IS NOT NULL AND pai->>'membro_id' IS NOT NULL AND NEW.membro_id<>(pai->>'membro_id')::uuid THEN
   RAISE EXCEPTION 'Pessoa do encaminhamento diverge da origem.' USING ERRCODE='23514';END IF;
 END LOOP;
 IF NEW.igreja_id IS NULL THEN NEW.igreja_id:=COALESCE(campus,public.fn_campus_legado_escrita());END IF;
 IF campus IS NOT NULL AND campus<>NEW.igreja_id THEN RAISE EXCEPTION 'Campus do encaminhamento diverge da origem.' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN RAISE EXCEPTION 'Origem do encaminhamento é imutável.' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_jornada_encaminhamento_campus() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_jornada_encaminhamento_campus BEFORE INSERT OR UPDATE ON public.jornada_encaminhamentos
 FOR EACH ROW EXECUTE FUNCTION public.tg_jornada_encaminhamento_campus();
ALTER TABLE public.jornada_encaminhamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_jornada_enc_select ON public.jornada_encaminhamentos AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR membro_id=public.current_user_membro_id());
CREATE POLICY campus_jornada_enc_insert ON public.jornada_encaminhamentos AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY campus_jornada_enc_update ON public.jornada_encaminhamentos AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY campus_jornada_enc_delete ON public.jornada_encaminhamentos AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE OR REPLACE FUNCTION public.fn_campus_next_direcionar(
 p_igreja_id uuid,p_matricula_id uuid,p_destinos text[],p_areas text[] DEFAULT '{}',
 p_evento_batismo_id uuid DEFAULT NULL,p_horario_batismo_id uuid DEFAULT NULL,p_usuario_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE m public.next_matriculas%ROWTYPE;p public.mem_membros%ROWTYPE;b public.batismo_inscricoes%ROWTYPE;
 e public.batismo_eventos%ROWTYPE;h public.batismo_horarios%ROWTYPE;
 turma uuid;destinos text[];areas text[];d text;registro uuid;criados jsonb:='{}';registros jsonb:='{}';n integer;
 registro_tabela text;registro_membro uuid;nome text;primeiro text;sobrenome text;cpf text;telefone text;email text;nascimento date;sexo text;area text;
BEGIN
 IF p_igreja_id IS NULL OR p_matricula_id IS NULL OR COALESCE(cardinality(p_destinos),0)=0
  OR EXISTS(SELECT 1 FROM unnest(p_destinos) x WHERE x IS NULL OR x NOT IN('grupos','voluntarios','devocional','batismo')) THEN
  RAISE EXCEPTION 'Informe matrícula, campus e destinos válidos.' USING ERRCODE='23514';END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO destinos FROM unnest(p_destinos) x;
 SELECT turma_id INTO turma FROM public.next_matriculas WHERE id=p_matricula_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Matrícula não encontrada neste campus.' USING ERRCODE='P0404';END IF;
 IF turma IS NOT NULL THEN
  PERFORM 1 FROM public.next_turmas WHERE id=turma AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Turma indisponível neste campus.' USING ERRCODE='23514';END IF;
 END IF;
 SELECT * INTO m FROM public.next_matriculas WHERE id=p_matricula_id AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR m.turma_id IS DISTINCT FROM turma THEN RAISE EXCEPTION 'Matrícula alterada. Tente novamente.' USING ERRCODE='23514';END IF;
 IF destinos<>ARRAY['devocional']::text[] THEN
  SELECT * INTO p FROM public.mem_membros WHERE id=m.membro_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resolva a identidade canônica da matrícula antes de direcionar.' USING ERRCODE='23514';END IF;
 END IF;
 nome:=btrim(concat_ws(' ',NULLIF(btrim(m.nome),''),NULLIF(btrim(m.sobrenome),'')));
 primeiro:=split_part(nome,' ',1);sobrenome:=NULLIF(btrim(substr(nome,length(primeiro)+1)),'');
 cpf:=NULLIF(regexp_replace(COALESCE(NULLIF(m.cpf,''),p.cpf,''),'\D','','g'),'');
 telefone:=NULLIF(regexp_replace(COALESCE(NULLIF(m.telefone,''),p.telefone,''),'\D','','g'),'');
 email:=NULLIF(lower(btrim(COALESCE(NULLIF(m.email,''),p.email,''))),'');
 nascimento:=COALESCE(m.data_nascimento,p.data_nascimento);sexo:=COALESCE(NULLIF(m.sexo,''),p.genero);
 SELECT COALESCE(array_agg(DISTINCT btrim(x) ORDER BY btrim(x)),ARRAY[]::text[]) INTO areas FROM unnest(COALESCE(p_areas,ARRAY[]::text[])) x WHERE NULLIF(btrim(x),'') IS NOT NULL;
 IF 'voluntarios'=ANY(destinos) AND cardinality(areas)>0 THEN
  SELECT count(DISTINCT o.label) INTO n FROM public.vol_form_opcoes o WHERE o.ativo AND o.label=ANY(areas)
   AND (NOT(to_jsonb(o)?'igreja_id') OR (to_jsonb(o)->>'igreja_id')::uuid=p_igreja_id);
  IF n<>cardinality(areas) THEN RAISE EXCEPTION 'Área de voluntariado inválida ou indisponível neste campus.' USING ERRCODE='23514';END IF;
  SELECT o.area_canonica INTO area FROM public.vol_form_opcoes o WHERE o.ativo AND o.label=ANY(areas)
   AND (NOT(to_jsonb(o)?'igreja_id') OR (to_jsonb(o)->>'igreja_id')::uuid=p_igreja_id)
   ORDER BY array_position(ARRAY['kids','bridge','ami','online','sede'],o.area_canonica) LIMIT 1;
 END IF;
 -- Dedup de Batismo entre matrículas da mesma pessoa/campus. Nunca pela igreja-base.
 IF 'batismo'=ANY(destinos) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('next-batismo:'||p_igreja_id||':'||m.membro_id,0));
  IF p_evento_batismo_id IS NOT NULL THEN
   SELECT * INTO e FROM public.batismo_eventos WHERE id=p_evento_batismo_id AND igreja_id=p_igreja_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Evento de batismo não encontrado neste campus.' USING ERRCODE='23514';END IF;
  END IF;
  IF p_horario_batismo_id IS NOT NULL THEN
   SELECT * INTO h FROM public.batismo_horarios WHERE id=p_horario_batismo_id AND igreja_id=p_igreja_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Horário de batismo não encontrado neste campus.' USING ERRCODE='23514';END IF;
  END IF;
  SELECT count(*) INTO n FROM public.batismo_inscricoes WHERE membro_id=m.membro_id AND igreja_id=p_igreja_id AND status IN('pendente','confirmado') AND deleted_at IS NULL;
  IF n>1 THEN RAISE EXCEPTION 'Pessoa com múltiplas inscrições de batismo em aberto; reconciliação necessária.' USING ERRCODE='23514';END IF;
  SELECT * INTO b FROM public.batismo_inscricoes WHERE membro_id=m.membro_id AND igreja_id=p_igreja_id AND status IN('pendente','confirmado') AND deleted_at IS NULL FOR UPDATE;
  IF b.id IS NULL OR (b.horario_id IS NULL AND NULLIF(b.horario_culto,'') IS NULL AND (b.data_batismo IS NULL OR b.data_batismo=e.data)) THEN
   IF e.id IS NULL OR h.id IS NULL THEN RAISE EXCEPTION 'Selecione evento e horário de batismo deste campus.' USING ERRCODE='23514';END IF;
   IF b.id IS NULL THEN
    b:=public.fn_campus_batismo_reservar(p_igreja_id,e.id,h.id,gen_random_uuid(),m.membro_id,primeiro,sobrenome,
     cpf,telefone,email,nascimento,'pendente','next','sede',NULL,false,false,NULL,NULL,NULL,
     CASE WHEN sexo='masculino' THEN 'M' WHEN sexo='feminino' THEN 'F' ELSE NULL END,true,'Direcionado pelo NEXT',false,p_usuario_id);
    criados:=criados||jsonb_build_object('batismo',true);
   ELSE
    -- Preserva integralmente a inscrição anterior; só atribui a vaga que estava vazia.
    b:=public.fn_campus_batismo_reservar(p_igreja_id,e.id,h.id,b.id,b.membro_id,b.nome,b.sobrenome,b.cpf,b.telefone,b.email,b.data_nascimento,
     b.status,b.origem,b.area_kpi,b.tamanho_camisa,b.eh_crianca,b.possui_deficiencia,b.deficiencia_descricao,b.endereco,b.cep,b.sexo,b.fez_next,b.observacoes,true,b.inscrito_por);
    criados:=criados||jsonb_build_object('batismo_horario_atualizado',true);
   END IF;
  END IF;
  registros:=registros||jsonb_build_object('batismo',b.id);
 END IF;
 FOREACH d IN ARRAY destinos LOOP
  IF d='batismo' THEN CONTINUE;END IF;
  IF d='devocional' THEN
   IF NOT COALESCE(m.indicou_devocional,false) THEN criados:=criados||jsonb_build_object('devocional',true);END IF;
   CONTINUE;
  END IF;
  registro:=NULL;registro_tabela:='vol_inscricoes';
  IF d='voluntarios' THEN SELECT id INTO registro FROM public.vol_inscricoes WHERE next_matricula_id=m.id AND igreja_id=p_igreja_id AND deleted_at IS NULL;END IF;
  IF registro IS NULL THEN
   registro_tabela:='jornada_encaminhamentos';
   SELECT id INTO registro FROM public.jornada_encaminhamentos WHERE next_matricula_id=m.id AND destino=d AND igreja_id=p_igreja_id AND deleted_at IS NULL;
  END IF;
  IF registro IS NOT NULL THEN
   EXECUTE format('SELECT membro_id FROM public.%I WHERE id=$1 AND igreja_id=$2 FOR UPDATE',registro_tabela) INTO registro_membro USING registro,p_igreja_id;
   IF registro_membro IS NOT NULL AND registro_membro<>m.membro_id THEN RAISE EXCEPTION 'Destino anterior vinculado a outra pessoa; reconciliação necessária.' USING ERRCODE='23514';END IF;
   IF registro_membro IS NULL THEN EXECUTE format('UPDATE public.%I SET membro_id=$1 WHERE id=$2 AND igreja_id=$3',registro_tabela) USING m.membro_id,registro,p_igreja_id;END IF;
  END IF;
  IF registro IS NULL THEN
   IF d='voluntarios' AND cardinality(areas)>0 THEN
    INSERT INTO public.vol_inscricoes(nome,sobrenome,nome_completo,cpf,email,telefone,data_nascimento,sexo,data_inscricao,
     participou_next,ministerios_interesse,area,status,primeiro_contato_em,membro_id,origem,next_matricula_id,igreja_id)
    VALUES(primeiro,COALESCE(sobrenome,''),nome,cpf,email,telefone,nascimento,CASE WHEN sexo IN('masculino','feminino') THEN sexo ELSE NULL END,now(),
     'True',array_to_string(areas,', '),area,'inscrito','False',m.membro_id,'next',m.id,p_igreja_id) RETURNING id INTO registro;
   ELSE
    INSERT INTO public.jornada_encaminhamentos(origem,next_matricula_id,membro_id,nome,telefone,destino,valor_alvo,encaminhado_por,igreja_id)
    VALUES('next',m.id,m.membro_id,nome,telefone,d,CASE WHEN d='grupos' THEN 'conectar' ELSE 'servir' END,p_usuario_id,p_igreja_id) RETURNING id INTO registro;
   END IF;
   criados:=criados||jsonb_build_object(d,true);
  END IF;
  registros:=registros||jsonb_build_object(d,registro);
 END LOOP;
 UPDATE public.next_matriculas SET indicou_grupo=COALESCE(indicou_grupo,false) OR 'grupos'=ANY(destinos),
  indicou_servir=COALESCE(indicou_servir,false) OR 'voluntarios'=ANY(destinos),
  indicou_batismo=COALESCE(indicou_batismo,false) OR 'batismo'=ANY(destinos),
  indicou_devocional=COALESCE(indicou_devocional,false) OR 'devocional'=ANY(destinos),updated_at=now()
 WHERE id=m.id AND igreja_id=p_igreja_id;
 RETURN jsonb_build_object('ok',true,'destinos',destinos,'criados',criados,'registros',registros,'turma_id',m.turma_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_direcionar(uuid,uuid,text[],text[],uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_direcionar(uuid,uuid,text[],text[],uuid,uuid,uuid) TO service_role;
UPDATE public.app_campus_cobertura SET api_validada=false,rls_validada=false,produtores_validados=false,regressao_validada=false
 WHERE frente IN('next','grupos','voluntariado','cuidados','jobs-notificacoes');
COMMIT;

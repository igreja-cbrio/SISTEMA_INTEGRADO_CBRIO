-- Configuração de operação e reserva offline por campus. Não ativa multicampus.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado) THEN
  RAISE EXCEPTION 'Configuração Kids exige preparação antes do primeiro ensaio.';
 END IF;
END $$;
-- Configurações (não cadastro de pessoas); PK do campus evita duplicação de PIN/layout.
CREATE TABLE public.kids_totem_config_campus(
 igreja_id uuid PRIMARY KEY REFERENCES public.igrejas(id),
 edit_senha_hash text, edit_senha_por uuid REFERENCES public.profiles(id),
 edit_senha_em timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.kids_etiqueta_config_campus(
 igreja_id uuid PRIMARY KEY REFERENCES public.igrejas(id),
 logo_tamanho text NOT NULL DEFAULT 'M' CHECK(logo_tamanho IN('P','M','G')),
 logo_posicao text NOT NULL DEFAULT 'esquerda' CHECK(logo_posicao IN('esquerda','direita','acima')),
 nome_tamanho text NOT NULL DEFAULT 'auto' CHECK(nome_tamanho IN('auto','P','M','G')),
 fonte text NOT NULL DEFAULT 'sans' CHECK(fonte IN('sans','condensada','arredondada','serif','mono')),
 escala_fonte text NOT NULL DEFAULT 'M' CHECK(escala_fonte IN('P','M','G','GG')),
 logo_aniversario_url text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.kids_totem_config_campus SELECT public.fn_campus_legado_escrita(),edit_senha_hash,edit_senha_por,edit_senha_em,updated_at FROM public.kids_totem_config WHERE id;
INSERT INTO public.kids_etiqueta_config_campus SELECT public.fn_campus_legado_escrita(),logo_tamanho,logo_posicao,nome_tamanho,fonte,escala_fonte,logo_aniversario_url,updated_at FROM public.kids_etiqueta_config WHERE id=1;
ALTER TABLE public.kids_totem_config_campus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kids_etiqueta_config_campus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kids_totem_config_campus,public.kids_etiqueta_config_campus FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.kids_totem_config_campus,public.kids_etiqueta_config_campus TO service_role;
-- Ponte de compatibilidade apenas da Sede em preparação. O campus novo não herda PIN.
CREATE FUNCTION public.tg_kids_config_ponte() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE legado uuid;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME IN('kids_totem_config','kids_etiqueta_config') THEN
  legado:=public.fn_campus_legado_escrita();
  IF TG_TABLE_NAME='kids_totem_config' THEN
   INSERT INTO public.kids_totem_config_campus(igreja_id,edit_senha_hash,edit_senha_por,edit_senha_em,updated_at)
   VALUES(legado,NEW.edit_senha_hash,NEW.edit_senha_por,NEW.edit_senha_em,NEW.updated_at)
   ON CONFLICT(igreja_id) DO UPDATE SET edit_senha_hash=EXCLUDED.edit_senha_hash,edit_senha_por=EXCLUDED.edit_senha_por,edit_senha_em=EXCLUDED.edit_senha_em,updated_at=EXCLUDED.updated_at;
  ELSE
   INSERT INTO public.kids_etiqueta_config_campus(igreja_id,logo_tamanho,logo_posicao,nome_tamanho,fonte,escala_fonte,logo_aniversario_url,updated_at)
   VALUES(legado,NEW.logo_tamanho,NEW.logo_posicao,NEW.nome_tamanho,NEW.fonte,NEW.escala_fonte,NEW.logo_aniversario_url,NEW.updated_at)
   ON CONFLICT(igreja_id) DO UPDATE SET logo_tamanho=EXCLUDED.logo_tamanho,logo_posicao=EXCLUDED.logo_posicao,nome_tamanho=EXCLUDED.nome_tamanho,fonte=EXCLUDED.fonte,escala_fonte=EXCLUDED.escala_fonte,logo_aniversario_url=EXCLUDED.logo_aniversario_url,updated_at=EXCLUDED.updated_at;
  END IF;
 ELSE
  SELECT campus_legado_id INTO legado FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado;
  IF legado IS NOT NULL AND NEW.igreja_id=legado THEN
   IF TG_TABLE_NAME='kids_totem_config_campus' THEN
    INSERT INTO public.kids_totem_config(id,edit_senha_hash,edit_senha_por,edit_senha_em,updated_at)
    VALUES(true,NEW.edit_senha_hash,NEW.edit_senha_por,NEW.edit_senha_em,NEW.updated_at)
    ON CONFLICT(id) DO UPDATE SET edit_senha_hash=EXCLUDED.edit_senha_hash,edit_senha_por=EXCLUDED.edit_senha_por,edit_senha_em=EXCLUDED.edit_senha_em,updated_at=EXCLUDED.updated_at;
   ELSE
    INSERT INTO public.kids_etiqueta_config(id,logo_tamanho,logo_posicao,nome_tamanho,fonte,escala_fonte,logo_aniversario_url,updated_at)
    VALUES(1,NEW.logo_tamanho,NEW.logo_posicao,NEW.nome_tamanho,NEW.fonte,NEW.escala_fonte,NEW.logo_aniversario_url,NEW.updated_at)
    ON CONFLICT(id) DO UPDATE SET logo_tamanho=EXCLUDED.logo_tamanho,logo_posicao=EXCLUDED.logo_posicao,nome_tamanho=EXCLUDED.nome_tamanho,fonte=EXCLUDED.fonte,escala_fonte=EXCLUDED.escala_fonte,logo_aniversario_url=EXCLUDED.logo_aniversario_url,updated_at=EXCLUDED.updated_at;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_kids_totem_config_ponte AFTER INSERT OR UPDATE ON public.kids_totem_config FOR EACH ROW EXECUTE FUNCTION public.tg_kids_config_ponte();
CREATE TRIGGER trg_kids_totem_config_campus_ponte AFTER INSERT OR UPDATE ON public.kids_totem_config_campus FOR EACH ROW EXECUTE FUNCTION public.tg_kids_config_ponte();
CREATE TRIGGER trg_kids_etiqueta_config_ponte AFTER INSERT OR UPDATE ON public.kids_etiqueta_config FOR EACH ROW EXECUTE FUNCTION public.tg_kids_config_ponte();
CREATE TRIGGER trg_kids_etiqueta_config_campus_ponte AFTER INSERT OR UPDATE ON public.kids_etiqueta_config_campus FOR EACH ROW EXECUTE FUNCTION public.tg_kids_config_ponte();
REVOKE ALL ON FUNCTION public.tg_kids_config_ponte() FROM PUBLIC,anon,authenticated;

ALTER TABLE public.kids_codigos_reservados ADD COLUMN reservado_por uuid REFERENCES public.profiles(id);
-- Reserva antiga não recebe dono presumido. Consumo pela rotina nova exige autor conhecido.
CREATE INDEX kids_codigos_reserva_dono_idx ON public.kids_codigos_reservados(igreja_id,reservado_por,estacao_ref,sessao_id) WHERE status='reservado';
CREATE FUNCTION public.fn_campus_kids_reservar_codigos(p_igreja_id uuid,p_usuario_id uuid,p_estacao_ref text,p_sessao_id uuid,p_quantidade integer DEFAULT 60,p_estacao_id uuid DEFAULT NULL)
RETURNS TABLE(codigo text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE falta integer; novo text; tentativas integer:=0;
BEGIN
 IF p_usuario_id IS NULL OR p_estacao_ref IS NULL OR p_estacao_ref !~ '^totem-[0-9a-f-]{36}$' OR p_quantidade IS NULL OR p_quantidade<1 OR p_quantidade>200 THEN
  RAISE EXCEPTION 'Reserva exige usuário, estação e quantidade válidos.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.igrejas WHERE id=p_igreja_id AND ativa AND tipo='sede' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campus inválido.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.kids_sessoes s JOIN public.cultos c ON c.id=s.culto_id AND c.igreja_id=s.igreja_id
 WHERE s.id=p_sessao_id AND s.igreja_id=p_igreja_id AND s.status='aberta' AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND c.data>=(now() AT TIME ZONE 'America/Sao_Paulo')::date FOR SHARE OF s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sessão indisponível neste campus.' USING ERRCODE='23514'; END IF;
 IF p_estacao_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.kids_estacoes WHERE id=p_estacao_id AND igreja_id=p_igreja_id AND ativo) THEN
  RAISE EXCEPTION 'Estação indisponível neste campus.' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('kids-reserva:'||p_igreja_id||':'||p_usuario_id||':'||p_estacao_ref||':'||p_sessao_id,0));
 SELECT p_quantidade-count(*) INTO falta FROM public.kids_codigos_reservados r
 WHERE r.igreja_id=p_igreja_id AND r.reservado_por=p_usuario_id AND r.estacao_ref=p_estacao_ref AND r.estacao_id IS NOT DISTINCT FROM p_estacao_id AND r.sessao_id=p_sessao_id AND r.status='reservado';
 WHILE falta>0 AND tentativas<p_quantidade*10 LOOP
  tentativas:=tentativas+1;novo:=public.fn_kids_gerar_codigo_seguranca();
  BEGIN
   INSERT INTO public.kids_codigos_reservados(codigo,igreja_id,reservado_por,estacao_ref,estacao_id,sessao_id)
    VALUES(novo,p_igreja_id,p_usuario_id,p_estacao_ref,p_estacao_id,p_sessao_id);
   falta:=falta-1;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
 END LOOP;
 IF falta>0 THEN RAISE EXCEPTION 'Não foi possível reservar o bloco completo.' USING ERRCODE='23514'; END IF;
 RETURN QUERY SELECT r.codigo FROM public.kids_codigos_reservados r
 WHERE r.igreja_id=p_igreja_id AND r.reservado_por=p_usuario_id AND r.estacao_ref=p_estacao_ref AND r.estacao_id IS NOT DISTINCT FROM p_estacao_id AND r.sessao_id=p_sessao_id AND r.status='reservado' ORDER BY r.reservado_em,r.codigo;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_kids_reservar_codigos(uuid,uuid,text,uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_kids_reservar_codigos(uuid,uuid,text,uuid,integer,uuid) TO service_role;

-- A relação reserva→check-in deve provar o mesmo autor, mesmo quando outro
-- produtor service_role chama a RPC básica. Falha reverte o atendimento inteiro.
CREATE FUNCTION public.tg_kids_reserva_consumo_dono() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ck public.kids_checkins%ROWTYPE;
BEGIN
 IF NEW.reservado_por IS DISTINCT FROM OLD.reservado_por OR NEW.estacao_ref IS DISTINCT FROM OLD.estacao_ref
 OR NEW.estacao_id IS DISTINCT FROM OLD.estacao_id OR NEW.sessao_id IS DISTINCT FROM OLD.sessao_id OR NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
  RAISE EXCEPTION 'A identidade da reserva não pode ser alterada.' USING ERRCODE='23514'; END IF;
 IF NEW.status='usado' AND NEW.reservado_por IS NOT NULL THEN
  SELECT * INTO ck FROM public.kids_checkins WHERE id=NEW.checkin_id AND deleted_at IS NULL;
  IF NOT FOUND OR ck.igreja_id IS DISTINCT FROM NEW.igreja_id OR ck.checkin_por IS DISTINCT FROM NEW.reservado_por
  OR ck.sessao_id IS DISTINCT FROM NEW.sessao_id OR ck.estacao_checkin_id IS DISTINCT FROM NEW.estacao_id
  OR ck.codigo_seguranca IS DISTINCT FROM NEW.codigo THEN
   RAISE EXCEPTION 'Consumo de código deve preservar autor, campus, estação e sessão da reserva.' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_kids_reserva_consumo_dono BEFORE UPDATE ON public.kids_codigos_reservados FOR EACH ROW EXECUTE FUNCTION public.tg_kids_reserva_consumo_dono();
REVOKE ALL ON FUNCTION public.tg_kids_reserva_consumo_dono() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.fn_campus_kids_checkin_offline(p_igreja_id uuid,p_usuario_id uuid,p_estacao_ref text,p_sessao_id uuid,p_crianca_id uuid,p_sala_id uuid,p_responsavel_id uuid,p_codigo text,p_checkin_at timestamptz,p_estacao_id uuid DEFAULT NULL,p_cultos_extras uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE reserva public.kids_codigos_reservados%ROWTYPE; ck public.kids_checkins%ROWTYPE; resultado jsonb; culto uuid; dia date; esperados uuid[]; efetivos uuid[];
BEGIN
 IF p_igreja_id IS NULL OR p_usuario_id IS NULL OR p_estacao_ref IS NULL OR p_sessao_id IS NULL OR p_crianca_id IS NULL OR p_sala_id IS NULL OR p_responsavel_id IS NULL OR p_codigo IS NULL THEN
  RAISE EXCEPTION 'Atendimento offline exige identificação completa.' USING ERRCODE='23514'; END IF;
 IF p_checkin_at IS NULL OR p_checkin_at>now()+interval '5 minutes' OR p_checkin_at<now()-interval '24 hours' THEN RAISE EXCEPTION 'Horário offline inválido.' USING ERRCODE='23514'; END IF;
 SELECT c.id,c.data INTO culto,dia FROM public.kids_sessoes s JOIN public.cultos c ON c.id=s.culto_id AND c.igreja_id=s.igreja_id
 WHERE s.id=p_sessao_id AND s.igreja_id=p_igreja_id AND s.deleted_at IS NULL AND c.deleted_at IS NULL;
 IF culto IS NULL OR dia<>(p_checkin_at AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Atendimento offline fora do dia e campus da sessão.' USING ERRCODE='23514'; END IF;
 IF p_cultos_extras IS NULL OR cardinality(p_cultos_extras)>12 OR array_position(p_cultos_extras,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Cultos extras inválidos.' USING ERRCODE='23514'; END IF;
 SELECT array_agg(DISTINCT x ORDER BY x) INTO esperados FROM unnest(array_append(p_cultos_extras,culto)) x;
 -- Mesma ordem da rotina principal: cultos antes de reservar código/consultar replay.
 PERFORM id FROM public.cultos WHERE id=ANY(esperados) ORDER BY id FOR UPDATE;
 SELECT * INTO reserva FROM public.kids_codigos_reservados WHERE codigo=p_codigo AND igreja_id=p_igreja_id FOR UPDATE;
 IF NOT FOUND OR reserva.reservado_por IS DISTINCT FROM p_usuario_id OR reserva.estacao_ref IS DISTINCT FROM p_estacao_ref
 OR reserva.sessao_id IS DISTINCT FROM p_sessao_id OR reserva.estacao_id IS DISTINCT FROM p_estacao_id THEN
  RAISE EXCEPTION 'Código offline não pertence ao usuário, estação, sessão e campus.' USING ERRCODE='P0403'; END IF;
 IF reserva.status='usado' THEN
  SELECT * INTO ck FROM public.kids_checkins WHERE id=reserva.checkin_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
  IF NOT FOUND OR ck.crianca_id IS DISTINCT FROM p_crianca_id OR ck.sala_id IS DISTINCT FROM p_sala_id
  OR ck.checkin_por IS DISTINCT FROM p_usuario_id OR ck.sessao_id IS DISTINCT FROM p_sessao_id OR ck.estacao_checkin_id IS DISTINCT FROM p_estacao_id
  OR ck.responsavel_checkin_id IS DISTINCT FROM p_responsavel_id OR ck.codigo_seguranca IS DISTINCT FROM p_codigo THEN
   RAISE EXCEPTION 'Código offline já usado em outro atendimento.' USING ERRCODE='P0409'; END IF;
  SELECT array_agg(DISTINCT s.culto_id ORDER BY s.culto_id) INTO efetivos FROM public.kids_checkins k JOIN public.kids_sessoes s ON s.id=k.sessao_id
   WHERE k.checkin_grupo_id=ck.checkin_grupo_id AND k.igreja_id=p_igreja_id AND k.crianca_id=p_crianca_id AND k.deleted_at IS NULL;
  IF efetivos IS DISTINCT FROM esperados THEN RAISE EXCEPTION 'Código offline pertence a outro conjunto de cultos.' USING ERRCODE='P0409'; END IF;
  RETURN jsonb_build_object('checkin',to_jsonb(ck),'codigo_seguranca',p_codigo,'checkin_grupo_id',ck.checkin_grupo_id,'replay',true);
 END IF;
 IF reserva.status<>'reservado' THEN RAISE EXCEPTION 'Código offline indisponível.' USING ERRCODE='P0409'; END IF;
 IF EXISTS(SELECT 1 FROM public.kids_checkins k WHERE k.igreja_id=p_igreja_id AND k.crianca_id=p_crianca_id AND k.sessao_id=p_sessao_id AND k.deleted_at IS NULL AND k.checkout_at IS NULL) THEN
  RAISE EXCEPTION 'Outro código já identifica o atendimento desta criança. Confira a etiqueta.' USING ERRCODE='P0409'; END IF;
 resultado:=public.fn_campus_kids_checkin(p_igreja_id,p_sessao_id,p_crianca_id,p_sala_id,p_estacao_id,p_responsavel_id,p_usuario_id,p_codigo,p_cultos_extras);
 UPDATE public.kids_checkins SET checkin_at=p_checkin_at WHERE igreja_id=p_igreja_id AND checkin_grupo_id=(resultado->>'checkin_grupo_id')::uuid AND crianca_id=p_crianca_id;
 SELECT * INTO ck FROM public.kids_checkins WHERE id=(resultado->'checkin'->>'id')::uuid AND igreja_id=p_igreja_id;
 RETURN jsonb_set(resultado,'{checkin}',to_jsonb(ck));
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_kids_checkin_offline(uuid,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_kids_checkin_offline(uuid,uuid,text,uuid,uuid,uuid,uuid,text,timestamptz,uuid,uuid[]) TO service_role;
UPDATE public.app_campus_cobertura SET api_validada=false,rls_validada=false,produtores_validados=false,regressao_validada=false WHERE frente='kids';
NOTIFY pgrst,'reload schema';
COMMIT;

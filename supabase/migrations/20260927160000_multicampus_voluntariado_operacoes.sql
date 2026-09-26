-- Origem PCO explícita; identidade global, participação e serviço locais.
BEGIN;
CREATE TABLE public.vol_pco_service_type_campi(
 pco_service_type_id text PRIMARY KEY CHECK(btrim(pco_service_type_id)<>''),
 igreja_id uuid NOT NULL REFERENCES public.igrejas(id),
 service_type_id uuid NOT NULL REFERENCES public.vol_service_types(id),
 ativo boolean NOT NULL DEFAULT true,atualizado_em timestamptz NOT NULL DEFAULT now(),
 atualizado_por uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.vol_pco_service_type_campi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vol_pco_service_type_campi FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.vol_pco_service_type_campi TO service_role;
-- Nenhum mapa é inferido por nome. A PK externa impede uma origem ambígua.
ALTER TABLE public.vol_pco_mapa DROP CONSTRAINT vol_pco_mapa_pco_chave_key;
ALTER TABLE public.vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_campus_chave_key UNIQUE(igreja_id,pco_chave);
CREATE OR REPLACE FUNCTION public.fn_campus_vol_resolver_servico(
 p_igreja_id uuid,p_service_type_id uuid,p_pco_service_type_id text,p_pco_plan_id text,
 p_nome text,p_service_type_name text,p_scheduled_at timestamptz)
RETURNS public.vol_services LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_external public.vol_services;v_local public.vol_services;v_result public.vol_services;v_count integer;v_day date;
BEGIN
 IF p_igreja_id IS NULL OR p_service_type_id IS NULL OR p_scheduled_at IS NULL OR NULLIF(btrim(p_pco_plan_id),'') IS NULL THEN
  RAISE EXCEPTION 'Campus, tipo, data e plano PCO são obrigatórios.';END IF;
 PERFORM 1 FROM public.vol_pco_service_type_campi WHERE pco_service_type_id=p_pco_service_type_id
  AND igreja_id=p_igreja_id AND service_type_id=p_service_type_id AND ativo FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Origem PCO sem mapa explícito ativo para este campus.';END IF;
 PERFORM 1 FROM public.igrejas WHERE id=p_igreja_id AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campus inválido ou inativo.';END IF;
 v_day:=(p_scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date;
 -- Ordem uniforme: plano global, depois chave operacional local.
 PERFORM pg_advisory_xact_lock(hashtextextended('vol-pco-plan:'||p_pco_plan_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('vol-service:'||p_igreja_id||':'||p_service_type_id||':'||v_day,0));
 SELECT * INTO v_external FROM public.vol_services WHERE planning_center_id=p_pco_plan_id FOR UPDATE;
 IF FOUND AND (v_external.igreja_id<>p_igreja_id OR v_external.service_type_id IS DISTINCT FROM p_service_type_id
   OR (v_external.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date<>v_day) THEN
  RAISE EXCEPTION 'Plano PCO já pertence a outro campus, tipo ou dia; reconciliação necessária.';END IF;
 SELECT count(*) INTO v_count FROM public.vol_services WHERE igreja_id=p_igreja_id AND service_type_id=p_service_type_id
  AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date=v_day;
 IF v_count>1 THEN RAISE EXCEPTION 'Mais de um serviço local no mesmo tipo e dia; reconciliação necessária.';END IF;
 SELECT * INTO v_local FROM public.vol_services WHERE igreja_id=p_igreja_id AND service_type_id=p_service_type_id
  AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date=v_day FOR UPDATE;
 IF v_external.id IS NOT NULL AND v_local.id IS NOT NULL AND v_external.id<>v_local.id THEN
  RAISE EXCEPTION 'Plano e serviço interno divergentes; reconciliação necessária.';END IF;
 IF v_local.planning_center_id IS NOT NULL AND v_local.planning_center_id<>p_pco_plan_id THEN
  RAISE EXCEPTION 'Serviço local já vinculado a outro plano PCO.';END IF;
 IF v_local.id IS NULL THEN
  INSERT INTO public.vol_services(igreja_id,service_type_id,planning_center_id,name,service_type_name,scheduled_at)
   VALUES(p_igreja_id,p_service_type_id,p_pco_plan_id,p_nome,p_service_type_name,p_scheduled_at) RETURNING * INTO v_result;
 ELSE
  UPDATE public.vol_services SET planning_center_id=p_pco_plan_id,name=p_nome,service_type_name=p_service_type_name,
   scheduled_at=p_scheduled_at,updated_at=now() WHERE id=v_local.id RETURNING * INTO v_result;
 END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_vol_resolver_servico(uuid,uuid,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_vol_resolver_servico(uuid,uuid,text,text,text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_vol_materializar_servir_campus(p_profile uuid,p_campus uuid,p_data date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_member uuid;v_min uuid;v_area text;
BEGIN
 SELECT membresia_id INTO v_member FROM public.vol_profiles WHERE id=p_profile;
 IF v_member IS NULL THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('vol-servir:'||v_member||':'||p_campus,0));
 IF EXISTS(SELECT 1 FROM public.mem_voluntarios WHERE membro_id=v_member AND igreja_id=p_campus AND ate IS NULL AND deleted_at IS NULL) THEN RETURN;END IF;
 SELECT id INTO v_min FROM public.mem_ministerios WHERE nome='Voluntariado (geral)' LIMIT 1;
 IF v_min IS NULL THEN RETURN;END IF;
 SELECT area INTO v_area FROM public.vol_inscricoes WHERE membro_id=v_member AND igreja_id=p_campus
  AND area IN('kids','sede','ami','bridge','online') AND deleted_at IS NULL ORDER BY data_inscricao DESC LIMIT 1;
 INSERT INTO public.mem_voluntarios(membro_id,ministerio_id,papel,desde,area,observacoes,igreja_id)
  VALUES(v_member,v_min,'Voluntário',COALESCE(p_data,CURRENT_DATE),v_area,'Auto: participação local do voluntariado',p_campus);
END $$;
REVOKE ALL ON FUNCTION public.fn_vol_materializar_servir_campus(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_vol_materializar_servir_campus(uuid,uuid,date) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_vol_profile_sync_mem_voluntarios()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_campus uuid;v_found boolean:=false;
BEGIN
 IF NEW.membresia_id IS NULL THEN RETURN NEW;END IF;
 FOR v_campus IN SELECT igreja_id FROM public.vol_profile_campi WHERE profile_id=NEW.id AND ativo LOOP
  v_found:=true;PERFORM public.fn_vol_materializar_servir_campus(NEW.id,v_campus,NEW.created_at::date);
 END LOOP;
 IF NOT v_found AND public.fn_vol_legado_em_preparacao() THEN
  PERFORM public.fn_vol_materializar_servir_campus(NEW.id,public.fn_campus_legado_escrita(),NEW.created_at::date);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.tg_vol_ato_vincula_perfil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_profile uuid;v_ativo boolean;v_changed boolean;
BEGIN
 v_profile:=NULLIF(to_jsonb(NEW)->>TG_ARGV[0],'')::uuid;
 IF v_profile IS NULL THEN RETURN NEW;END IF;
 v_changed:=TG_OP='INSERT';
 IF TG_OP='UPDATE' THEN v_changed:=(to_jsonb(OLD)->>TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(NEW)->>TG_ARGV[0]);END IF;
 IF NOT v_changed THEN RETURN NEW;END IF;
 -- Serializa criação/revogação pela mesma linha; nunca reativa um vínculo revogado.
 INSERT INTO public.vol_profile_campi(profile_id,igreja_id) VALUES(v_profile,NEW.igreja_id) ON CONFLICT DO NOTHING;
 SELECT ativo INTO v_ativo FROM public.vol_profile_campi WHERE profile_id=v_profile AND igreja_id=NEW.igreja_id FOR SHARE;
 IF NOT v_ativo THEN RAISE EXCEPTION 'Vínculo do voluntário com o campus está inativo.';END IF;
 PERFORM public.fn_vol_materializar_servir_campus(v_profile,NEW.igreja_id,CURRENT_DATE);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.tg_vol_exige_vinculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_active boolean;v_col text:=TG_ARGV[0];v_profile uuid;
BEGIN
 v_profile:=NULLIF(to_jsonb(NEW)->>v_col,'')::uuid;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)->>v_col) IS NOT DISTINCT FROM (to_jsonb(OLD)->>v_col) THEN RETURN NEW;END IF;
 IF v_profile IS NULL THEN
  IF TG_TABLE_NAME='vol_availability' THEN RAISE EXCEPTION 'Disponibilidade exige perfil canônico explícito.';END IF;
  RETURN NEW;
 END IF;
 IF public.fn_vol_legado_em_preparacao() AND NEW.igreja_id=public.fn_campus_legado_escrita() THEN
  INSERT INTO public.vol_profile_campi(profile_id,igreja_id) VALUES(v_profile,NEW.igreja_id) ON CONFLICT DO NOTHING;
 END IF;
 SELECT ativo INTO v_active FROM public.vol_profile_campi WHERE profile_id=v_profile AND igreja_id=NEW.igreja_id FOR SHARE;
 IF NOT COALESCE(v_active,false) THEN RAISE EXCEPTION 'Operação exige vínculo ativo do perfil no campus.';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_vol_availability_vinculo BEFORE INSERT OR UPDATE ON public.vol_availability FOR EACH ROW EXECUTE FUNCTION public.tg_vol_exige_vinculo('volunteer_profile_id');
CREATE TRIGGER zz_vol_team_leader_vinculo BEFORE INSERT OR UPDATE ON public.vol_teams FOR EACH ROW EXECUTE FUNCTION public.tg_vol_exige_vinculo('leader_profile_id');
CREATE TRIGGER zz_vol_ato_vincula_perfil AFTER INSERT OR UPDATE ON public.vol_schedules FOR EACH ROW EXECUTE FUNCTION public.tg_vol_ato_vincula_perfil('volunteer_id');
CREATE TRIGGER zz_vol_ato_vincula_perfil AFTER INSERT OR UPDATE ON public.vol_check_ins FOR EACH ROW EXECUTE FUNCTION public.tg_vol_ato_vincula_perfil('volunteer_id');
CREATE TRIGGER zz_vol_ato_vincula_perfil AFTER INSERT OR UPDATE ON public.vol_team_members FOR EACH ROW EXECUTE FUNCTION public.tg_vol_ato_vincula_perfil('volunteer_profile_id');
CREATE TRIGGER zz_vol_ato_vincula_perfil AFTER INSERT OR UPDATE ON public.vol_inscricoes FOR EACH ROW EXECUTE FUNCTION public.tg_vol_ato_vincula_perfil('vol_profile_id');
CREATE TRIGGER zz_vol_ato_vincula_perfil AFTER INSERT OR UPDATE ON public.vol_inscritos FOR EACH ROW EXECUTE FUNCTION public.tg_vol_ato_vincula_perfil('vol_profile_id');
CREATE TRIGGER zz_vol_ato_vincula_perfil AFTER INSERT OR UPDATE ON public.vol_servicos_historico FOR EACH ROW EXECUTE FUNCTION public.tg_vol_ato_vincula_perfil('vol_profile_id');
-- Mantém a coorte e unicidade NSM histórica; somente a origem operacional passa a ser explícita.
CREATE OR REPLACE FUNCTION public.nsm_inserir_evento_campus(p_igreja_id uuid, p_membro_id uuid, p_valor text, p_origem text, p_origem_id uuid DEFAULT NULL::uuid, p_data_engajamento date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_decisao_data date;
  v_membro_cpf text;
  v_membro_nome text;
  v_igreja_id uuid;
  v_visitante_id uuid;
BEGIN
  -- 1. Busca dados do membro
  SELECT cpf, nome, p_igreja_id
    INTO v_membro_cpf, v_membro_nome, v_igreja_id
    FROM public.mem_membros
   WHERE id = p_membro_id;

  IF v_membro_cpf IS NULL OR v_membro_cpf = '' THEN
    -- Sem CPF, nao da pra linkar com int_visitantes — sai silenciosamente
    RETURN;
  END IF;

  -- 2. Busca decisao mais recente em int_visitantes
  SELECT id, data_visita
    INTO v_visitante_id, v_decisao_data
    FROM public.int_visitantes
   WHERE cpf = v_membro_cpf
     AND fez_decisao = true
   ORDER BY data_visita DESC
   LIMIT 1;

  IF v_decisao_data IS NULL THEN
    -- Nao tem decisao registrada → nao entra no funil NSM
    RETURN;
  END IF;

  -- 3. Insere (ON CONFLICT DO NOTHING — primeiro engajamento por valor conta)
  INSERT INTO public.nsm_eventos (
    membro_id, visitante_id, cpf, nome, igreja_id,
    data_decisao, valor_engajado, data_engajamento,
    origem, origem_id
  ) VALUES (
    p_membro_id, v_visitante_id, v_membro_cpf, v_membro_nome, v_igreja_id,
    v_decisao_data, p_valor, p_data_engajamento,
    p_origem, p_origem_id
  )
  ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;
END;
$function$
;
REVOKE ALL ON FUNCTION public.nsm_inserir_evento_campus(uuid,uuid,text,text,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nsm_inserir_evento_campus(uuid,uuid,text,text,uuid,date) TO service_role;
CREATE OR REPLACE FUNCTION public.tg_nsm_voluntario_servir()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.nsm_inserir_evento_campus(NEW.igreja_id,NEW.membro_id,'servir','mem_voluntarios',NEW.id,NEW.desde);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_resumo(p_ano_iso integer, p_semana_iso integer)
 RETURNS TABLE(pessoas_unicas integer, checkins_total integer, sem_identificacao integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN PERFORM public.fn_campus_legado_escrita(); RETURN QUERY
  WITH ci AS (
    SELECT
      lower(btrim(COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')))) AS pessoa
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  )
  SELECT
    count(DISTINCT pessoa)::int AS pessoas_unicas,
    count(*)::int AS checkins_total,
    count(*) FILTER (WHERE pessoa IS NULL)::int AS sem_identificacao
  FROM ci;
END; $function$
;
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas(p_ano_iso integer, p_semana_iso integer)
 RETURNS TABLE(nome text, checkins integer, blocos text, equipes text, cultos jsonb, sem_escala boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN PERFORM public.fn_campus_legado_escrita(); RETURN QUERY
  WITH ci AS (
    SELECT
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')) AS nome,
      (c.schedule_id IS NULL) AS ci_sem_escala,
      s.service_type_name AS culto,
      NULLIF(btrim(sc.team_name), '') AS equipe
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  ),
  base AS (
    SELECT * FROM ci WHERE nome IS NOT NULL
  ),
  pares AS (
    SELECT DISTINCT lower(btrim(nome)) AS pk, culto, equipe FROM base
  ),
  paresagg AS (
    SELECT pk,
           jsonb_agg(jsonb_build_object('culto', culto, 'equipe', equipe)
                     ORDER BY culto, equipe NULLS LAST) AS cultos
    FROM pares GROUP BY pk
  )
  SELECT
    min(b.nome) AS nome,
    count(*)::int AS checkins,
    string_agg(DISTINCT b.culto, ' · ' ORDER BY b.culto) AS blocos,
    string_agg(DISTINCT b.equipe, ' · ' ORDER BY b.equipe) AS equipes,
    pa.cultos,
    bool_and(b.ci_sem_escala) AS sem_escala
  FROM base b
  JOIN paresagg pa ON pa.pk = lower(btrim(b.nome))
  GROUP BY lower(btrim(b.nome)), pa.cultos
  ORDER BY min(b.nome);
END; $function$
;
CREATE OR REPLACE FUNCTION public.culto_voluntarios_auto(p_culto_id uuid)
 RETURNS TABLE(escalados integer, checkin integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_service_type_id UUID;
  v_data DATE;
BEGIN
  PERFORM public.fn_campus_legado_escrita();
  SELECT service_type_id, data INTO v_service_type_id, v_data
  FROM cultos WHERE id = p_culto_id;

  IF v_service_type_id IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  RETURN QUERY
  WITH services_match AS (
    SELECT id FROM vol_services
    WHERE service_type_id = v_service_type_id
      AND scheduled_at::date = v_data
  )
  SELECT
    (SELECT count(DISTINCT volunteer_id)::INT FROM vol_schedules
       WHERE service_id IN (SELECT id FROM services_match)),
    (SELECT count(DISTINCT volunteer_id)::INT FROM vol_check_ins
       WHERE service_id IN (SELECT id FROM services_match));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_composicao(p_ano_iso integer, p_semana_iso integer)
 RETURNS TABLE(bloco text, culto text, pessoas integer, sem_identificacao integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN PERFORM public.fn_campus_legado_escrita(); RETURN QUERY
  WITH ci AS (
    SELECT
      s.service_type_name AS culto,
      lower(btrim(COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')))) AS pessoa,
      public.fn_dash_vol_bloco_nome(s.service_type_name) AS bloco
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_bloco_nome(s.service_type_name) IS NOT NULL
  )
  SELECT
    bloco,
    culto,
    count(DISTINCT pessoa)::int AS pessoas,
    count(*) FILTER (WHERE pessoa IS NULL)::int AS sem_identificacao
  FROM ci
  WHERE bloco IS NOT NULL
  GROUP BY bloco, culto
  ORDER BY bloco, culto;
END; $function$
;
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_resumo_campus(p_igreja_id uuid, p_ano_iso integer, p_semana_iso integer)
 RETURNS TABLE(pessoas_unicas integer, checkins_total integer, sem_identificacao integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH ci AS (
    SELECT
      lower(btrim(COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')))) AS pessoa
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id AND sc.igreja_id=p_igreja_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE c.igreja_id=p_igreja_id AND s.igreja_id=p_igreja_id AND EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  )
  SELECT
    count(DISTINCT pessoa)::int AS pessoas_unicas,
    count(*)::int AS checkins_total,
    count(*) FILTER (WHERE pessoa IS NULL)::int AS sem_identificacao
  FROM ci;
$function$
;
REVOKE ALL ON FUNCTION public.fn_dashboard_voluntariado_resumo_campus(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_voluntariado_resumo_campus(uuid,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_pessoas_campus(p_igreja_id uuid, p_ano_iso integer, p_semana_iso integer)
 RETURNS TABLE(nome text, checkins integer, blocos text, equipes text, cultos jsonb, sem_escala boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH ci AS (
    SELECT
      COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')) AS nome,
      (c.schedule_id IS NULL) AS ci_sem_escala,
      s.service_type_name AS culto,
      NULLIF(btrim(sc.team_name), '') AS equipe
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id AND sc.igreja_id=p_igreja_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE c.igreja_id=p_igreja_id AND s.igreja_id=p_igreja_id AND EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_service_no_bloco(s.service_type_name)
  ),
  base AS (
    SELECT * FROM ci WHERE nome IS NOT NULL
  ),
  pares AS (
    SELECT DISTINCT lower(btrim(nome)) AS pk, culto, equipe FROM base
  ),
  paresagg AS (
    SELECT pk,
           jsonb_agg(jsonb_build_object('culto', culto, 'equipe', equipe)
                     ORDER BY culto, equipe NULLS LAST) AS cultos
    FROM pares GROUP BY pk
  )
  SELECT
    min(b.nome) AS nome,
    count(*)::int AS checkins,
    string_agg(DISTINCT b.culto, ' · ' ORDER BY b.culto) AS blocos,
    string_agg(DISTINCT b.equipe, ' · ' ORDER BY b.equipe) AS equipes,
    pa.cultos,
    bool_and(b.ci_sem_escala) AS sem_escala
  FROM base b
  JOIN paresagg pa ON pa.pk = lower(btrim(b.nome))
  GROUP BY lower(btrim(b.nome)), pa.cultos
  ORDER BY min(b.nome);
$function$
;
REVOKE ALL ON FUNCTION public.fn_dashboard_voluntariado_pessoas_campus(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_voluntariado_pessoas_campus(uuid,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_composicao_campus(p_igreja_id uuid, p_ano_iso integer, p_semana_iso integer)
 RETURNS TABLE(bloco text, culto text, pessoas integer, sem_identificacao integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH ci AS (
    SELECT
      s.service_type_name AS culto,
      lower(btrim(COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')))) AS pessoa,
      public.fn_dash_vol_bloco_nome(s.service_type_name) AS bloco
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id AND sc.igreja_id=p_igreja_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE c.igreja_id=p_igreja_id AND s.igreja_id=p_igreja_id AND EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_bloco_nome(s.service_type_name) IS NOT NULL
  )
  SELECT
    bloco,
    culto,
    count(DISTINCT pessoa)::int AS pessoas,
    count(*) FILTER (WHERE pessoa IS NULL)::int AS sem_identificacao
  FROM ci
  WHERE bloco IS NOT NULL
  GROUP BY bloco, culto
  ORDER BY bloco, culto;
$function$
;
REVOKE ALL ON FUNCTION public.fn_dashboard_voluntariado_composicao_campus(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dashboard_voluntariado_composicao_campus(uuid,integer,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.culto_voluntarios_auto_campus(p_igreja_id uuid,p_culto_id uuid)
RETURNS TABLE(escalados integer,checkin integer) LANGUAGE sql STABLE SET search_path=public AS $$
 WITH alvo AS(SELECT service_type_id,data FROM public.cultos WHERE id=p_culto_id AND igreja_id=p_igreja_id AND deleted_at IS NULL),
 servicos AS(SELECT s.id FROM public.vol_services s JOIN alvo a ON a.service_type_id=s.service_type_id
  AND (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date=a.data WHERE s.igreja_id=p_igreja_id)
 SELECT (SELECT count(DISTINCT volunteer_id)::integer FROM public.vol_schedules WHERE igreja_id=p_igreja_id AND service_id IN(SELECT id FROM servicos)),
 (SELECT count(DISTINCT volunteer_id)::integer FROM public.vol_check_ins WHERE igreja_id=p_igreja_id AND service_id IN(SELECT id FROM servicos));
$$;
REVOKE ALL ON FUNCTION public.culto_voluntarios_auto_campus(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.culto_voluntarios_auto_campus(uuid,uuid) TO service_role;

COMMIT;

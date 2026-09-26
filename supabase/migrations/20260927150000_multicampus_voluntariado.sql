-- Voluntariado: perfil/pessoa globais, serviço e participação locais.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
  OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
  RAISE EXCEPTION 'Backfill Voluntariado exige preparação e uma única Sede ativa.'; END IF;
 IF EXISTS(SELECT 1 FROM public.mem_voluntarios WHERE igreja_id IS NOT NULL AND igreja_id<>public.fn_campus_legado_escrita()) THEN
  RAISE EXCEPTION 'Vínculos Servir fora da Sede exigem reconciliação antes do backfill.'; END IF;
END $$;
CREATE TABLE public.vol_profile_campi(
 profile_id uuid NOT NULL REFERENCES public.vol_profiles(id) ON DELETE CASCADE,
 igreja_id uuid NOT NULL REFERENCES public.igrejas(id),ativo boolean NOT NULL DEFAULT true,
 criado_em timestamptz NOT NULL DEFAULT now(),criado_por uuid REFERENCES public.profiles(id),
 PRIMARY KEY(profile_id,igreja_id)
);
-- PK composta: desativação explícita por ativo=false, sem soft-delete por id.
CREATE INDEX vol_profile_campi_igreja_ativo ON public.vol_profile_campi(igreja_id,profile_id) WHERE ativo;

ALTER TABLE public.vol_services ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_services SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_teams ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_teams SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_escala_templates ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_escala_templates SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_inscricoes ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_inscricoes SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_inscritos ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_inscritos SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_servicos_historico ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_servicos_historico SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_email_disparos ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_email_disparos SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_sync_logs ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_sync_logs SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_positions ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_positions SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_team_members ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_team_members SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_availability ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_availability SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_escala_template_tipos ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_escala_template_tipos SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_escala_template_itens ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_escala_template_itens SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_escala_template_item_pessoas ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_escala_template_item_pessoas SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_escala_template_liderancas ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_escala_template_liderancas SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_escala_culto_itens ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_escala_culto_itens SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_schedules ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_schedules SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_check_ins ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_check_ins SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_area_supervisores ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_area_supervisores SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_pco_mapa ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_pco_mapa SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_email_disparo_destinatarios ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_email_disparo_destinatarios SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_background_checks ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_background_checks SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.vol_training_checkins ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id); UPDATE public.vol_training_checkins SET igreja_id=public.fn_campus_legado_escrita();
UPDATE public.mem_voluntarios SET igreja_id=public.fn_campus_legado_escrita() WHERE igreja_id IS NULL;
ALTER TABLE public.vol_services ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_services_campus_idx ON public.vol_services(igreja_id); ALTER TABLE public.vol_services ADD CONSTRAINT vol_services_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_teams ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_teams_campus_idx ON public.vol_teams(igreja_id); ALTER TABLE public.vol_teams ADD CONSTRAINT vol_teams_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_escala_templates ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_escala_templates_campus_idx ON public.vol_escala_templates(igreja_id); ALTER TABLE public.vol_escala_templates ADD CONSTRAINT vol_escala_templates_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_inscricoes ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_inscricoes_campus_idx ON public.vol_inscricoes(igreja_id); ALTER TABLE public.vol_inscricoes ADD CONSTRAINT vol_inscricoes_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_inscritos ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_inscritos_campus_idx ON public.vol_inscritos(igreja_id); ALTER TABLE public.vol_inscritos ADD CONSTRAINT vol_inscritos_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_servicos_historico ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_servicos_historico_campus_idx ON public.vol_servicos_historico(igreja_id); ALTER TABLE public.vol_servicos_historico ADD CONSTRAINT vol_servicos_historico_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_email_disparos ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_email_disparos_campus_idx ON public.vol_email_disparos(igreja_id); ALTER TABLE public.vol_email_disparos ADD CONSTRAINT vol_email_disparos_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_sync_logs ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_sync_logs_campus_idx ON public.vol_sync_logs(igreja_id); ALTER TABLE public.vol_sync_logs ADD CONSTRAINT vol_sync_logs_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_positions ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_positions_campus_idx ON public.vol_positions(igreja_id); ALTER TABLE public.vol_positions ADD CONSTRAINT vol_positions_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_team_members ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_team_members_campus_idx ON public.vol_team_members(igreja_id); ALTER TABLE public.vol_team_members ADD CONSTRAINT vol_team_members_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_availability ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_availability_campus_idx ON public.vol_availability(igreja_id); ALTER TABLE public.vol_availability ADD CONSTRAINT vol_availability_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_escala_template_tipos ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_escala_template_tipos_campus_idx ON public.vol_escala_template_tipos(igreja_id); ALTER TABLE public.vol_escala_template_tipos ADD CONSTRAINT vol_escala_template_tipos_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_escala_template_itens ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_escala_template_itens_campus_idx ON public.vol_escala_template_itens(igreja_id); ALTER TABLE public.vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_escala_template_item_pessoas ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_escala_template_item_pessoas_campus_idx ON public.vol_escala_template_item_pessoas(igreja_id); ALTER TABLE public.vol_escala_template_item_pessoas ADD CONSTRAINT vol_escala_template_item_pessoas_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_escala_template_liderancas ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_escala_template_liderancas_campus_idx ON public.vol_escala_template_liderancas(igreja_id); ALTER TABLE public.vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_escala_culto_itens ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_escala_culto_itens_campus_idx ON public.vol_escala_culto_itens(igreja_id); ALTER TABLE public.vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_schedules ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_schedules_campus_idx ON public.vol_schedules(igreja_id); ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_check_ins ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_check_ins_campus_idx ON public.vol_check_ins(igreja_id); ALTER TABLE public.vol_check_ins ADD CONSTRAINT vol_check_ins_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_area_supervisores ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_area_supervisores_campus_idx ON public.vol_area_supervisores(igreja_id); ALTER TABLE public.vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_pco_mapa ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_pco_mapa_campus_idx ON public.vol_pco_mapa(igreja_id); ALTER TABLE public.vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_email_disparo_destinatarios ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_email_disparo_destinatarios_campus_idx ON public.vol_email_disparo_destinatarios(igreja_id); ALTER TABLE public.vol_email_disparo_destinatarios ADD CONSTRAINT vol_email_disparo_destinatarios_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_background_checks ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_background_checks_campus_idx ON public.vol_background_checks(igreja_id); ALTER TABLE public.vol_background_checks ADD CONSTRAINT vol_background_checks_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.vol_training_checkins ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX vol_training_checkins_campus_idx ON public.vol_training_checkins(igreja_id); ALTER TABLE public.vol_training_checkins ADD CONSTRAINT vol_training_checkins_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.mem_voluntarios ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX mem_voluntarios_campus_idx ON public.mem_voluntarios(igreja_id); ALTER TABLE public.mem_voluntarios ADD CONSTRAINT mem_voluntarios_id_campus_key UNIQUE(id,igreja_id);
-- Pessoa pode servir no mesmo ministério em campi diferentes sem duplicar identidade.
DROP INDEX public.uniq_mem_voluntarios_ativo;
CREATE UNIQUE INDEX uniq_mem_voluntarios_ativo ON public.mem_voluntarios(igreja_id,membro_id,ministerio_id) WHERE ate IS NULL;
DROP INDEX public.uq_vol_servhist;
CREATE UNIQUE INDEX uq_vol_servhist ON public.vol_servicos_historico(igreja_id,nome_norm,data,culto_label,origem);
-- Nomes de equipes, chaves PCO e importações conservam unicidades globais até
-- auditar todos os produtores/upserts legados. Não declarar cutover concluído.
INSERT INTO public.vol_profile_campi(profile_id,igreja_id)
 SELECT volunteer_profile_id,igreja_id FROM public.vol_team_members WHERE volunteer_profile_id IS NOT NULL
 UNION SELECT volunteer_id,igreja_id FROM public.vol_schedules WHERE volunteer_id IS NOT NULL
 UNION SELECT volunteer_id,igreja_id FROM public.vol_check_ins WHERE volunteer_id IS NOT NULL
 UNION SELECT vol_profile_id,igreja_id FROM public.vol_inscricoes WHERE vol_profile_id IS NOT NULL
 UNION SELECT vol_profile_id,igreja_id FROM public.vol_inscritos WHERE vol_profile_id IS NOT NULL
 UNION SELECT vol_profile_id,igreja_id FROM public.vol_servicos_historico WHERE vol_profile_id IS NOT NULL
 UNION SELECT p.id,m.igreja_id FROM public.mem_voluntarios m JOIN public.vol_profiles p ON p.membresia_id=m.membro_id
 ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.fn_vol_profile_campus_permitido(p_id uuid,p_proprio boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
 SELECT COALESCE((SELECT estado='preparacao' AND NOT ja_ativado FROM public.app_campus_config WHERE id),false)
 OR EXISTS(SELECT 1 FROM public.vol_profile_campi v WHERE v.profile_id=p_id AND v.ativo AND public.fn_campus_dado_pessoal_permitido(v.igreja_id))
 OR (p_proprio AND EXISTS(SELECT 1 FROM public.vol_profiles p WHERE p.id=p_id AND
  (p.auth_user_id=auth.uid() OR p.membresia_id=public.current_user_membro_id())));
$$;
REVOKE ALL ON FUNCTION public.fn_vol_profile_campus_permitido(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_vol_profile_campus_permitido(uuid,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_vol_profile_proprio(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
 SELECT EXISTS(SELECT 1 FROM public.vol_profiles p WHERE p.id=p_id
  AND (p.auth_user_id=auth.uid() OR p.membresia_id=public.current_user_membro_id()));
$$;
REVOKE ALL ON FUNCTION public.fn_vol_profile_proprio(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_vol_profile_proprio(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_vol_pc_campus_permitido(p_pc text,p_proprio boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
 SELECT EXISTS(SELECT 1 FROM public.vol_profiles p WHERE p.planning_center_id=p_pc
  AND public.fn_vol_profile_campus_permitido(p.id,p_proprio));
$$;
REVOKE ALL ON FUNCTION public.fn_vol_pc_campus_permitido(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_vol_pc_campus_permitido(text,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.tg_vol_campus_ato()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_ref record; v_id uuid; v_pai uuid; v_campus uuid; j jsonb; v_schedule public.vol_schedules%ROWTYPE; v_json jsonb; k text;
BEGIN
 IF TG_TABLE_NAME='vol_check_ins' THEN
  IF NEW.schedule_id IS NOT NULL THEN
   SELECT * INTO v_schedule FROM public.vol_schedules WHERE id=NEW.schedule_id FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Escala do check-in inexistente.' USING ERRCODE='23514'; END IF;
   IF NEW.service_id IS NOT NULL AND NEW.service_id IS DISTINCT FROM v_schedule.service_id THEN
    RAISE EXCEPTION 'Check-in diverge do serviço da escala.' USING ERRCODE='23514'; END IF;
   IF NEW.volunteer_id IS NOT NULL AND NEW.volunteer_id IS DISTINCT FROM v_schedule.volunteer_id THEN
    RAISE EXCEPTION 'Check-in diverge da pessoa escalada.' USING ERRCODE='23514'; END IF;
   NEW.service_id:=v_schedule.service_id; NEW.volunteer_id:=v_schedule.volunteer_id;
  END IF;
 END IF;
 j:=to_jsonb(NEW);
 FOR v_ref IN SELECT * FROM (VALUES
  ('service_id','vol_services'),('team_id','vol_teams'),('position_id','vol_positions'),('template_id','vol_escala_templates'),
  ('template_item_id','vol_escala_template_itens'),('item_id','vol_escala_template_itens'),('escala_culto_item_id','vol_escala_culto_itens'),
  ('schedule_id','vol_schedules'),('culto_id','cultos'),('inscricao_id','vol_inscricoes'),('disparo_id','vol_email_disparos'),('next_matricula_id','next_matriculas')
 ) p(coluna,tabela) LOOP
  v_id:=NULLIF(j->>v_ref.coluna,'')::uuid; IF v_id IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE id=$1 FOR SHARE',v_ref.tabela) INTO v_json USING v_id;
  v_pai:=(v_json->>'igreja_id')::uuid;
  IF v_pai IS NULL THEN RAISE EXCEPTION 'Referência operacional do Voluntariado inexistente.' USING ERRCODE='23514'; END IF;
  IF v_campus IS NOT NULL AND v_campus IS DISTINCT FROM v_pai THEN
   RAISE EXCEPTION 'Referências de Voluntariado pertencem a campi diferentes.' USING ERRCODE='23514'; END IF;
  v_campus:=v_pai;
  -- Posição/template/escala precisam corresponder aos IDs, não só ao mesmo campus.
  IF v_ref.coluna IN('position_id','template_item_id','item_id','escala_culto_item_id','schedule_id') THEN
   FOREACH k IN ARRAY ARRAY['team_id','position_id','template_id','service_id','culto_id'] LOOP
    IF j->>k IS NOT NULL AND v_json->>k IS NOT NULL AND j->>k IS DISTINCT FROM v_json->>k THEN
     RAISE EXCEPTION 'Vínculos operacionais de Voluntariado incompatíveis.' USING ERRCODE='23514'; END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF NEW.igreja_id IS NULL THEN NEW.igreja_id:=COALESCE(v_campus,public.fn_campus_legado_escrita()); END IF;
 IF v_campus IS NOT NULL AND NEW.igreja_id IS DISTINCT FROM v_campus THEN
  RAISE EXCEPTION 'Campus do Voluntariado diverge do pai.' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
  RAISE EXCEPTION 'Campus histórico do Voluntariado não pode ser alterado.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_vol_campus_ato() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_services FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_teams FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_escala_templates FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_inscricoes FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_inscritos FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_servicos_historico FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_email_disparos FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_sync_logs FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_positions FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_team_members FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_availability FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_escala_template_tipos FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_escala_template_itens FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_escala_template_item_pessoas FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_escala_template_liderancas FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_escala_culto_itens FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_schedules FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_check_ins FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_area_supervisores FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_pco_mapa FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_email_disparo_destinatarios FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_background_checks FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.vol_training_checkins FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
CREATE TRIGGER aa_vol_campus_ato BEFORE INSERT OR UPDATE ON public.mem_voluntarios FOR EACH ROW EXECUTE FUNCTION public.tg_vol_campus_ato();
ALTER TABLE public.vol_check_ins ADD CONSTRAINT vol_check_ins_schedule_id_campus_fkey FOREIGN KEY(schedule_id,igreja_id) REFERENCES public.vol_schedules(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_check_ins ADD CONSTRAINT vol_check_ins_service_id_campus_fkey FOREIGN KEY(service_id,igreja_id) REFERENCES public.vol_services(id,igreja_id) ON DELETE SET NULL (service_id);
ALTER TABLE public.vol_email_disparo_destinatarios ADD CONSTRAINT vol_email_disparo_destinatarios_disparo_id_campus_fkey FOREIGN KEY(disparo_id,igreja_id) REFERENCES public.vol_email_disparos(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_culto_id_campus_fkey FOREIGN KEY(culto_id,igreja_id) REFERENCES public.cultos(id,igreja_id) ON DELETE SET NULL (culto_id);
ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_escala_culto_item_id_campus_fkey FOREIGN KEY(escala_culto_item_id,igreja_id) REFERENCES public.vol_escala_culto_itens(id,igreja_id) ON DELETE SET NULL (escala_culto_item_id);
ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_position_id_campus_fkey FOREIGN KEY(position_id,igreja_id) REFERENCES public.vol_positions(id,igreja_id) ON DELETE SET NULL (position_id);
ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_service_id_campus_fkey FOREIGN KEY(service_id,igreja_id) REFERENCES public.vol_services(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE SET NULL (team_id);
ALTER TABLE public.vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_position_id_campus_fkey FOREIGN KEY(position_id,igreja_id) REFERENCES public.vol_positions(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_position_id_campus_fkey FOREIGN KEY(position_id,igreja_id) REFERENCES public.vol_positions(id,igreja_id) ON DELETE SET NULL (position_id);
ALTER TABLE public.vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_positions ADD CONSTRAINT vol_positions_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_availability ADD CONSTRAINT vol_availability_service_id_campus_fkey FOREIGN KEY(service_id,igreja_id) REFERENCES public.vol_services(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_template_tipos ADD CONSTRAINT vol_escala_template_tipos_template_id_campus_fkey FOREIGN KEY(template_id,igreja_id) REFERENCES public.vol_escala_templates(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_position_id_campus_fkey FOREIGN KEY(position_id,igreja_id) REFERENCES public.vol_positions(id,igreja_id) ON DELETE SET NULL (position_id);
ALTER TABLE public.vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_template_id_campus_fkey FOREIGN KEY(template_id,igreja_id) REFERENCES public.vol_escala_templates(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_template_item_pessoas ADD CONSTRAINT vol_escala_template_item_pessoas_item_id_campus_fkey FOREIGN KEY(item_id,igreja_id) REFERENCES public.vol_escala_template_itens(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_culto_id_campus_fkey FOREIGN KEY(culto_id,igreja_id) REFERENCES public.cultos(id,igreja_id) ON DELETE SET NULL (culto_id);
ALTER TABLE public.vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_position_id_campus_fkey FOREIGN KEY(position_id,igreja_id) REFERENCES public.vol_positions(id,igreja_id) ON DELETE SET NULL (position_id);
ALTER TABLE public.vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_service_id_campus_fkey FOREIGN KEY(service_id,igreja_id) REFERENCES public.vol_services(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_template_id_campus_fkey FOREIGN KEY(template_id,igreja_id) REFERENCES public.vol_escala_templates(id,igreja_id) ON DELETE SET NULL (template_id);
ALTER TABLE public.vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_template_item_id_campus_fkey FOREIGN KEY(template_item_id,igreja_id) REFERENCES public.vol_escala_template_itens(id,igreja_id) ON DELETE SET NULL (template_item_id);
ALTER TABLE public.vol_training_checkins ADD CONSTRAINT vol_training_checkins_service_id_campus_fkey FOREIGN KEY(service_id,igreja_id) REFERENCES public.vol_services(id,igreja_id) ON DELETE SET NULL (service_id);
ALTER TABLE public.vol_background_checks ADD CONSTRAINT vol_background_checks_inscricao_id_campus_fkey FOREIGN KEY(inscricao_id,igreja_id) REFERENCES public.vol_inscricoes(id,igreja_id) ON DELETE SET NULL (inscricao_id);
ALTER TABLE public.vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_template_id_campus_fkey FOREIGN KEY(template_id,igreja_id) REFERENCES public.vol_escala_templates(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_team_members ADD CONSTRAINT vol_team_members_position_id_campus_fkey FOREIGN KEY(position_id,igreja_id) REFERENCES public.vol_positions(id,igreja_id) ON DELETE SET NULL (position_id);
ALTER TABLE public.vol_team_members ADD CONSTRAINT vol_team_members_team_id_campus_fkey FOREIGN KEY(team_id,igreja_id) REFERENCES public.vol_teams(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.vol_services ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_services AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_services AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_services AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_services AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_teams ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_teams AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_teams AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_teams AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_teams AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_escala_templates ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_escala_templates AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_escala_templates AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_escala_templates AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_escala_templates AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_inscricoes ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_inscricoes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR membro_id=public.current_user_membro_id() OR public.fn_vol_profile_proprio(vol_inscricoes.vol_profile_id));
CREATE POLICY vol_campus_insert ON public.vol_inscricoes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_inscricoes AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_inscricoes AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_inscritos ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_inscritos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR membro_id=public.current_user_membro_id() OR public.fn_vol_profile_proprio(vol_inscritos.vol_profile_id));
CREATE POLICY vol_campus_insert ON public.vol_inscritos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_inscritos AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_inscritos AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_servicos_historico ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_servicos_historico AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR membro_id=public.current_user_membro_id() OR public.fn_vol_profile_proprio(vol_servicos_historico.vol_profile_id));
CREATE POLICY vol_campus_insert ON public.vol_servicos_historico AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_servicos_historico AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_servicos_historico AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_email_disparos ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_email_disparos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_email_disparos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_email_disparos AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_email_disparos AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_sync_logs ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_sync_logs AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_sync_logs AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_sync_logs AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_sync_logs AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_positions ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_positions AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_positions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_positions AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_positions AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_team_members ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_team_members AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.fn_vol_profile_proprio(vol_team_members.volunteer_profile_id));
CREATE POLICY vol_campus_insert ON public.vol_team_members AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_team_members AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_team_members AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_availability ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_availability AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.fn_vol_profile_proprio(vol_availability.volunteer_profile_id));
CREATE POLICY vol_campus_insert ON public.vol_availability AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_availability AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_availability AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_escala_template_tipos ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_escala_template_tipos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_escala_template_tipos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_escala_template_tipos AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_escala_template_tipos AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_escala_template_itens ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_escala_template_itens AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_escala_template_itens AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_escala_template_itens AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_escala_template_itens AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_escala_template_item_pessoas ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_escala_template_item_pessoas AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.fn_vol_profile_proprio(vol_escala_template_item_pessoas.volunteer_id));
CREATE POLICY vol_campus_insert ON public.vol_escala_template_item_pessoas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_escala_template_item_pessoas AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_escala_template_item_pessoas AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_escala_template_liderancas ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_escala_template_liderancas AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_escala_template_liderancas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_escala_template_liderancas AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_escala_template_liderancas AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_escala_culto_itens ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_escala_culto_itens AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_escala_culto_itens AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_escala_culto_itens AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_escala_culto_itens AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_schedules ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_schedules AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.fn_vol_profile_proprio(vol_schedules.volunteer_id));
CREATE POLICY vol_campus_insert ON public.vol_schedules AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_schedules AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_schedules AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_check_ins ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_check_ins AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.fn_vol_profile_proprio(vol_check_ins.volunteer_id));
CREATE POLICY vol_campus_insert ON public.vol_check_ins AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_check_ins AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_check_ins AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_area_supervisores ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_area_supervisores AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR membro_id=public.current_user_membro_id());
CREATE POLICY vol_campus_insert ON public.vol_area_supervisores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_area_supervisores AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_area_supervisores AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_pco_mapa ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_pco_mapa AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_pco_mapa AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_pco_mapa AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_pco_mapa AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_email_disparo_destinatarios ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_email_disparo_destinatarios AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.fn_vol_profile_proprio(vol_email_disparo_destinatarios.vol_profile_id));
CREATE POLICY vol_campus_insert ON public.vol_email_disparo_destinatarios AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_email_disparo_destinatarios AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_email_disparo_destinatarios AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_background_checks ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_background_checks AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR membro_id=public.current_user_membro_id());
CREATE POLICY vol_campus_insert ON public.vol_background_checks AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_background_checks AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_background_checks AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_training_checkins ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.vol_training_checkins AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_insert ON public.vol_training_checkins AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.vol_training_checkins AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.vol_training_checkins AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.mem_voluntarios ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_select ON public.mem_voluntarios AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR membro_id=public.current_user_membro_id());
CREATE POLICY vol_campus_insert ON public.mem_voluntarios AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_update ON public.mem_voluntarios AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY vol_campus_delete ON public.mem_voluntarios AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.vol_profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_identidade ON public.vol_profiles AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_profile_campus_permitido(id,true)) WITH CHECK(public.fn_vol_profile_campus_permitido(id,true));
ALTER TABLE public.vol_user_roles ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_identidade ON public.vol_user_roles AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_profile_campus_permitido(profile_id,true)) WITH CHECK(public.fn_vol_profile_campus_permitido(profile_id,true));
ALTER TABLE public.vol_volunteer_qrcodes ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_identidade ON public.vol_volunteer_qrcodes AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_pc_campus_permitido(planning_center_person_id,true)) WITH CHECK(public.fn_vol_pc_campus_permitido(planning_center_person_id,true));
ALTER TABLE public.vol_parabens ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_identidade ON public.vol_parabens AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_profile_campus_permitido(vol_profile_id,true)) WITH CHECK(public.fn_vol_profile_campus_permitido(vol_profile_id,true));
ALTER TABLE public.vol_vinculo_snapshot_20260818 ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_identidade ON public.vol_vinculo_snapshot_20260818 AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_profile_campus_permitido(vol_profile_id,true)) WITH CHECK(public.fn_vol_profile_campus_permitido(vol_profile_id,true));
ALTER TABLE public.vol_profile_campi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vol_profile_campi FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vol_profile_campi TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.vol_profile_campi TO service_role;
CREATE POLICY vol_vinculo_campus_leitura ON public.vol_profile_campi FOR SELECT TO authenticated
 USING((public.current_user_module_level('voluntariado')>=1 AND public.fn_campus_dado_pessoal_permitido(igreja_id))
 OR public.fn_vol_profile_proprio(profile_id));
-- Inatividade usa chave polimórfica legada; não inferir a identidade nem unidade.
-- Config/assinatura são singletons. Permanecem bloqueados fora de preparação.
CREATE OR REPLACE FUNCTION public.fn_vol_legado_em_preparacao()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT estado='preparacao' AND NOT ja_ativado FROM public.app_campus_config WHERE id),false);
$$;
REVOKE ALL ON FUNCTION public.fn_vol_legado_em_preparacao() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_vol_legado_em_preparacao() TO authenticated,service_role;

ALTER TABLE public.vol_inatividade ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_pendente ON public.vol_inatividade AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_legado_em_preparacao()) WITH CHECK(public.fn_vol_legado_em_preparacao());
ALTER TABLE public.vol_config ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_pendente ON public.vol_config AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_legado_em_preparacao()) WITH CHECK(public.fn_vol_legado_em_preparacao());
ALTER TABLE public.vol_email_config ENABLE ROW LEVEL SECURITY; CREATE POLICY vol_campus_pendente ON public.vol_email_config AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_vol_legado_em_preparacao()) WITH CHECK(public.fn_vol_legado_em_preparacao());
UPDATE public.app_campus_cobertura SET rls_validada=false,api_validada=false,produtores_validados=false,regressao_validada=false WHERE frente IN('voluntariado','pessoas','indicadores','jobs-notificacoes');
COMMIT;

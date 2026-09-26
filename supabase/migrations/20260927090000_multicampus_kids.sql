-- Kids: identidade única, vínculos explícitos e campus histórico dos atos.
-- Estrutura e funções conferidas no catálogo vivo; nenhuma ativação implícita.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
 OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
  RAISE EXCEPTION 'Backfill Kids exige preparação e uma única Sede ativa.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.kids_salas WHERE igreja_id IS NOT NULL AND igreja_id<>public.fn_campus_legado_escrita())
 OR EXISTS(SELECT 1 FROM public.kids_pagers WHERE igreja_id IS NOT NULL AND igreja_id<>public.fn_campus_legado_escrita())
 OR EXISTS(SELECT 1 FROM public.totem_estacoes WHERE igreja_id IS NOT NULL AND igreja_id<>public.fn_campus_legado_escrita()) THEN
  RAISE EXCEPTION 'Raízes Kids fora da Sede exigem reconciliação histórica antes do backfill.';
 END IF;
END $$;
CREATE TABLE public.kids_crianca_campi(
 crianca_id uuid NOT NULL REFERENCES public.kids_criancas(id) ON DELETE CASCADE,
 igreja_id uuid NOT NULL REFERENCES public.igrejas(id),
 ativo boolean NOT NULL DEFAULT true,
 criado_em timestamptz NOT NULL DEFAULT now(),
 criado_por uuid REFERENCES public.profiles(id),
 PRIMARY KEY(crianca_id,igreja_id)
);
-- PK composta: desativa vínculo por ativo=false; não duplica identidade infantil
-- nem oferece app_soft_delete por id inexistente. Não concede cadastro global.
CREATE INDEX kids_crianca_campi_campus_ativo ON public.kids_crianca_campi(igreja_id,crianca_id) WHERE ativo;

UPDATE public.kids_salas SET igreja_id=public.fn_campus_legado_escrita() WHERE igreja_id IS NULL;
UPDATE public.kids_pagers SET igreja_id=public.fn_campus_legado_escrita() WHERE igreja_id IS NULL;
UPDATE public.totem_estacoes SET igreja_id=public.fn_campus_legado_escrita() WHERE igreja_id IS NULL;
ALTER TABLE public.kids_estacoes ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_sessoes ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_checkins ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_chamadas ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_etiquetas_log ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_pager_envios ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_portao_scans ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_codigos_reservados ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_pco_presencas ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_atendimentos ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_conversoes_import ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_pre_checkins ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.kids_vinculo_solicitacoes ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.kids_estacoes x SET igreja_id=COALESCE((SELECT igreja_id FROM public.kids_salas p WHERE p.id=x.sala_id),public.fn_campus_legado_escrita());
UPDATE public.kids_sessoes x SET igreja_id=COALESCE((SELECT igreja_id FROM public.cultos p WHERE p.id=x.culto_id),public.fn_campus_legado_escrita());
UPDATE public.kids_checkins x SET igreja_id=COALESCE((SELECT igreja_id FROM public.kids_sessoes p WHERE p.id=x.sessao_id),public.fn_campus_legado_escrita());
UPDATE public.kids_chamadas x SET igreja_id=COALESCE((SELECT igreja_id FROM public.kids_checkins p WHERE p.id=x.checkin_id),public.fn_campus_legado_escrita());
UPDATE public.kids_etiquetas_log x SET igreja_id=COALESCE((SELECT igreja_id FROM public.kids_checkins p WHERE p.id=x.checkin_id),public.fn_campus_legado_escrita());
UPDATE public.kids_pager_envios x SET igreja_id=COALESCE((SELECT igreja_id FROM public.kids_checkins p WHERE p.id=x.checkin_id),public.fn_campus_legado_escrita());
UPDATE public.kids_portao_scans x SET igreja_id=COALESCE((SELECT igreja_id FROM public.kids_checkins p WHERE p.id=x.checkin_id),public.fn_campus_legado_escrita());
UPDATE public.kids_codigos_reservados x SET igreja_id=COALESCE((SELECT igreja_id FROM public.kids_sessoes p WHERE p.id=x.sessao_id),public.fn_campus_legado_escrita());
UPDATE public.kids_pco_presencas x SET igreja_id=COALESCE((SELECT igreja_id FROM public.cultos p WHERE p.id=x.culto_id),public.fn_campus_legado_escrita());
UPDATE public.kids_atendimentos SET igreja_id=public.fn_campus_legado_escrita();
UPDATE public.kids_conversoes_import x SET igreja_id=COALESCE((SELECT igreja_id FROM public.cultos p WHERE p.id=x.culto_id),public.fn_campus_legado_escrita());
UPDATE public.kids_pre_checkins SET igreja_id=public.fn_campus_legado_escrita();
UPDATE public.kids_vinculo_solicitacoes SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.kids_salas ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_salas_campus_idx ON public.kids_salas(igreja_id);
ALTER TABLE public.kids_salas ADD CONSTRAINT kids_salas_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_pagers ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_pagers_campus_idx ON public.kids_pagers(igreja_id);
ALTER TABLE public.kids_pagers ADD CONSTRAINT kids_pagers_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.totem_estacoes ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX totem_estacoes_campus_idx ON public.totem_estacoes(igreja_id);
ALTER TABLE public.totem_estacoes ADD CONSTRAINT totem_estacoes_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_estacoes ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_estacoes_campus_idx ON public.kids_estacoes(igreja_id);
ALTER TABLE public.kids_estacoes ADD CONSTRAINT kids_estacoes_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_sessoes ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_sessoes_campus_idx ON public.kids_sessoes(igreja_id);
ALTER TABLE public.kids_sessoes ADD CONSTRAINT kids_sessoes_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_checkins ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_checkins_campus_idx ON public.kids_checkins(igreja_id);
ALTER TABLE public.kids_checkins ADD CONSTRAINT kids_checkins_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_chamadas ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_chamadas_campus_idx ON public.kids_chamadas(igreja_id);
ALTER TABLE public.kids_chamadas ADD CONSTRAINT kids_chamadas_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_etiquetas_log ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_etiquetas_log_campus_idx ON public.kids_etiquetas_log(igreja_id);
ALTER TABLE public.kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_pager_envios ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_pager_envios_campus_idx ON public.kids_pager_envios(igreja_id);
ALTER TABLE public.kids_pager_envios ADD CONSTRAINT kids_pager_envios_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_portao_scans ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_portao_scans_campus_idx ON public.kids_portao_scans(igreja_id);
ALTER TABLE public.kids_portao_scans ADD CONSTRAINT kids_portao_scans_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_codigos_reservados ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_codigos_reservados_campus_idx ON public.kids_codigos_reservados(igreja_id);
ALTER TABLE public.kids_pco_presencas ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_pco_presencas_campus_idx ON public.kids_pco_presencas(igreja_id);
ALTER TABLE public.kids_pco_presencas ADD CONSTRAINT kids_pco_presencas_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_atendimentos ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_atendimentos_campus_idx ON public.kids_atendimentos(igreja_id);
ALTER TABLE public.kids_atendimentos ADD CONSTRAINT kids_atendimentos_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_conversoes_import ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_conversoes_import_campus_idx ON public.kids_conversoes_import(igreja_id);
ALTER TABLE public.kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_pre_checkins ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_pre_checkins_campus_idx ON public.kids_pre_checkins(igreja_id);
ALTER TABLE public.kids_pre_checkins ADD CONSTRAINT kids_pre_checkins_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_vinculo_solicitacoes ALTER COLUMN igreja_id SET NOT NULL, ALTER COLUMN igreja_id DROP DEFAULT; CREATE INDEX kids_vinculo_solicitacoes_campus_idx ON public.kids_vinculo_solicitacoes(igreja_id);
ALTER TABLE public.kids_vinculo_solicitacoes ADD CONSTRAINT kids_vinculo_solicitacoes_id_campus_key UNIQUE(id,igreja_id);
-- Só fatos de presença/atendimento comprovam vínculo histórico. Crianças sem
-- atos ficam disponíveis no legado em preparação e exigem reconciliação explícita
-- antes de ativar; jamais inferir unidade pelo responsável ou família.
INSERT INTO public.kids_crianca_campi(crianca_id,igreja_id)
 SELECT crianca_id,igreja_id FROM public.kids_checkins
 UNION SELECT crianca_id,igreja_id FROM public.kids_pco_presencas
 UNION SELECT crianca_id,igreja_id FROM public.kids_atendimentos
 ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.fn_kids_crianca_campus_permitido(p_crianca_id uuid,p_leitura boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
 SELECT COALESCE((SELECT estado='preparacao' AND NOT ja_ativado FROM public.app_campus_config WHERE id),false)
 OR EXISTS(SELECT 1 FROM public.kids_crianca_campi v WHERE v.crianca_id=p_crianca_id AND v.ativo
   AND public.fn_campus_dado_pessoal_permitido(v.igreja_id))
 OR (p_leitura AND public.user_is_kids_responsavel(p_crianca_id));
$$;
REVOKE ALL ON FUNCTION public.fn_kids_crianca_campus_permitido(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_kids_crianca_campus_permitido(uuid,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.fn_kids_ref_permitido(p_tipo text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid; BEGIN
 CASE p_tipo
 WHEN 'sala' THEN SELECT igreja_id INTO v FROM public.kids_salas WHERE id=p_id;
 WHEN 'estacao' THEN SELECT igreja_id INTO v FROM public.kids_estacoes WHERE id=p_id;
 WHEN 'sessao' THEN SELECT igreja_id INTO v FROM public.kids_sessoes WHERE id=p_id;
 WHEN 'checkin' THEN SELECT igreja_id INTO v FROM public.kids_checkins WHERE id=p_id;
 WHEN 'chamada' THEN SELECT igreja_id INTO v FROM public.kids_chamadas WHERE id=p_id;
 WHEN 'pager' THEN SELECT igreja_id INTO v FROM public.kids_pagers WHERE id=p_id;
 WHEN 'totem' THEN SELECT igreja_id INTO v FROM public.totem_estacoes WHERE id=p_id;
 ELSE RETURN false;
 END CASE; RETURN COALESCE(public.fn_campus_dado_pessoal_permitido(v),false);
END $$;
-- Helper fechado retorna apenas autorização; não expõe o campus de um ato oculto.
REVOKE ALL ON FUNCTION public.fn_kids_ref_permitido(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_kids_ref_permitido(text,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.tg_kids_campus_ato()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_campus uuid; v_parent uuid; v_id uuid; v_ref record; j jsonb:=to_jsonb(NEW); v_check public.kids_checkins%ROWTYPE;
BEGIN
 -- Cada referência operacional tem campus próprio. Criança/responsável continuam globais.
 FOR v_ref IN SELECT * FROM (VALUES
  ('sala_id','kids_salas'),('estacao_id','kids_estacoes'),('estacao_checkin_id','kids_estacoes'),('estacao_origem_id','kids_estacoes'),
  ('sessao_id','kids_sessoes'),('checkin_id','kids_checkins'),('chamada_id','kids_chamadas'),('pager_id','kids_pagers'),
  ('culto_id','cultos'),('decisao_id','cultos_decisoes_pessoas')
 ) p(coluna,tabela) LOOP
  v_id:=NULLIF(j->>v_ref.coluna,'')::uuid;
  IF v_id IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT igreja_id FROM public.%I WHERE id=$1 FOR SHARE',v_ref.tabela) INTO v_parent USING v_id;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'Referência operacional Kids inexistente.' USING ERRCODE='23514'; END IF;
  IF v_campus IS NOT NULL AND v_campus IS DISTINCT FROM v_parent THEN
   RAISE EXCEPTION 'Referências Kids pertencem a campi diferentes.' USING ERRCODE='23514';
  END IF;
  v_campus:=v_parent;
 END LOOP;
 IF NEW.igreja_id IS NULL THEN NEW.igreja_id:=COALESCE(v_campus,public.fn_campus_legado_escrita()); END IF;
 IF v_campus IS NOT NULL AND v_campus IS DISTINCT FROM NEW.igreja_id THEN
  RAISE EXCEPTION 'Campus Kids diverge do pai operacional.' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
  RAISE EXCEPTION 'O campus histórico Kids não pode ser alterado.' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='kids_checkins' THEN
  IF TG_OP='INSERT' OR NEW.responsavel_checkin_id IS DISTINCT FROM OLD.responsavel_checkin_id THEN
   IF NEW.responsavel_checkin_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.kids_responsaveis WHERE crianca_id=NEW.crianca_id
      AND membro_id=NEW.responsavel_checkin_id AND autorizado_buscar) THEN
     RAISE EXCEPTION 'Responsável não autorizado para a criança Kids.' USING ERRCODE='23514'; END IF;
   ELSIF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado) THEN
    RAISE EXCEPTION 'Check-in Kids exige responsável canônico autorizado.' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='kids_checkins' AND TG_OP='UPDATE' THEN
  IF NEW.sessao_id IS DISTINCT FROM OLD.sessao_id OR NEW.crianca_id IS DISTINCT FROM OLD.crianca_id THEN
   RAISE EXCEPTION 'Sessão e criança do check-in são históricas.' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='kids_pager_envios' THEN
  IF NEW.chamada_id IS NOT NULL AND NEW.checkin_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.kids_chamadas WHERE id=NEW.chamada_id AND checkin_id=NEW.checkin_id) THEN
   RAISE EXCEPTION 'Envio de pager diverge da chamada.' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='kids_pre_checkins' THEN
  IF NEW.checkin_ids IS NOT NULL AND EXISTS(SELECT 1 FROM unnest(NEW.checkin_ids) AS listed(checkin_id)
    LEFT JOIN public.kids_checkins k ON k.id=listed.checkin_id
    WHERE k.id IS NULL OR k.igreja_id<>NEW.igreja_id OR NOT(k.crianca_id=ANY(NEW.crianca_ids))) THEN
   RAISE EXCEPTION 'Pré-check-in contém check-ins incompatíveis.' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='kids_chamadas' THEN
  IF TG_OP='INSERT' OR NEW.checkin_id IS DISTINCT FROM OLD.checkin_id OR NEW.sessao_id IS DISTINCT FROM OLD.sessao_id
    OR NEW.crianca_id IS DISTINCT FROM OLD.crianca_id OR NEW.sala_id IS DISTINCT FROM OLD.sala_id THEN
  SELECT * INTO v_check FROM public.kids_checkins WHERE id=NEW.checkin_id;
  IF NEW.sessao_id IS DISTINCT FROM v_check.sessao_id OR NEW.crianca_id IS DISTINCT FROM v_check.crianca_id
   OR NEW.sala_id IS DISTINCT FROM v_check.sala_id THEN
   RAISE EXCEPTION 'Chamada Kids diverge do check-in.' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_kids_campus_ato() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_salas FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_pagers FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.totem_estacoes FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_estacoes FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_sessoes FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_checkins FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_chamadas FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_etiquetas_log FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_pager_envios FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_portao_scans FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_codigos_reservados FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_pco_presencas FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_atendimentos FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_conversoes_import FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_pre_checkins FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
CREATE TRIGGER aa_kids_campus_ato BEFORE INSERT OR UPDATE ON public.kids_vinculo_solicitacoes FOR EACH ROW EXECUTE FUNCTION public.tg_kids_campus_ato();
ALTER TABLE public.cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_id_campus_key UNIQUE(id,igreja_id);
ALTER TABLE public.kids_portao_scans ADD CONSTRAINT kids_portao_scans_checkin_id_campus_fkey FOREIGN KEY(checkin_id,igreja_id) REFERENCES public.kids_checkins(id,igreja_id) ON DELETE SET NULL (checkin_id);
ALTER TABLE public.kids_checkins ADD CONSTRAINT kids_checkins_estacao_checkin_id_campus_fkey FOREIGN KEY(estacao_checkin_id,igreja_id) REFERENCES public.kids_estacoes(id,igreja_id);
ALTER TABLE public.kids_checkins ADD CONSTRAINT kids_checkins_pager_id_campus_fkey FOREIGN KEY(pager_id,igreja_id) REFERENCES public.kids_pagers(id,igreja_id) ON DELETE SET NULL (pager_id);
ALTER TABLE public.kids_checkins ADD CONSTRAINT kids_checkins_sala_id_campus_fkey FOREIGN KEY(sala_id,igreja_id) REFERENCES public.kids_salas(id,igreja_id);
ALTER TABLE public.kids_checkins ADD CONSTRAINT kids_checkins_sessao_id_campus_fkey FOREIGN KEY(sessao_id,igreja_id) REFERENCES public.kids_sessoes(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.kids_pager_envios ADD CONSTRAINT kids_pager_envios_chamada_id_campus_fkey FOREIGN KEY(chamada_id,igreja_id) REFERENCES public.kids_chamadas(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.kids_pager_envios ADD CONSTRAINT kids_pager_envios_checkin_id_campus_fkey FOREIGN KEY(checkin_id,igreja_id) REFERENCES public.kids_checkins(id,igreja_id) ON DELETE SET NULL (checkin_id);
ALTER TABLE public.kids_pager_envios ADD CONSTRAINT kids_pager_envios_pager_id_campus_fkey FOREIGN KEY(pager_id,igreja_id) REFERENCES public.kids_pagers(id,igreja_id) ON DELETE SET NULL (pager_id);
ALTER TABLE public.kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_culto_id_campus_fkey FOREIGN KEY(culto_id,igreja_id) REFERENCES public.cultos(id,igreja_id) ON DELETE SET NULL (culto_id);
ALTER TABLE public.kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_decisao_id_campus_fkey FOREIGN KEY(decisao_id,igreja_id) REFERENCES public.cultos_decisoes_pessoas(id,igreja_id) ON DELETE SET NULL (decisao_id);
ALTER TABLE public.kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_checkin_id_campus_fkey FOREIGN KEY(checkin_id,igreja_id) REFERENCES public.kids_checkins(id,igreja_id) ON DELETE SET NULL (checkin_id);
ALTER TABLE public.kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_estacao_id_campus_fkey FOREIGN KEY(estacao_id,igreja_id) REFERENCES public.kids_estacoes(id,igreja_id) ON DELETE SET NULL (estacao_id);
ALTER TABLE public.kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_sessao_id_campus_fkey FOREIGN KEY(sessao_id,igreja_id) REFERENCES public.kids_sessoes(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.kids_pco_presencas ADD CONSTRAINT kids_pco_presencas_culto_id_campus_fkey FOREIGN KEY(culto_id,igreja_id) REFERENCES public.cultos(id,igreja_id) ON DELETE SET NULL (culto_id);
ALTER TABLE public.kids_estacoes ADD CONSTRAINT kids_estacoes_sala_id_campus_fkey FOREIGN KEY(sala_id,igreja_id) REFERENCES public.kids_salas(id,igreja_id);
ALTER TABLE public.kids_sessoes ADD CONSTRAINT kids_sessoes_culto_id_campus_fkey FOREIGN KEY(culto_id,igreja_id) REFERENCES public.cultos(id,igreja_id) ON DELETE SET NULL (culto_id);
ALTER TABLE public.kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_checkin_id_campus_fkey FOREIGN KEY(checkin_id,igreja_id) REFERENCES public.kids_checkins(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_estacao_id_campus_fkey FOREIGN KEY(estacao_id,igreja_id) REFERENCES public.kids_estacoes(id,igreja_id);
ALTER TABLE public.kids_chamadas ADD CONSTRAINT kids_chamadas_checkin_id_campus_fkey FOREIGN KEY(checkin_id,igreja_id) REFERENCES public.kids_checkins(id,igreja_id) ON DELETE CASCADE;
ALTER TABLE public.kids_chamadas ADD CONSTRAINT kids_chamadas_estacao_origem_id_campus_fkey FOREIGN KEY(estacao_origem_id,igreja_id) REFERENCES public.kids_estacoes(id,igreja_id);
ALTER TABLE public.kids_chamadas ADD CONSTRAINT kids_chamadas_sala_id_campus_fkey FOREIGN KEY(sala_id,igreja_id) REFERENCES public.kids_salas(id,igreja_id);
ALTER TABLE public.kids_chamadas ADD CONSTRAINT kids_chamadas_sessao_id_campus_fkey FOREIGN KEY(sessao_id,igreja_id) REFERENCES public.kids_sessoes(id,igreja_id) ON DELETE CASCADE;
-- Nomes de sala/estação e códigos continuam globalmente únicos até revisar
-- consumidores que resolvem por nome/código sem campus. Não fazer cutover implícito.
CREATE OR REPLACE FUNCTION public.tg_kids_exigir_vinculo_crianca()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_ids uuid[];
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW)->'crianca_id' IS NOT DISTINCT FROM to_jsonb(OLD)->'crianca_id'
  AND to_jsonb(NEW)->'crianca_ids' IS NOT DISTINCT FROM to_jsonb(OLD)->'crianca_ids'
  AND NEW.igreja_id IS NOT DISTINCT FROM OLD.igreja_id THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='kids_pre_checkins' THEN v_ids:=NEW.crianca_ids;
 ELSE v_ids:=ARRAY[NEW.crianca_id]; END IF;
 FOREACH v_id IN ARRAY v_ids LOOP
  IF v_id IS NULL THEN RAISE EXCEPTION 'Criança Kids obrigatória.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.kids_crianca_campi WHERE crianca_id=v_id AND igreja_id=NEW.igreja_id AND ativo) THEN
   IF EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
     AND TG_TABLE_NAME IN ('kids_checkins','kids_pco_presencas','kids_atendimentos') THEN
    -- Novo ato legado é evidência de participação, ao contrário de parentesco.
    INSERT INTO public.kids_crianca_campi(crianca_id,igreja_id) VALUES(v_id,NEW.igreja_id)
      ON CONFLICT DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.kids_crianca_campi WHERE crianca_id=v_id AND igreja_id=NEW.igreja_id AND ativo) THEN
     RAISE EXCEPTION 'Vínculo Kids desativado.' USING ERRCODE='23514'; END IF;
   ELSE RAISE EXCEPTION 'Criança sem vínculo ativo com o campus Kids.' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_kids_exigir_vinculo_crianca() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER ab_kids_vinculo_crianca BEFORE INSERT OR UPDATE ON public.kids_checkins FOR EACH ROW EXECUTE FUNCTION public.tg_kids_exigir_vinculo_crianca();
CREATE TRIGGER ab_kids_vinculo_crianca BEFORE INSERT OR UPDATE ON public.kids_pco_presencas FOR EACH ROW EXECUTE FUNCTION public.tg_kids_exigir_vinculo_crianca();
CREATE TRIGGER ab_kids_vinculo_crianca BEFORE INSERT OR UPDATE ON public.kids_atendimentos FOR EACH ROW EXECUTE FUNCTION public.tg_kids_exigir_vinculo_crianca();
CREATE TRIGGER ab_kids_vinculo_crianca BEFORE INSERT OR UPDATE ON public.kids_pre_checkins FOR EACH ROW EXECUTE FUNCTION public.tg_kids_exigir_vinculo_crianca();
ALTER TABLE public.kids_criancas ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_identidade_select ON public.kids_criancas AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_kids_crianca_campus_permitido(id,true));
CREATE POLICY kids_campus_identidade_insert ON public.kids_criancas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_kids_crianca_campus_permitido(id,true));
CREATE POLICY kids_campus_identidade_update ON public.kids_criancas AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_kids_crianca_campus_permitido(id,true)) WITH CHECK(public.fn_kids_crianca_campus_permitido(id,true));
CREATE POLICY kids_campus_identidade_delete ON public.kids_criancas AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_kids_crianca_campus_permitido(id,true));
ALTER TABLE public.kids_responsaveis ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_identidade_select ON public.kids_responsaveis AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_kids_crianca_campus_permitido(crianca_id,true));
CREATE POLICY kids_campus_identidade_insert ON public.kids_responsaveis AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_kids_crianca_campus_permitido(crianca_id,true));
CREATE POLICY kids_campus_identidade_update ON public.kids_responsaveis AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_kids_crianca_campus_permitido(crianca_id,true)) WITH CHECK(public.fn_kids_crianca_campus_permitido(crianca_id,true));
CREATE POLICY kids_campus_identidade_delete ON public.kids_responsaveis AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_kids_crianca_campus_permitido(crianca_id,true));
ALTER TABLE public.kids_salas ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_salas AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_salas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_salas AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_salas AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_pagers ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_pagers AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_pagers AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_pagers AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_pagers AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.totem_estacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.totem_estacoes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.totem_estacoes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.totem_estacoes AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.totem_estacoes AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_estacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_estacoes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_estacoes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_estacoes AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_estacoes AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_sessoes ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_sessoes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_sessoes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_sessoes AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_sessoes AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_checkins ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_checkins AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.user_is_kids_responsavel(crianca_id));
CREATE POLICY kids_campus_insert ON public.kids_checkins AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_checkins AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_checkins AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_chamadas ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_chamadas AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_chamadas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_chamadas AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_chamadas AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_etiquetas_log ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_etiquetas_log AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_etiquetas_log AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_etiquetas_log AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_etiquetas_log AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_pager_envios ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_pager_envios AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_pager_envios AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_pager_envios AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_pager_envios AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_portao_scans ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_portao_scans AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_portao_scans AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_portao_scans AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_portao_scans AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_codigos_reservados ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_codigos_reservados AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_codigos_reservados AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_codigos_reservados AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_codigos_reservados AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_pco_presencas ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_pco_presencas AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.user_is_kids_responsavel(crianca_id));
CREATE POLICY kids_campus_insert ON public.kids_pco_presencas AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_pco_presencas AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_pco_presencas AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_atendimentos ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_atendimentos AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR public.user_is_kids_responsavel(crianca_id));
CREATE POLICY kids_campus_insert ON public.kids_atendimentos AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_atendimentos AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_atendimentos AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_conversoes_import ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_conversoes_import AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_insert ON public.kids_conversoes_import AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_conversoes_import AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_conversoes_import AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_pre_checkins ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_pre_checkins AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR responsavel_membro_id=public.current_user_membro_id());
CREATE POLICY kids_campus_insert ON public.kids_pre_checkins AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_pre_checkins AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_pre_checkins AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_vinculo_solicitacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_select ON public.kids_vinculo_solicitacoes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR solicitante_membro_id=public.current_user_membro_id());
CREATE POLICY kids_campus_insert ON public.kids_vinculo_solicitacoes AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_update ON public.kids_vinculo_solicitacoes AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY kids_campus_delete ON public.kids_vinculo_solicitacoes AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
ALTER TABLE public.kids_sala_voluntarios ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_pai ON public.kids_sala_voluntarios AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_kids_ref_permitido('sala',sala_id)) WITH CHECK(public.fn_kids_ref_permitido('sala',sala_id));
ALTER TABLE public.kids_estoque ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_pai ON public.kids_estoque AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_kids_ref_permitido('sala',sala_id)) WITH CHECK(public.fn_kids_ref_permitido('sala',sala_id));
ALTER TABLE public.totem_estacao_tokens ENABLE ROW LEVEL SECURITY; CREATE POLICY kids_campus_pai ON public.totem_estacao_tokens AS RESTRICTIVE FOR ALL TO authenticated USING(public.fn_kids_ref_permitido('totem',estacao_id)) WITH CHECK(public.fn_kids_ref_permitido('totem',estacao_id));
ALTER TABLE public.kids_crianca_campi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kids_crianca_campi FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.kids_crianca_campi TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.kids_crianca_campi TO service_role;
CREATE POLICY kids_vinculo_campus_leitura ON public.kids_crianca_campi FOR SELECT TO authenticated
 USING((public.current_user_module_level('kids')>=1 AND public.fn_campus_dado_pessoal_permitido(igreja_id))
 OR public.user_is_kids_responsavel(crianca_id));
-- Singleton de senha/PIN e layout não tem origem local. Até migrar seus
-- consumidores, autenticados não recebem configuração ambígua após ativação.
CREATE OR REPLACE FUNCTION public.fn_kids_legado_em_preparacao()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT estado='preparacao' AND NOT ja_ativado FROM public.app_campus_config WHERE id),false);
$$;
REVOKE ALL ON FUNCTION public.fn_kids_legado_em_preparacao() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_kids_legado_em_preparacao() TO authenticated,service_role;
CREATE POLICY kids_config_legado_guard ON public.kids_totem_config AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.fn_kids_legado_em_preparacao()) WITH CHECK(public.fn_kids_legado_em_preparacao());
CREATE POLICY kids_config_legado_guard ON public.kids_etiqueta_config AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.fn_kids_legado_em_preparacao()) WITH CHECK(public.fn_kids_legado_em_preparacao());
UPDATE public.app_campus_cobertura SET rls_validada=false,api_validada=false,produtores_validados=false,regressao_validada=false WHERE frente IN('kids','portas-publicas','jobs-notificacoes');
COMMIT;

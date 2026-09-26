-- Preparação aditiva do batismo. PK(data) e horário global ficam preservados:
-- o cutover só poderá ocorrer depois de adaptar TODOS os consumidores legados.
-- Catálogo vivo: nenhuma FK/view aponta para batismo_eventos; RPC legada lê data.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
    OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
    RAISE EXCEPTION 'Backfill do batismo exige preparação e uma única Sede ativa.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.batismo_inscricoes WHERE igreja_id IS NOT NULL AND igreja_id<>public.fn_campus_legado_escrita()) THEN
    RAISE EXCEPTION 'Batismos fora da Sede exigem reconciliação antes do backfill.';
  END IF;
END $$;
ALTER TABLE public.batismo_eventos ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id), ADD CONSTRAINT batismo_eventos_id_key UNIQUE(id);
ALTER TABLE public.batismo_horarios ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
ALTER TABLE public.batismo_inscricoes ADD COLUMN evento_id uuid REFERENCES public.batismo_eventos(id),
  ADD COLUMN horario_id uuid REFERENCES public.batismo_horarios(id);
UPDATE public.batismo_eventos SET igreja_id=public.fn_campus_legado_escrita();
UPDATE public.batismo_horarios SET igreja_id=public.fn_campus_legado_escrita();
UPDATE public.batismo_inscricoes SET igreja_id=public.fn_campus_legado_escrita() WHERE igreja_id IS NULL;
UPDATE public.batismo_inscricoes i SET evento_id=e.id FROM public.batismo_eventos e
  WHERE e.igreja_id=i.igreja_id AND e.data=i.data_batismo;
UPDATE public.batismo_inscricoes i SET horario_id=h.id FROM public.batismo_horarios h
  WHERE h.igreja_id=i.igreja_id AND h.horario=i.horario_culto AND h.deleted_at IS NULL;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['batismo_eventos','batismo_horarios','batismo_inscricoes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN igreja_id SET NOT NULL',t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN igreja_id DROP DEFAULT',t);
  END LOOP;
END $$;
ALTER TABLE public.batismo_eventos ADD CONSTRAINT batismo_eventos_campus_data_key UNIQUE(igreja_id,data);
CREATE UNIQUE INDEX uq_batismo_horarios_campus_horario ON public.batismo_horarios(igreja_id,horario) WHERE deleted_at IS NULL;
CREATE INDEX batismo_inscricoes_campus_evento_horario ON public.batismo_inscricoes(igreja_id,evento_id,horario_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_batismo_campus_raiz()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
  IF NEW.igreja_id IS NULL THEN NEW.igreja_id:=public.fn_campus_legado_escrita(); END IF;
  IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'O campus histórico do batismo não pode ser alterado.' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='batismo_eventos' AND TG_OP='UPDATE' THEN
   IF NEW.data IS DISTINCT FROM OLD.data
    AND EXISTS(SELECT 1 FROM public.batismo_inscricoes WHERE evento_id=OLD.id) THEN
    RAISE EXCEPTION 'Evento com inscrições exige remarcação explícita das inscrições.' USING ERRCODE='23514';
   END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aa_batismo_campus BEFORE INSERT OR UPDATE ON public.batismo_eventos FOR EACH ROW EXECUTE FUNCTION public.tg_batismo_campus_raiz();
CREATE TRIGGER aa_batismo_campus BEFORE INSERT OR UPDATE ON public.batismo_horarios FOR EACH ROW EXECUTE FUNCTION public.tg_batismo_campus_raiz();

CREATE OR REPLACE FUNCTION public.tg_batismo_campus_inscricao()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE e public.batismo_eventos%ROWTYPE; h public.batismo_horarios%ROWTYPE;
BEGIN
  -- Atualizações dos campos legados continuam aceitas quando o ID não foi editado.
  IF TG_OP='UPDATE' THEN
    IF NEW.data_batismo IS DISTINCT FROM OLD.data_batismo AND NEW.evento_id IS NOT DISTINCT FROM OLD.evento_id THEN NEW.evento_id:=NULL; END IF;
    IF NEW.horario_culto IS DISTINCT FROM OLD.horario_culto AND NEW.horario_id IS NOT DISTINCT FROM OLD.horario_id THEN NEW.horario_id:=NULL; END IF;
  END IF;
  IF NEW.evento_id IS NOT NULL THEN
    SELECT * INTO e FROM public.batismo_eventos WHERE id=NEW.evento_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evento de batismo inexistente.' USING ERRCODE='23514'; END IF;
    IF NEW.igreja_id IS NOT NULL AND NEW.igreja_id<>e.igreja_id THEN RAISE EXCEPTION 'Campus da inscrição diverge do evento.' USING ERRCODE='23514'; END IF;
    IF NEW.data_batismo IS NOT NULL AND NEW.data_batismo<>e.data THEN RAISE EXCEPTION 'Data da inscrição diverge do evento.' USING ERRCODE='23514'; END IF;
    NEW.igreja_id:=e.igreja_id; NEW.data_batismo:=e.data;
  ELSE
    IF NEW.igreja_id IS NULL THEN NEW.igreja_id:=public.fn_campus_legado_escrita(); END IF;
    IF NEW.data_batismo IS NOT NULL THEN
      SELECT * INTO e FROM public.batismo_eventos WHERE igreja_id=NEW.igreja_id AND data=NEW.data_batismo FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Data de batismo não cadastrada neste campus.' USING ERRCODE='23514'; END IF;
      NEW.evento_id:=e.id;
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'O campus histórico da inscrição não pode ser alterado.' USING ERRCODE='23514';
  END IF;
  IF NEW.horario_id IS NOT NULL THEN
    SELECT * INTO h FROM public.batismo_horarios WHERE id=NEW.horario_id FOR SHARE;
    IF NOT FOUND OR h.igreja_id<>NEW.igreja_id THEN RAISE EXCEPTION 'Horário de outro campus ou inexistente.' USING ERRCODE='23514'; END IF;
    IF NEW.horario_culto IS NOT NULL AND NEW.horario_culto<>h.horario THEN RAISE EXCEPTION 'Horário da inscrição diverge do catálogo.' USING ERRCODE='23514'; END IF;
    NEW.horario_culto:=h.horario;
  ELSIF NEW.horario_culto IS NOT NULL THEN
    SELECT * INTO h FROM public.batismo_horarios WHERE igreja_id=NEW.igreja_id AND horario=NEW.horario_culto AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Horário não cadastrado neste campus.' USING ERRCODE='23514'; END IF;
    NEW.horario_id:=h.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aa_batismo_campus BEFORE INSERT OR UPDATE ON public.batismo_inscricoes FOR EACH ROW EXECUTE FUNCTION public.tg_batismo_campus_inscricao();
REVOKE ALL ON FUNCTION public.tg_batismo_campus_raiz(),public.tg_batismo_campus_inscricao() FROM PUBLIC,anon,authenticated;

-- As RPCs novas nunca inventam data pela fórmula nem aceitam campus ausente.
CREATE OR REPLACE FUNCTION public.fn_campus_batismo_datas_abertas(p_igreja_id uuid,p_n integer DEFAULT 3)
RETURNS TABLE(id uuid,data date) LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT e.id,e.data FROM public.batismo_eventos e WHERE e.igreja_id=p_igreja_id AND e.aberto
    AND e.data>=(now() AT TIME ZONE 'America/Sao_Paulo')::date ORDER BY e.data LIMIT LEAST(GREATEST(COALESCE(p_n,3),1),24);
$$;
CREATE OR REPLACE FUNCTION public.fn_campus_batismo_ocupacao(p_igreja_id uuid,p_evento_id uuid)
RETURNS TABLE(horario_id uuid,horario text,ocupados bigint) LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT h.id,h.horario,count(i.id) FROM public.batismo_horarios h
  JOIN public.batismo_eventos e ON e.id=p_evento_id AND e.igreja_id=h.igreja_id
  LEFT JOIN public.batismo_inscricoes i ON i.evento_id=e.id AND i.igreja_id=e.igreja_id AND i.horario_id=h.id
    AND i.deleted_at IS NULL AND (i.status IS NULL OR i.status NOT IN('cancelado','rejeitado'))
  WHERE h.igreja_id=p_igreja_id AND h.deleted_at IS NULL GROUP BY h.id,h.horario;
$$;
REVOKE ALL ON FUNCTION public.fn_campus_batismo_datas_abertas(uuid,integer),public.fn_campus_batismo_ocupacao(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_batismo_datas_abertas(uuid,integer),public.fn_campus_batismo_ocupacao(uuid,uuid) TO service_role;

DO $$ DECLARE t text; leitura text; BEGIN
  FOREACH t IN ARRAY ARRAY['batismo_eventos','batismo_horarios','batismo_inscricoes'] LOOP
    leitura:='public.fn_campus_dado_pessoal_permitido(igreja_id)';
    IF t='batismo_inscricoes' THEN leitura:='('||leitura||' OR membro_id=public.current_user_membro_id())'; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY batismo_campus_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(%s)',t,leitura);
    EXECUTE format('CREATE POLICY batismo_campus_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY batismo_campus_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY batismo_campus_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
  END LOOP;
END $$;
UPDATE public.app_campus_cobertura SET api_validada=false,rls_validada=false,produtores_validados=false,regressao_validada=false WHERE frente='batismo';
COMMIT;

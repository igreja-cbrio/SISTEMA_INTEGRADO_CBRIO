-- Configuração local e bucket privado NOVO; não privatiza o legado nesta etapa.
-- Legado público exige cutover específico após atualizar os leitores antigos.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado) THEN
  RAISE EXCEPTION 'Configuração de batismo exige preparação para copiar o legado.';
 END IF;
END $$;
-- Configuração operacional, sem cadastro de pessoa: não admite exclusão lógica.
CREATE TABLE public.batismo_config_campus(
 igreja_id uuid PRIMARY KEY REFERENCES public.igrejas(id),
 grupo_url text,
 updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.batismo_config_campus(igreja_id,grupo_url,updated_by,updated_at)
 SELECT public.fn_campus_legado_escrita(),grupo_url,updated_by,updated_at FROM public.batismo_config WHERE id=1;
ALTER TABLE public.batismo_config_campus ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.batismo_config_campus FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.batismo_config_campus TO service_role;
CREATE POLICY batismo_config_campus_service ON public.batismo_config_campus FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE OR REPLACE FUNCTION public.tg_batismo_config_ponte()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE legado uuid;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='batismo_config' THEN
  legado:=public.fn_campus_legado_escrita();
  INSERT INTO public.batismo_config_campus(igreja_id,grupo_url,updated_by,updated_at)
   VALUES(legado,NEW.grupo_url,NEW.updated_by,NEW.updated_at)
   ON CONFLICT(igreja_id) DO UPDATE SET grupo_url=EXCLUDED.grupo_url,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;
 ELSE
  SELECT campus_legado_id INTO legado FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado;
  IF NEW.igreja_id=legado THEN
   UPDATE public.batismo_config SET grupo_url=NEW.grupo_url,updated_by=NEW.updated_by,updated_at=NEW.updated_at WHERE id=1;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_batismo_config_ponte() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER batismo_config_ponte AFTER INSERT OR UPDATE ON public.batismo_config FOR EACH ROW EXECUTE FUNCTION public.tg_batismo_config_ponte();
CREATE TRIGGER batismo_config_ponte AFTER INSERT OR UPDATE ON public.batismo_config_campus FOR EACH ROW EXECUTE FUNCTION public.tg_batismo_config_ponte();

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('batismos-campi','batismos-campi',false,10485760,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='batismos-campi' AND public) THEN
  RAISE EXCEPTION 'Bucket batismos-campi existente é público; revisar antes de prosseguir.';
 END IF;
END $$;
-- URLs assinadas são geradas só pelo backend após conferir o ato/pessoa.
-- RESTRICTIVE também fecha eventual policy permissiva genérica de storage.
CREATE POLICY batismo_campi_sem_acesso_direto ON storage.objects AS RESTRICTIVE
 FOR ALL TO anon,authenticated USING(bucket_id NOT IN('batismos-campi','batismos-biometria')) WITH CHECK(bucket_id NOT IN('batismos-campi','batismos-biometria'));
-- Nenhum cliente antigo pode continuar publicando no bucket público por role global.
CREATE POLICY batismo_legado_sem_upload ON storage.objects AS RESTRICTIVE
 FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'batismos');
CREATE POLICY batismo_legado_sem_update ON storage.objects AS RESTRICTIVE
 FOR UPDATE TO anon,authenticated USING(bucket_id<>'batismos') WITH CHECK(bucket_id<>'batismos');
CREATE POLICY batismo_legado_sem_delete ON storage.objects AS RESTRICTIVE
 FOR DELETE TO anon,authenticated USING(bucket_id<>'batismos');
UPDATE public.app_campus_cobertura SET api_validada=false,rls_validada=false,produtores_validados=false,regressao_validada=false
 WHERE frente IN('batismo','arquivos-exportacoes');
CREATE OR REPLACE FUNCTION public.fn_campus_batismo_checkin_proprio(p_inscricao_id uuid,p_membro_id uuid,p_igreja_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE i public.batismo_inscricoes%ROWTYPE; momento timestamptz;
BEGIN
 SELECT * INTO i FROM public.batismo_inscricoes WHERE id=p_inscricao_id AND membro_id=p_membro_id
   AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR i.status IN('cancelado','rejeitado') THEN RETURN jsonb_build_object('ok',false,'erro','Inscrição não encontrada.'); END IF;
 IF i.data_batismo IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
  RETURN jsonb_build_object('ok',false,'erro','O check-in só fica disponível no dia do seu batismo.');
 END IF;
 IF i.checkin_em IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'ja_checkado',true,'checkin_em',i.checkin_em); END IF;
 UPDATE public.batismo_inscricoes SET checkin_em=now(),updated_at=now()
  WHERE id=i.id AND igreja_id=p_igreja_id AND membro_id=p_membro_id RETURNING checkin_em INTO momento;
 RETURN jsonb_build_object('ok',true,'checkin_em',momento);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_batismo_checkin_proprio(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_batismo_checkin_proprio(uuid,uuid,uuid) TO service_role;
COMMIT;

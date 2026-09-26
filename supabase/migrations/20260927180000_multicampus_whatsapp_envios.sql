-- Origem durável da fila, inclusive nas tentativas e callbacks da Meta.
BEGIN;
ALTER TABLE public.whatsapp_envios ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id),
 ADD COLUMN escopo_campus text NOT NULL DEFAULT 'campus',
 ADD COLUMN chave_dedup text;
UPDATE public.whatsapp_envios SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.whatsapp_envios ADD CONSTRAINT whatsapp_envios_escopo_campus CHECK(
 (escopo_campus='campus' AND igreja_id IS NOT NULL) OR (escopo_campus='central' AND igreja_id IS NULL));
CREATE UNIQUE INDEX whatsapp_envios_campus_dedup ON public.whatsapp_envios(COALESCE(igreja_id,'00000000-0000-0000-0000-000000000000'::uuid),chave_dedup) WHERE chave_dedup IS NOT NULL;
CREATE INDEX whatsapp_envios_campus_pendentes ON public.whatsapp_envios(igreja_id,proxima_tentativa_em,criado_em) WHERE status='pendente';
CREATE OR REPLACE FUNCTION public.tg_whatsapp_envio_campus()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.igreja_id IS DISTINCT FROM OLD.igreja_id OR NEW.escopo_campus IS DISTINCT FROM OLD.escopo_campus) THEN
  RAISE EXCEPTION 'A origem do envio não pode ser alterada.' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.igreja_id IS NULL AND NEW.escopo_campus='campus' THEN NEW.igreja_id:=public.fn_campus_legado_escrita(); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_whatsapp_envio_campus() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_whatsapp_envio_campus BEFORE INSERT OR UPDATE ON public.whatsapp_envios FOR EACH ROW EXECUTE FUNCTION public.tg_whatsapp_envio_campus();
ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_envios_campus_select ON public.whatsapp_envios AS RESTRICTIVE FOR SELECT TO authenticated
 USING(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY whatsapp_envios_campus_insert ON public.whatsapp_envios AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(escopo_campus='campus' AND public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY whatsapp_envios_campus_update ON public.whatsapp_envios AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id))
 WITH CHECK(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY whatsapp_envios_campus_delete ON public.whatsapp_envios AS RESTRICTIVE FOR DELETE TO authenticated
 USING(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id));
UPDATE public.app_campus_cobertura SET api_validada=false,rls_validada=false,produtores_validados=false,regressao_validada=false WHERE frente='jobs-notificacoes';
COMMIT;

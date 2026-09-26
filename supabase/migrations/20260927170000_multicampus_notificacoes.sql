-- Caixa de entrada: campus do evento, com exceção explícita dos módulos centrais.
BEGIN;
ALTER TABLE public.notificacoes ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id),
 ADD COLUMN escopo_campus text NOT NULL DEFAULT 'campus';
UPDATE public.notificacoes SET escopo_campus='central' WHERE modulo IN('rh','financeiro','financeiro-v2','patrimonio');
UPDATE public.notificacoes SET igreja_id=public.fn_campus_legado_escrita() WHERE escopo_campus='campus';
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_escopo_campus_check CHECK(
 (escopo_campus='central' AND igreja_id IS NULL AND modulo IN('rh','financeiro','financeiro-v2','patrimonio'))
 OR (escopo_campus='campus' AND igreja_id IS NOT NULL));
CREATE INDEX notificacoes_usuario_campus_lida ON public.notificacoes(usuario_id,igreja_id,lida,created_at DESC);
CREATE OR REPLACE FUNCTION public.tg_notificacao_campus()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.igreja_id IS DISTINCT FROM OLD.igreja_id OR NEW.escopo_campus IS DISTINCT FROM OLD.escopo_campus) THEN
  RAISE EXCEPTION 'A origem da notificação não pode ser alterada.' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.modulo IN('rh','financeiro','financeiro-v2','patrimonio') AND NEW.igreja_id IS NULL THEN NEW.escopo_campus:='central';
  ELSIF NEW.igreja_id IS NULL THEN NEW.igreja_id:=public.fn_campus_legado_escrita(); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_notificacao_campus() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_notificacao_campus BEFORE INSERT OR UPDATE ON public.notificacoes FOR EACH ROW EXECUTE FUNCTION public.tg_notificacao_campus();
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notificacoes_campus_select ON public.notificacoes AS RESTRICTIVE FOR SELECT TO authenticated
 USING(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY notificacoes_campus_insert ON public.notificacoes AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(escopo_campus='campus' AND public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY notificacoes_campus_update ON public.notificacoes AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id))
 WITH CHECK(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY notificacoes_campus_delete ON public.notificacoes AS RESTRICTIVE FOR DELETE TO authenticated
 USING(escopo_campus='central' OR public.fn_campus_dado_pessoal_permitido(igreja_id));
UPDATE public.app_campus_cobertura SET api_validada=false,rls_validada=false,produtores_validados=false,regressao_validada=false WHERE frente='jobs-notificacoes';
COMMIT;

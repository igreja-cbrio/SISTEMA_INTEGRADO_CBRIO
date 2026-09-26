-- Estado de implantação persistido: o fallback legado não pode ressurgir por env.
-- Esta migration prepara contratos; não ativa uma segunda unidade nem concede vínculos.
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_campus_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  estado text NOT NULL DEFAULT 'preparacao' CHECK (estado IN ('preparacao','ensaio','ativo')),
  campus_legado_id uuid NOT NULL REFERENCES public.igrejas(id),
  ja_ativado boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.app_campus_cobertura (
  frente text PRIMARY KEY,
  api_validada boolean NOT NULL DEFAULT false,
  rls_validada boolean NOT NULL DEFAULT false,
  produtores_validados boolean NOT NULL DEFAULT false,
  regressao_validada boolean NOT NULL DEFAULT false,
  evidencia text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_campus_config(id,campus_legado_id)
  SELECT true,id FROM public.igrejas WHERE id='00000000-0000-0000-0000-000000000001' AND slug='cbrio-sede'
  ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_campus_config) THEN
    RAISE EXCEPTION 'Defina explicitamente o campus legado antes de instalar o contexto multicampus.';
  END IF;
END $$;
INSERT INTO public.app_campus_cobertura(frente) VALUES
  ('cultos'),('pessoas'),('cuidados'),('grupos'),('next'),('batismo'),('voluntariado'),
  ('kids'),('app-membros'),('app-staff'),('indicadores'),('administrativo'),
  ('portas-publicas'),('jobs-notificacoes'),('arquivos-exportacoes')
  ON CONFLICT(frente) DO NOTHING;
ALTER TABLE public.app_campus_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_campus_cobertura ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_campus_config, public.app_campus_cobertura FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.app_campus_config, public.app_campus_cobertura TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_campus_config, public.app_campus_cobertura TO service_role;
CREATE POLICY campus_config_admin ON public.app_campus_config FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE POLICY campus_cobertura_admin ON public.app_campus_cobertura FOR SELECT TO authenticated USING(public.is_super_admin());
CREATE POLICY campus_config_service ON public.app_campus_config FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY campus_cobertura_service ON public.app_campus_cobertura FOR ALL TO service_role USING(true) WITH CHECK(true);

CREATE OR REPLACE FUNCTION public.tg_campus_proteger_ativacao()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'A configuração de campus não pode ser removida.'; END IF;
  IF OLD.ja_ativado AND (NEW.estado='preparacao' OR NOT NEW.ja_ativado) THEN
    RAISE EXCEPTION 'Não é permitido restaurar o acesso legado após ativar multicampus.';
  END IF;
  IF NEW.campus_legado_id <> OLD.campus_legado_id THEN
    RAISE EXCEPTION 'O campus legado é histórico e não pode ser alterado.';
  END IF;
  IF NEW.estado IN ('ensaio','ativo') THEN NEW.ja_ativado:=true; END IF;
  IF NEW.estado IN ('ensaio','ativo') AND NEW.estado<>OLD.estado THEN
    IF NOT EXISTS(SELECT 1 FROM public.app_campus_cobertura) OR EXISTS (
      SELECT 1 FROM public.app_campus_cobertura WHERE NOT(api_validada AND rls_validada AND produtores_validados AND regressao_validada)
        OR NULLIF(btrim(evidencia),'') IS NULL
    ) THEN RAISE EXCEPTION 'Existem frentes multicampus sem validação ou evidência.'; END IF;
    NEW.ja_ativado:=true;
  END IF;
  NEW.atualizado_em:=now();
  RETURN NEW;
END $$;
CREATE TRIGGER campus_config_proteger BEFORE UPDATE OR DELETE ON public.app_campus_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_campus_proteger_ativacao();

CREATE OR REPLACE FUNCTION public.current_user_igreja_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT CASE WHEN public.is_super_admin() OR EXISTS(
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_diretoria_geral IS TRUE
  ) THEN ARRAY(SELECT id FROM public.igrejas WHERE ativa)
  ELSE ARRAY(SELECT i.id FROM public.usuario_igrejas u JOIN public.igrejas i ON i.id=u.igreja_id
    WHERE u.usuario_id=auth.uid() AND i.ativa) END;
$$;

-- Complementa as permissões existentes; não concede acesso a nenhum módulo.
CREATE OR REPLACE FUNCTION public.fn_campus_permitido(p_igreja_id uuid,p_modulo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT COALESCE((SELECT CASE WHEN c.estado='preparacao' AND NOT c.ja_ativado THEN true
    WHEN m.slug IS NULL THEN false
    WHEN m.escopo_campus='compartilhado' THEN true
    ELSE p_igreja_id=ANY(public.current_user_igreja_ids()) END
    FROM public.app_campus_config c LEFT JOIN public.modulos m ON m.slug=p_modulo AND m.ativo WHERE c.id),false);
$$;
REVOKE ALL ON FUNCTION public.fn_campus_permitido(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_campus_permitido(uuid,text) TO authenticated,service_role;
-- Vínculos não são um diretório público de todos os usuários da rede.
CREATE POLICY usuario_igrejas_campus_privacidade ON public.usuario_igrejas
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING(usuario_id=auth.uid() OR public.is_super_admin());

CREATE OR REPLACE FUNCTION public.fn_campus_definir_acessos(p_usuario_id uuid,p_igreja_ids uuid[],p_autor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_antes jsonb; v_email text;
BEGIN
  SELECT p.email INTO v_email FROM public.profiles p JOIN public.app_super_admins a
    ON lower(a.email)=lower(p.email) AND a.ativo WHERE p.id=p_autor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Somente administradores gerais podem alterar acessos.' USING ERRCODE='P0403'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE='P0404'; END IF;
  IF p_igreja_ids IS NULL OR cardinality(p_igreja_ids)>100 OR
    EXISTS(SELECT 1 FROM unnest(p_igreja_ids) i WHERE i IS NULL OR NOT EXISTS(SELECT 1 FROM public.igrejas g WHERE g.id=i AND g.ativa)) THEN
    RAISE EXCEPTION 'Informe apenas campi ativos.' USING ERRCODE='P0400';
  END IF;
  SELECT COALESCE(jsonb_agg(igreja_id ORDER BY igreja_id),'[]'::jsonb) INTO v_antes
    FROM public.usuario_igrejas WHERE usuario_id=p_usuario_id;
  DELETE FROM public.usuario_igrejas WHERE usuario_id=p_usuario_id AND NOT(igreja_id=ANY(p_igreja_ids));
  INSERT INTO public.usuario_igrejas(usuario_id,igreja_id)
    SELECT p_usuario_id,i FROM (SELECT DISTINCT unnest(p_igreja_ids) i) ids ON CONFLICT DO NOTHING;
  INSERT INTO public.app_audit_log(table_name,row_id,action,user_id,user_email,changes)
    VALUES('usuario_igrejas',p_usuario_id::text,'UPDATE',p_autor_id,v_email,
      jsonb_build_object('igreja_ids',jsonb_build_object('old',v_antes,'new',to_jsonb(p_igreja_ids))));
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_definir_acessos(uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_definir_acessos(uuid,uuid[],uuid) TO service_role;
COMMIT;

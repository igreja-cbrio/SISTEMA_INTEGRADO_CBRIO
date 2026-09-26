-- Grupos: campus do ato, participantes globais e leitura nominal por vínculo.
-- Relatórios/views/RPCs, portas e jobs ainda exigem escopo na API/service role.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_campus_config c JOIN public.igrejas i ON i.id=c.campus_legado_id
    WHERE c.id AND c.estado='preparacao' AND NOT c.ja_ativado AND i.ativa AND i.tipo='sede'
      AND i.id='00000000-0000-0000-0000-000000000001')
    OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
    RAISE EXCEPTION 'Backfill de Grupos exige preparação e uma única Sede legada ativa.';
  END IF;
END $$;
UPDATE public.mem_grupos SET igreja_id=public.fn_campus_legado_escrita() WHERE igreja_id IS NULL;
ALTER TABLE public.mem_grupos ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE public.mem_grupos ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
CREATE TRIGGER aa_grupo_campus_imutavel BEFORE INSERT OR UPDATE OF igreja_id ON public.mem_grupos
  FOR EACH ROW EXECUTE FUNCTION public.tg_campus_destino_explicito();
ALTER TABLE public.mem_grupos ADD CONSTRAINT mem_grupos_id_campus_unique UNIQUE(id,igreja_id);
UPDATE public.mem_grupo_membros m SET igreja_id=g.igreja_id FROM public.mem_grupos g WHERE g.id=m.grupo_id;
ALTER TABLE public.mem_grupo_membros ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE public.mem_grupo_membros ALTER COLUMN igreja_id DROP DEFAULT;
ALTER TABLE public.mem_grupo_membros ADD CONSTRAINT grupo_membro_mesmo_campus_fk
  FOREIGN KEY(grupo_id,igreja_id) REFERENCES public.mem_grupos(id,igreja_id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.tg_grupo_membro_campus()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_campus uuid;
BEGIN
  SELECT igreja_id INTO v_campus FROM public.mem_grupos WHERE id=NEW.grupo_id FOR SHARE;
  IF v_campus IS NULL OR (NEW.igreja_id IS NOT NULL AND NEW.igreja_id<>v_campus) THEN
    RAISE EXCEPTION 'Campus do vínculo diverge do grupo.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND v_campus IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'Transferência entre campi exige novo vínculo, preservando o histórico.' USING ERRCODE='23514';
  END IF;
  NEW.igreja_id:=v_campus; RETURN NEW;
END $$;
CREATE TRIGGER aa_grupo_membro_campus BEFORE INSERT OR UPDATE OF grupo_id,igreja_id ON public.mem_grupo_membros
  FOR EACH ROW EXECUTE FUNCTION public.tg_grupo_membro_campus();
REVOKE ALL ON FUNCTION public.tg_grupo_membro_campus() FROM PUBLIC,anon,authenticated;

-- Cadastro sem grupo ainda precisa ter origem explícita; não inferir do membro.
ALTER TABLE public.mem_cadastros_pendentes ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.mem_cadastros_pendentes SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.mem_cadastros_pendentes ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE public.mem_cadastros_pendentes ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
CREATE INDEX mem_cadastros_pendentes_campus_idx ON public.mem_cadastros_pendentes(igreja_id);
CREATE TRIGGER aa_cadastro_campus BEFORE INSERT OR UPDATE OF igreja_id ON public.mem_cadastros_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_campus_destino_explicito();

CREATE OR REPLACE FUNCTION public.fn_campus_grupo_ref_permitido(p_tipo text,p_id uuid,p_leitura boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_campus uuid; v_membro uuid;
BEGIN
  IF p_id IS NULL THEN RETURN false; END IF;
  CASE p_tipo
    WHEN 'grupo' THEN SELECT igreja_id,NULL::uuid INTO v_campus,v_membro FROM public.mem_grupos WHERE id=p_id;
    WHEN 'encontro' THEN SELECT g.igreja_id,NULL::uuid INTO v_campus,v_membro FROM public.mem_grupo_encontros e JOIN public.mem_grupos g ON g.id=e.grupo_id WHERE e.id=p_id;
    WHEN 'pedido' THEN SELECT g.igreja_id,p.membro_id INTO v_campus,v_membro FROM public.mem_grupo_pedidos p JOIN public.mem_grupos g ON g.id=p.grupo_id WHERE p.id=p_id;
    WHEN 'participacao' THEN SELECT igreja_id,membro_id INTO v_campus,v_membro FROM public.mem_grupo_membros WHERE id=p_id;
    ELSE RETURN false;
  END CASE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN COALESCE(public.fn_campus_dado_pessoal_permitido(v_campus) OR (p_leitura AND v_membro=public.current_user_membro_id()),false);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_grupo_ref_permitido(text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_campus_grupo_ref_permitido(text,uuid,boolean) TO authenticated,service_role;

DO $$ DECLARE t text; self_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mem_grupos','mem_grupo_membros','mem_cadastros_pendentes'] LOOP
    self_expr:=CASE WHEN t='mem_grupos' THEN 'false' ELSE 'membro_id=public.current_user_membro_id()' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY campus_grupo_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR %s)',t,self_expr);
    EXECUTE format('CREATE POLICY campus_grupo_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY campus_grupo_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY campus_grupo_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
  END LOOP;
END $$;

DO $$ DECLARE r record; leitura text; escrita text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('mem_grupo_link','grupo','grupo_id',NULL),('mem_grupo_documentos','grupo','grupo_id',NULL),
    ('grupo_supervisao_visitas','grupo','grupo_id',NULL),('grupo_supervisao_observacoes','grupo','grupo_id',NULL),
    ('mem_grupo_renovacoes','grupo','grupo_id','lider_membro_id'),('mem_grupo_conferencias','grupo','grupo_id','lider_membro_id'),
    ('mem_grupo_agenda_excecoes','grupo','grupo_id',NULL),('mem_grupo_encontros','grupo','grupo_id',NULL),
    ('mem_grupo_pedidos','grupo','grupo_id','membro_id'),('mem_grupo_pedido_eventos','pedido','pedido_id',NULL),
    ('mem_grupo_encontro_presencas','encontro','encontro_id','membro_id'),
    ('mem_grupos_historico','grupo','grupo_id',NULL),('mem_grupo_membros_historico','participacao','participacao_id',NULL)
  ) AS refs(tabela,tipo,coluna,self_coluna) LOOP
    leitura:=format('public.fn_campus_grupo_ref_permitido(%L,%I,true)',r.tipo,r.coluna);
    IF r.self_coluna IS NOT NULL THEN leitura:='('||leitura||format(' OR %I=public.current_user_membro_id())',r.self_coluna); END IF;
    escrita:=format('public.fn_campus_grupo_ref_permitido(%L,%I,false)',r.tipo,r.coluna);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.tabela);
    EXECUTE format('CREATE POLICY campus_grupo_filho_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(%s)',r.tabela,leitura);
    EXECUTE format('CREATE POLICY campus_grupo_filho_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(%s)',r.tabela,escrita);
    EXECUTE format('CREATE POLICY campus_grupo_filho_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(%s) WITH CHECK(%s)',r.tabela,escrita,escrita);
    EXECUTE format('CREATE POLICY campus_grupo_filho_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(%s)',r.tabela,escrita);
  END LOOP;
END $$;
-- Transferência pode cruzar campi legitimamente, mas exige acesso a AMBOS.
ALTER TABLE public.mem_grupo_transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_transferencia_restritiva ON public.mem_grupo_transferencias AS RESTRICTIVE FOR ALL TO authenticated
  USING(public.fn_campus_grupo_ref_permitido('grupo',grupo_origem_id,false)
    AND (grupo_destino_id IS NULL OR public.fn_campus_grupo_ref_permitido('grupo',grupo_destino_id,false)))
  WITH CHECK(public.fn_campus_grupo_ref_permitido('grupo',grupo_origem_id,false)
    AND (grupo_destino_id IS NULL OR public.fn_campus_grupo_ref_permitido('grupo',grupo_destino_id,false)));

-- Overload explícito: identidade continua global; origem vem do ato.
CREATE OR REPLACE FUNCTION public.fn_link_or_create_membro(p_cpf text, p_telefone text, p_email text, p_nome text, p_status_inicial text, p_fonte text, p_igreja_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_membro_id uuid;
  v_cpf text;
  v_tel text;
  v_email text;
BEGIN
  IF p_igreja_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.igrejas WHERE id=p_igreja_id AND ativa) THEN
    RAISE EXCEPTION 'Campus explícito ativo obrigatório.' USING ERRCODE='23514';
  END IF;
  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  -- 1) CPF exato (só vivos · normalizado dos dois lados · usa o índice único
  --    uniq_mem_membros_cpf_ativo: expressão sem coalesce + cpf IS NOT NULL)
  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE cpf IS NOT NULL
       AND regexp_replace(cpf, '\D', '', 'g') = v_cpf
       AND active = true AND deleted_at IS NULL
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 2) Telefone + NOME compatível (nunca telefone sozinho — família
  --    compartilha o número · política membroMatch)
  IF v_tel IS NOT NULL AND length(v_tel) >= 10 AND p_nome IS NOT NULL AND trim(p_nome) <> '' THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND telefone IS NOT NULL
       AND regexp_replace(telefone, '\D', '', 'g') = v_tel
       AND public.fn_identidade_nomes_compativeis(nome, p_nome)
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 3) E-mail + NOME compatível quando há nome (sem nome, mantém o legado
  --    e-mail sozinho · mesmo contrato do membroMatch)
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND email IS NOT NULL
       AND lower(trim(email)) = v_email
       AND (p_nome IS NULL OR trim(p_nome) = '' OR public.fn_identidade_nomes_compativeis(nome, p_nome))
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.mem_membros (nome, cpf, telefone, email, status, active, created_at, updated_at, igreja_id)
    VALUES (
      trim(p_nome),
      v_cpf,
      nullif(p_telefone, ''),
      v_email,
      coalesce(p_status_inicial, 'visitante'),
      true,
      now(),
      now(),
      p_igreja_id
    )
    RETURNING id INTO v_membro_id;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida no CPF: religa no vencedor
    IF v_cpf IS NOT NULL THEN
      SELECT id INTO v_membro_id FROM public.mem_membros
       WHERE cpf IS NOT NULL
         AND regexp_replace(cpf, '\D', '', 'g') = v_cpf
         AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_membro_id IS NULL THEN RAISE; END IF;
    PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
    RETURN v_membro_id;
  END;

  -- Rastro de auditoria: o schema VIVO exige `tipo` (NOT NULL + CHECK que
  -- aceita 'outro'). Handler específico AVISA em vez de falhar mudo.
  BEGIN
    INSERT INTO public.mem_historico (membro_id, tipo, descricao, created_at, igreja_id)
    VALUES (
      v_membro_id,
      'outro',
      '[criado_auto] Criado automaticamente via ' || coalesce(p_fonte, 'fluxo'),
      now(),
      p_igreja_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_link_or_create_membro: rastro criado_auto não gravado (%)', SQLERRM;
  END;

  RETURN v_membro_id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.fn_link_or_create_membro(text,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_link_or_create_membro(text,text,text,text,text,text,uuid) TO service_role;
-- Assinatura antiga conserva privilégios do invocador, grants e defaults.
-- Repetir o corpo evita SECURITY DEFINER ou concessão do overload a authenticated.
CREATE OR REPLACE FUNCTION public.fn_link_or_create_membro(p_cpf text, p_telefone text, p_email text, p_nome text, p_status_inicial text DEFAULT 'visitante'::text, p_fonte text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_campus_legado uuid := public.fn_campus_legado_escrita();
  v_membro_id uuid;
  v_cpf text;
  v_tel text;
  v_email text;
BEGIN
  IF v_campus_legado IS NULL OR NOT EXISTS(SELECT 1 FROM public.igrejas WHERE id=v_campus_legado AND ativa) THEN
    RAISE EXCEPTION 'Campus explícito ativo obrigatório.' USING ERRCODE='23514';
  END IF;
  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  -- 1) CPF exato (só vivos · normalizado dos dois lados · usa o índice único
  --    uniq_mem_membros_cpf_ativo: expressão sem coalesce + cpf IS NOT NULL)
  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE cpf IS NOT NULL
       AND regexp_replace(cpf, '\D', '', 'g') = v_cpf
       AND active = true AND deleted_at IS NULL
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 2) Telefone + NOME compatível (nunca telefone sozinho — família
  --    compartilha o número · política membroMatch)
  IF v_tel IS NOT NULL AND length(v_tel) >= 10 AND p_nome IS NOT NULL AND trim(p_nome) <> '' THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND telefone IS NOT NULL
       AND regexp_replace(telefone, '\D', '', 'g') = v_tel
       AND public.fn_identidade_nomes_compativeis(nome, p_nome)
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 3) E-mail + NOME compatível quando há nome (sem nome, mantém o legado
  --    e-mail sozinho · mesmo contrato do membroMatch)
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND email IS NOT NULL
       AND lower(trim(email)) = v_email
       AND (p_nome IS NULL OR trim(p_nome) = '' OR public.fn_identidade_nomes_compativeis(nome, p_nome))
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
      RETURN v_membro_id;
    END IF;
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.mem_membros (nome, cpf, telefone, email, status, active, created_at, updated_at, igreja_id)
    VALUES (
      trim(p_nome),
      v_cpf,
      nullif(p_telefone, ''),
      v_email,
      coalesce(p_status_inicial, 'visitante'),
      true,
      now(),
      now(),
      v_campus_legado
    )
    RETURNING id INTO v_membro_id;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida no CPF: religa no vencedor
    IF v_cpf IS NOT NULL THEN
      SELECT id INTO v_membro_id FROM public.mem_membros
       WHERE cpf IS NOT NULL
         AND regexp_replace(cpf, '\D', '', 'g') = v_cpf
         AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_membro_id IS NULL THEN RAISE; END IF;
    PERFORM public.fn_registrar_contato(v_membro_id, p_telefone, p_email, coalesce(p_fonte, 'porta'));
    RETURN v_membro_id;
  END;

  -- Rastro de auditoria: o schema VIVO exige `tipo` (NOT NULL + CHECK que
  -- aceita 'outro'). Handler específico AVISA em vez de falhar mudo.
  BEGIN
    INSERT INTO public.mem_historico (membro_id, tipo, descricao, created_at, igreja_id)
    VALUES (
      v_membro_id,
      'outro',
      '[criado_auto] Criado automaticamente via ' || coalesce(p_fonte, 'fluxo'),
      now(),
      v_campus_legado
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_link_or_create_membro: rastro criado_auto não gravado (%)', SQLERRM;
  END;

  RETURN v_membro_id;
END;
$function$
;
-- Chamadores legados a migrar: publicVisitante.js; triggers de batismo, vol_profiles
-- e handle_new_user. Não inferir campus-base de pessoa existente para esses atos.
UPDATE public.app_campus_cobertura SET rls_validada=false,produtores_validados=false,regressao_validada=false
  WHERE frente IN ('grupos','pessoas','portas-publicas');
COMMIT;

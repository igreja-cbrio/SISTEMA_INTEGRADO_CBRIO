-- Cuidados nominal e filhos com FK real; contatos seguem a identidade global.
-- Não cobre os agregados, views, RPCs/jobs, responsáveis legados em texto ou
-- identidade_pendencias. Essas frentes continuam bloqueando ativação.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_campus_config c JOIN public.igrejas i ON i.id=c.campus_legado_id
    WHERE c.id AND c.estado='preparacao' AND NOT c.ja_ativado
      AND i.id='00000000-0000-0000-0000-000000000001' AND i.ativa AND i.tipo='sede')
    OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
    RAISE EXCEPTION 'Backfill de Cuidados exige preparação e uma única Sede legada ativa.';
  END IF;
END $$;

DO $$ DECLARE t text; self_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cui_pedidos','cui_visitas','cui_j180_turmas','mem_historico'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id)',t);
    EXECUTE format('UPDATE public.%I SET igreja_id=public.fn_campus_legado_escrita()',t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN igreja_id SET NOT NULL',t);
    EXECUTE format('CREATE INDEX %I ON public.%I(igreja_id)',t||'_campus_idx',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['cui_pedidos','cui_visitas','cui_j180_turmas','mem_historico','cui_acompanhamentos','cui_jornada180'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita()',t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE TRIGGER aa_campus_destino_explicito BEFORE INSERT OR UPDATE OF igreja_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_campus_destino_explicito()',t);
    self_expr:=CASE WHEN t='cui_j180_turmas' THEN 'false' ELSE 'membro_id=public.current_user_membro_id()' END;
    EXECUTE format('CREATE POLICY campus_nominal_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR %s)',t,self_expr);
    EXECUTE format('CREATE POLICY campus_nominal_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY campus_nominal_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY campus_nominal_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
  END LOOP;
END $$;

-- Helper com referências fechadas; não aceita tabela SQL arbitrária nem
-- retorna dados nominais. SECURITY DEFINER evita recursão nas policies.
CREATE OR REPLACE FUNCTION public.fn_campus_cuidados_ref_permitido(p_tipo text,p_id uuid,p_leitura boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_campus uuid; v_membro uuid;
BEGIN
  IF p_id IS NULL THEN RETURN false; END IF;
  CASE p_tipo
    WHEN 'membro' THEN SELECT igreja_id,id INTO v_campus,v_membro FROM public.mem_membros WHERE id=p_id;
    WHEN 'convertido' THEN SELECT igreja_id,membro_id INTO v_campus,v_membro FROM public.cui_convertidos WHERE id=p_id;
    WHEN 'acompanhamento' THEN SELECT igreja_id,membro_id INTO v_campus,v_membro FROM public.cui_acompanhamentos WHERE id=p_id;
    WHEN 'visita' THEN SELECT igreja_id,membro_id INTO v_campus,v_membro FROM public.cui_visitas WHERE id=p_id;
    WHEN 'turma' THEN SELECT igreja_id,NULL::uuid INTO v_campus,v_membro FROM public.cui_j180_turmas WHERE id=p_id;
    WHEN 'encontro' THEN SELECT t.igreja_id,NULL::uuid INTO v_campus,v_membro FROM public.cui_j180_encontros e
      JOIN public.cui_j180_turmas t ON t.id=e.turma_id WHERE e.id=p_id;
    WHEN 'turma_membro' THEN SELECT t.igreja_id,m.membro_id INTO v_campus,v_membro FROM public.cui_j180_turma_membros m
      JOIN public.cui_j180_turmas t ON t.id=m.turma_id WHERE m.id=p_id;
    ELSE RETURN false;
  END CASE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN COALESCE(public.fn_campus_dado_pessoal_permitido(v_campus)
    OR (p_leitura AND v_membro=public.current_user_membro_id()),false);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_cuidados_ref_permitido(text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_campus_cuidados_ref_permitido(text,uuid,boolean) TO authenticated,service_role;

DO $$ DECLARE r record; leitura text; escrita text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('mem_contatos','membro','membro_id'),
    ('cui_primeiro_contato_fila','convertido','convertido_id'),
    ('cui_batismo_next_fila','convertido','convertido_id'),
    ('cui_j180_turma_membros','turma','turma_id'),
    ('cui_j180_encontros','turma','turma_id')
  ) AS refs(tabela,tipo,coluna) LOOP
    leitura:=format('public.fn_campus_cuidados_ref_permitido(%L,%I,true)',r.tipo,r.coluna);
    IF r.tabela='cui_j180_turma_membros' THEN
      leitura:='('||leitura||' OR membro_id=public.current_user_membro_id())';
    END IF;
    escrita:=format('public.fn_campus_cuidados_ref_permitido(%L,%I,false)',r.tipo,r.coluna);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.tabela);
    EXECUTE format('CREATE POLICY campus_filho_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(%s)',r.tabela,leitura);
    EXECUTE format('CREATE POLICY campus_filho_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(%s)',r.tabela,escrita);
    EXECUTE format('CREATE POLICY campus_filho_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(%s) WITH CHECK(%s)',r.tabela,escrita,escrita);
    EXECUTE format('CREATE POLICY campus_filho_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(%s)',r.tabela,escrita);
  END LOOP;
END $$;

ALTER TABLE public.cui_atendimento_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_comentario_select ON public.cui_atendimento_comentarios AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.fn_campus_cuidados_ref_permitido(ref_tipo,ref_id,true));
CREATE POLICY campus_comentario_insert ON public.cui_atendimento_comentarios AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(public.fn_campus_cuidados_ref_permitido(ref_tipo,ref_id,false));
CREATE POLICY campus_comentario_update ON public.cui_atendimento_comentarios AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(public.fn_campus_cuidados_ref_permitido(ref_tipo,ref_id,false)) WITH CHECK(public.fn_campus_cuidados_ref_permitido(ref_tipo,ref_id,false));
CREATE POLICY campus_comentario_delete ON public.cui_atendimento_comentarios AS RESTRICTIVE FOR DELETE TO authenticated
  USING(public.fn_campus_cuidados_ref_permitido(ref_tipo,ref_id,false));

-- Presença depende de DOIS pais: mesmo campus não basta, a turma deve coincidir.
CREATE OR REPLACE FUNCTION public.tg_campus_presenca_j180_turma()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_encontro uuid; v_inscricao uuid;
BEGIN
  SELECT turma_id INTO v_encontro FROM public.cui_j180_encontros WHERE id=NEW.encontro_id FOR SHARE;
  SELECT turma_id INTO v_inscricao FROM public.cui_j180_turma_membros WHERE id=NEW.turma_membro_id FOR SHARE;
  IF v_encontro IS NULL OR v_inscricao IS DISTINCT FROM v_encontro THEN
    RAISE EXCEPTION 'Presença exige encontro e participante da mesma turma.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER campus_presenca_j180_turma BEFORE INSERT OR UPDATE OF encontro_id,turma_membro_id
  ON public.cui_j180_encontro_presencas FOR EACH ROW EXECUTE FUNCTION public.tg_campus_presenca_j180_turma();
REVOKE ALL ON FUNCTION public.tg_campus_presenca_j180_turma() FROM PUBLIC,anon,authenticated;
ALTER TABLE public.cui_j180_encontro_presencas ENABLE ROW LEVEL SECURITY;
-- A leitura própria usa participante; integridade entre os dois pais é validada
-- também no predicado, para não expor eventual inconsistência histórica.
CREATE OR REPLACE FUNCTION public.fn_campus_presenca_j180_permitida(p_encontro uuid,p_participante uuid,p_leitura boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT EXISTS(SELECT 1 FROM public.cui_j180_encontros e
    JOIN public.cui_j180_turma_membros m ON m.turma_id=e.turma_id WHERE e.id=p_encontro AND m.id=p_participante)
    AND public.fn_campus_cuidados_ref_permitido('turma_membro',p_participante,p_leitura);
$$;
REVOKE ALL ON FUNCTION public.fn_campus_presenca_j180_permitida(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_campus_presenca_j180_permitida(uuid,uuid,boolean) TO authenticated,service_role;
CREATE POLICY campus_presenca_select ON public.cui_j180_encontro_presencas AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.fn_campus_presenca_j180_permitida(encontro_id,turma_membro_id,true));
CREATE POLICY campus_presenca_insert ON public.cui_j180_encontro_presencas AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(public.fn_campus_presenca_j180_permitida(encontro_id,turma_membro_id,false));
CREATE POLICY campus_presenca_update ON public.cui_j180_encontro_presencas AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(public.fn_campus_presenca_j180_permitida(encontro_id,turma_membro_id,false))
  WITH CHECK(public.fn_campus_presenca_j180_permitida(encontro_id,turma_membro_id,false));
CREATE POLICY campus_presenca_delete ON public.cui_j180_encontro_presencas AS RESTRICTIVE FOR DELETE TO authenticated
  USING(public.fn_campus_presenca_j180_permitida(encontro_id,turma_membro_id,false));

-- cui_atendimentos não existe no catálogo vivo auditado: não criar tabela de
-- migration histórica como se fosse o modelo em produção. Comentários reais são
-- cui_atendimento_comentarios. Views/agregados/produtores continuam pendentes.
UPDATE public.app_campus_cobertura SET rls_validada=false,regressao_validada=false
  WHERE frente IN ('pessoas','cuidados');
COMMIT;

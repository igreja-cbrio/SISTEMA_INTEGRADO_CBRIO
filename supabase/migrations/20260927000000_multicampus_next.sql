-- Next: campus do ato, sem alterar a identidade global do membro.
-- Catálogo vivo de 26/09/2026 e índices pg_indexes conferidos em 27/09/2026.
-- Nenhuma ativação; rotas/produtores ainda precisam comprovar cobertura completa.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_campus_config c JOIN public.igrejas i ON i.id=c.campus_legado_id
    WHERE c.id AND c.estado='preparacao' AND NOT c.ja_ativado
      AND i.id='00000000-0000-0000-0000-000000000001' AND i.ativa AND i.tipo='sede')
    OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
    RAISE EXCEPTION 'Backfill do Next exige preparação e uma única Sede legada ativa.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.next_inscricoes WHERE igreja_id IS NOT NULL
    AND igreja_id IS DISTINCT FROM public.fn_campus_legado_escrita()) THEN
    RAISE EXCEPTION 'Inscrições Next fora da Sede exigem reconciliação antes do backfill.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.next_presencas p JOIN public.next_encontros e ON e.id=p.encontro_id
    JOIN public.next_matriculas m ON m.id=p.matricula_id WHERE e.turma_id IS DISTINCT FROM m.turma_id) THEN
    RAISE EXCEPTION 'Presenças Next com turmas divergentes exigem revisão histórica antes do backfill.';
  END IF;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['next_eventos','next_turmas','next_encontros','next_matriculas','next_presencas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id)',t);
  END LOOP;
END $$;
UPDATE public.next_eventos SET igreja_id=public.fn_campus_legado_escrita();
UPDATE public.next_turmas t SET igreja_id=COALESCE((SELECT igreja_id FROM public.next_eventos e WHERE e.id=t.origem_evento_id),public.fn_campus_legado_escrita());
UPDATE public.next_encontros e SET igreja_id=t.igreja_id FROM public.next_turmas t WHERE t.id=e.turma_id;
UPDATE public.next_inscricoes n SET igreja_id=COALESCE((SELECT igreja_id FROM public.next_eventos e WHERE e.id=n.evento_id),n.igreja_id,public.fn_campus_legado_escrita());
UPDATE public.next_matriculas m SET igreja_id=COALESCE((SELECT igreja_id FROM public.next_turmas t WHERE t.id=m.turma_id),
  (SELECT igreja_id FROM public.next_inscricoes n WHERE n.id=m.origem_inscricao_id),public.fn_campus_legado_escrita());
UPDATE public.next_presencas p SET igreja_id=e.igreja_id FROM public.next_encontros e WHERE e.id=p.encontro_id;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['next_eventos','next_turmas','next_encontros','next_inscricoes','next_matriculas','next_presencas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN igreja_id SET NOT NULL',t);
    -- Filhos herdam o pai ANTES de considerar fallback legado. Um DEFAULT Sede
    -- faria uma inscrição de evento do campus B nascer divergente do próprio pai.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN igreja_id DROP DEFAULT',t);
    EXECUTE format('CREATE INDEX %I ON public.%I(igreja_id)',t||'_campus_idx',t);
  END LOOP;
END $$;

-- Unicidade local dos atos; pessoa/membro segue global. Índices parciais mantêm
-- os predicados vivos. ON CONFLICT dos produtores deve incluir igreja_id.
ALTER TABLE public.next_eventos DROP CONSTRAINT next_eventos_data_key;
ALTER TABLE public.next_eventos ADD CONSTRAINT next_eventos_campus_data_key UNIQUE(igreja_id,data);
DROP INDEX public.uq_next_turmas_auto_domingo;
CREATE UNIQUE INDEX uq_next_turmas_auto_domingo ON public.next_turmas(igreja_id,auto_domingo);
DROP INDEX public.uq_next_turmas_origem_mes;
CREATE UNIQUE INDEX uq_next_turmas_origem_mes ON public.next_turmas(igreja_id,origem_mes) WHERE origem_mes IS NOT NULL;
DROP INDEX public.uq_next_matriculas_origem_mes_key;
CREATE UNIQUE INDEX uq_next_matriculas_origem_mes_key ON public.next_matriculas(igreja_id,origem_mes_key) WHERE origem_mes_key IS NOT NULL;
DROP INDEX public.uq_next_matriculas_espera_membro;
CREATE UNIQUE INDEX uq_next_matriculas_espera_membro ON public.next_matriculas(igreja_id,membro_id)
  WHERE turma_id IS NULL AND deleted_at IS NULL AND membro_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_next_campus_do_ato()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_campus uuid; v_origem uuid; v_turma uuid; v_turma_matricula uuid;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'next_turmas' THEN
      IF NEW.origem_evento_id IS NOT NULL THEN
        SELECT igreja_id INTO v_campus FROM public.next_eventos WHERE id=NEW.origem_evento_id FOR SHARE;
        IF v_campus IS NULL THEN RAISE EXCEPTION 'Evento de origem do Next inexistente.' USING ERRCODE='23514'; END IF;
      END IF;
    WHEN 'next_encontros' THEN
      SELECT igreja_id INTO v_campus FROM public.next_turmas WHERE id=NEW.turma_id FOR SHARE;
      IF v_campus IS NULL THEN RAISE EXCEPTION 'Turma do encontro Next inexistente.' USING ERRCODE='23514'; END IF;
      IF TG_OP='UPDATE' AND NEW.turma_id IS DISTINCT FROM OLD.turma_id
        AND EXISTS(SELECT 1 FROM public.next_presencas WHERE encontro_id=OLD.id) THEN
        RAISE EXCEPTION 'Encontro com presenças não pode mudar de turma.' USING ERRCODE='23514';
      END IF;
    WHEN 'next_inscricoes' THEN
      IF NEW.evento_id IS NOT NULL THEN
        SELECT igreja_id INTO v_campus FROM public.next_eventos WHERE id=NEW.evento_id FOR SHARE;
        IF v_campus IS NULL THEN RAISE EXCEPTION 'Evento da inscrição Next inexistente.' USING ERRCODE='23514'; END IF;
      END IF;
    WHEN 'next_matriculas' THEN
      IF NEW.turma_id IS NOT NULL THEN
        SELECT igreja_id INTO v_campus FROM public.next_turmas WHERE id=NEW.turma_id FOR SHARE;
        IF v_campus IS NULL THEN RAISE EXCEPTION 'Turma da matrícula Next inexistente.' USING ERRCODE='23514'; END IF;
      END IF;
      IF NEW.origem_inscricao_id IS NOT NULL THEN
        SELECT igreja_id INTO v_origem FROM public.next_inscricoes WHERE id=NEW.origem_inscricao_id FOR SHARE;
        IF v_origem IS NULL OR (v_campus IS NOT NULL AND v_campus IS DISTINCT FROM v_origem) THEN
          RAISE EXCEPTION 'Matrícula e inscrição de origem pertencem a campi diferentes.' USING ERRCODE='23514';
        END IF;
        v_campus:=COALESCE(v_campus,v_origem);
      END IF;
      IF TG_OP='UPDATE' AND NEW.turma_id IS DISTINCT FROM OLD.turma_id
        AND EXISTS(SELECT 1 FROM public.next_presencas WHERE matricula_id=OLD.id) THEN
        RAISE EXCEPTION 'Matrícula com presenças exige uma nova matrícula para transferência.' USING ERRCODE='23514';
      END IF;
    WHEN 'next_presencas' THEN
      SELECT igreja_id,turma_id INTO v_campus,v_turma FROM public.next_encontros WHERE id=NEW.encontro_id FOR SHARE;
      SELECT igreja_id,turma_id INTO v_origem,v_turma_matricula FROM public.next_matriculas WHERE id=NEW.matricula_id FOR SHARE;
      IF v_campus IS NULL OR v_origem IS DISTINCT FROM v_campus OR v_turma IS DISTINCT FROM v_turma_matricula THEN
        RAISE EXCEPTION 'Presença Next exige encontro e matrícula da mesma turma e campus.' USING ERRCODE='23514';
      END IF;
    ELSE NULL;
  END CASE;
  IF v_campus IS NOT NULL THEN
    IF NEW.igreja_id IS NOT NULL AND NEW.igreja_id IS DISTINCT FROM v_campus THEN
      RAISE EXCEPTION 'Campus do ato Next diverge do registro de origem.' USING ERRCODE='23514';
    END IF;
    NEW.igreja_id:=v_campus;
  ELSIF NEW.igreja_id IS NULL THEN
    NEW.igreja_id:=public.fn_campus_legado_escrita();
  END IF;
  IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'O campus histórico do ato Next não pode ser alterado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_next_campus_do_ato() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['next_eventos','next_turmas','next_encontros','next_inscricoes','next_matriculas','next_presencas'] LOOP
    EXECUTE format('CREATE TRIGGER aa_next_campus_do_ato BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_next_campus_do_ato()',t);
  END LOOP;
END $$;

-- Leitura própria de inscrição/presença continua possível, sem conceder acesso
-- de liderança. Helpers fechados e SECURITY DEFINER evitam recursão na RLS.
CREATE OR REPLACE FUNCTION public.fn_next_campus_ref_permitido(p_tipo text,p_id uuid,p_leitura boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_campus uuid; v_membro uuid;
BEGIN
  CASE p_tipo
    WHEN 'matricula' THEN SELECT igreja_id,membro_id INTO v_campus,v_membro FROM public.next_matriculas WHERE id=p_id;
    WHEN 'inscricao' THEN SELECT igreja_id,membro_id INTO v_campus,v_membro FROM public.next_inscricoes WHERE id=p_id;
    ELSE RETURN false;
  END CASE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN COALESCE(public.fn_campus_dado_pessoal_permitido(v_campus)
    OR (p_leitura AND v_membro=public.current_user_membro_id()),false);
END $$;
REVOKE ALL ON FUNCTION public.fn_next_campus_ref_permitido(text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_next_campus_ref_permitido(text,uuid,boolean) TO authenticated,service_role;
DO $$ DECLARE t text; leitura text; escrita text; BEGIN
  FOREACH t IN ARRAY ARRAY['next_eventos','next_turmas','next_encontros','next_inscricoes','next_matriculas','next_presencas'] LOOP
    leitura:='public.fn_campus_dado_pessoal_permitido(igreja_id)';
    escrita:=leitura;
    IF t IN ('next_inscricoes','next_matriculas') THEN
      leitura:='('||leitura||' OR membro_id=public.current_user_membro_id())';
    ELSIF t='next_presencas' THEN
      leitura:='('||leitura||' OR public.fn_next_campus_ref_permitido(''matricula'',matricula_id,true))';
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY campus_next_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(%s)',t,leitura);
    EXECUTE format('CREATE POLICY campus_next_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(%s)',t,escrita);
    EXECUTE format('CREATE POLICY campus_next_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(%s) WITH CHECK(%s)',t,escrita,escrita);
    EXECUTE format('CREATE POLICY campus_next_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(%s)',t,escrita);
  END LOOP;
END $$;
ALTER TABLE public.next_indicacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_next_indicacao_select ON public.next_indicacoes AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.fn_next_campus_ref_permitido('inscricao',inscricao_id,true));
CREATE POLICY campus_next_indicacao_insert ON public.next_indicacoes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(public.fn_next_campus_ref_permitido('inscricao',inscricao_id,false));
CREATE POLICY campus_next_indicacao_update ON public.next_indicacoes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(public.fn_next_campus_ref_permitido('inscricao',inscricao_id,false)) WITH CHECK(public.fn_next_campus_ref_permitido('inscricao',inscricao_id,false));
CREATE POLICY campus_next_indicacao_delete ON public.next_indicacoes AS RESTRICTIVE FOR DELETE TO authenticated
  USING(public.fn_next_campus_ref_permitido('inscricao',inscricao_id,false));
UPDATE public.app_campus_cobertura SET rls_validada=false,produtores_validados=false,regressao_validada=false WHERE frente='next';
COMMIT;

-- Fecha leitura nominal direta nos quatro destinos da decisão.
-- Escopo limitado: NÃO conclui pessoas/cuidados/indicadores; mem_contatos,
-- cui_acompanhamentos, cui_atendimentos, cui_jornada180 e demais filhos ainda
-- precisam de auditoria, herança e RLS próprias antes de ensaio/ativação.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_campus_config c JOIN public.igrejas i ON i.id=c.campus_legado_id
    WHERE c.id AND c.estado='preparacao' AND NOT c.ja_ativado
      AND i.id='00000000-0000-0000-0000-000000000001' AND i.ativa AND i.tipo='sede')
    OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede')<>1 THEN
    RAISE EXCEPTION 'Backfill da trilha exige preparação e uma única Sede legada ativa.';
  END IF;
END $$;

ALTER TABLE public.mem_trilha_valores ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.mem_trilha_valores SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.mem_trilha_valores ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE public.mem_trilha_valores ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
CREATE INDEX idx_mem_trilha_campus_membro ON public.mem_trilha_valores(igreja_id,membro_id);

-- Nunca interpreta "módulo compartilhado" como acesso transversal a PII.
-- As permissões de módulo/linha existentes continuam sendo necessárias.
CREATE OR REPLACE FUNCTION public.fn_campus_dado_pessoal_permitido(p_igreja_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,auth AS $$
  SELECT COALESCE((SELECT CASE WHEN c.estado='preparacao' AND NOT c.ja_ativado THEN true
    ELSE p_igreja_id=ANY(public.current_user_igreja_ids()) END
    FROM public.app_campus_config c WHERE c.id),false);
$$;
REVOKE ALL ON FUNCTION public.fn_campus_dado_pessoal_permitido(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_campus_dado_pessoal_permitido(uuid) TO authenticated,service_role;

-- Defaults antigos constantes não podem continuar carimbando Sede em novos atos.
-- Não reclassifica identidades/atos históricos que permanecem sem campus conhecido.
ALTER TABLE public.mem_membros ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
ALTER TABLE public.cui_convertidos ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
ALTER TABLE public.nsm_eventos ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
CREATE OR REPLACE FUNCTION public.tg_campus_destino_explicito()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.igreja_id IS NULL THEN
    NEW.igreja_id:=public.fn_campus_legado_escrita();
  END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'mem_membros' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'O campus histórico do ato não pode ser alterado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; self_column text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mem_membros','cui_convertidos','nsm_eventos','mem_trilha_valores'] LOOP
    self_column:=CASE WHEN t='mem_membros' THEN 'id' ELSE 'membro_id' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE TRIGGER aa_campus_destino_explicito BEFORE INSERT OR UPDATE OF igreja_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_campus_destino_explicito()',t);
    -- Policies por comando: a exceção de leitura própria não libera UPDATE.
    EXECUTE format('CREATE POLICY campus_destino_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id) OR %I=public.current_user_membro_id())',t,self_column);
    EXECUTE format('CREATE POLICY campus_destino_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY campus_destino_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
    EXECUTE format('CREATE POLICY campus_destino_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.fn_campus_dado_pessoal_permitido(igreja_id))',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.tg_campus_destino_explicito() FROM PUBLIC,anon,authenticated;

-- O vínculo com um culto é evidência mais forte que o campus-base da pessoa.
CREATE OR REPLACE FUNCTION public.tg_convertido_conferir_campus_culto()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_campus uuid;
BEGIN
  IF NEW.culto_id IS NOT NULL THEN
    SELECT igreja_id INTO v_campus FROM public.cultos WHERE id=NEW.culto_id FOR SHARE;
    IF v_campus IS NULL OR NEW.igreja_id IS DISTINCT FROM v_campus THEN
      RAISE EXCEPTION 'Campus do convertido diverge do culto.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ab_convertido_campus BEFORE INSERT OR UPDATE OF culto_id,igreja_id ON public.cui_convertidos
  FOR EACH ROW EXECUTE FUNCTION public.tg_convertido_conferir_campus_culto();
REVOKE ALL ON FUNCTION public.tg_convertido_conferir_campus_culto() FROM PUBLIC,anon,authenticated;

-- Mesma função viva/piloto: única extensão nova é o campus da trilha.
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_jornada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
  DECLARE
    v_data_culto date;
  BEGIN
    IF NEW.tipo_decisao = 'kids' THEN
      RETURN NEW;
    END IF;

    IF NEW.membro_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT data INTO v_data_culto FROM public.cultos WHERE id = NEW.culto_id;
    IF v_data_culto IS NULL THEN v_data_culto := CURRENT_DATE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.mem_trilha_valores
       WHERE membro_id = NEW.membro_id AND etapa = 'conversao'
    ) THEN
      INSERT INTO public.mem_trilha_valores (
        membro_id, etapa, concluida, data_conclusao, observacoes, igreja_id
      ) VALUES (
        NEW.membro_id, 'conversao', true, v_data_culto,
        'Decisao registrada no culto (cultos_decisoes_pessoas.id=' || NEW.id::text || ')', NEW.igreja_id
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.nsm_eventos
       WHERE origem = 'culto_decisao' AND origem_id = NEW.id
    ) THEN
      INSERT INTO public.nsm_eventos (
        membro_id, cpf, nome,
        data_decisao, valor_engajado, data_engajamento,
        origem, origem_id, observacao, igreja_id
      ) VALUES (
        NEW.membro_id, NEW.cpf, NEW.nome,
        v_data_culto, 'seguir', v_data_culto,
        'culto_decisao', NEW.id,
        'Decisao de Cristo registrada via modal de culto', NEW.igreja_id
      )
      ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado)
        DO NOTHING;
    END IF;

    RETURN NEW;
  END $function$
;

-- Não declarar a frente fechada só porque estes quatro destinos estão cobertos.
UPDATE public.app_campus_cobertura SET rls_validada=false,regressao_validada=false
  WHERE frente IN ('pessoas','cuidados','indicadores');
COMMIT;

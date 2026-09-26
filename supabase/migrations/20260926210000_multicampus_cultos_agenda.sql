-- Piloto operacional: campus do culto, decisões e agenda local.
-- Não ativa multicampus. Preserva policies anteriores e adiciona restrições.
BEGIN;

-- Um backfill histórico só é inequívoco antes de operar outra sede física.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_campus_config c JOIN public.igrejas i ON i.id=c.campus_legado_id
    WHERE c.id AND c.estado='preparacao' AND NOT c.ja_ativado
      AND i.id='00000000-0000-0000-0000-000000000001' AND i.ativa AND i.tipo='sede'
  ) OR (SELECT count(*) FROM public.igrejas WHERE ativa AND tipo='sede') <> 1 THEN
    RAISE EXCEPTION 'Backfill de cultos exige preparação e uma única Sede legada ativa.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_campus_legado_escrita()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT campus_legado_id INTO v_id FROM public.app_campus_config
    WHERE id AND estado='preparacao' AND NOT ja_ativado;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Campus explícito obrigatório.' USING ERRCODE='23514';
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_legado_escrita() FROM PUBLIC,anon;
-- Permite o DEFAULT legado a quem já tinha INSERT; não concede acesso à tabela.
GRANT EXECUTE ON FUNCTION public.fn_campus_legado_escrita() TO authenticated,service_role;

ALTER TABLE public.cultos ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.cultos SET igreja_id=public.fn_campus_legado_escrita();
ALTER TABLE public.cultos ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE public.cultos ALTER COLUMN igreja_id SET DEFAULT public.fn_campus_legado_escrita();
ALTER TABLE public.cultos DROP CONSTRAINT uniq_culto_service_data;
ALTER TABLE public.cultos ADD CONSTRAINT uniq_culto_campus_service_data UNIQUE(igreja_id,service_type_id,data);
ALTER TABLE public.cultos ADD CONSTRAINT cultos_id_igreja_unique UNIQUE(id,igreja_id);
CREATE INDEX idx_cultos_campus_data ON public.cultos(igreja_id,data DESC);

CREATE OR REPLACE FUNCTION public.tg_culto_preservar_campus()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'O campus histórico do culto não pode ser alterado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER culto_preservar_campus BEFORE UPDATE OF igreja_id ON public.cultos
  FOR EACH ROW EXECUTE FUNCTION public.tg_culto_preservar_campus();

ALTER TABLE public.cultos_decisoes_pessoas ADD COLUMN igreja_id uuid REFERENCES public.igrejas(id);
UPDATE public.cultos_decisoes_pessoas d SET igreja_id=c.igreja_id FROM public.cultos c WHERE c.id=d.culto_id;
UPDATE public.cultos_decisoes_pessoas SET igreja_id=public.fn_campus_legado_escrita() WHERE culto_id IS NULL;
ALTER TABLE public.cultos_decisoes_pessoas ALTER COLUMN igreja_id SET NOT NULL;
-- SET NULL apenas no vínculo: conserva o campus do ato mesmo sem culto pai.
ALTER TABLE public.cultos_decisoes_pessoas ADD CONSTRAINT decisoes_culto_mesmo_campus_fk
  FOREIGN KEY(culto_id,igreja_id) REFERENCES public.cultos(id,igreja_id) ON DELETE SET NULL (culto_id);
CREATE INDEX idx_decisoes_campus_culto ON public.cultos_decisoes_pessoas(igreja_id,culto_id);

CREATE OR REPLACE FUNCTION public.tg_decisao_herdar_campus()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_campus uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'O campus histórico da decisão não pode ser alterado.' USING ERRCODE='23514';
  END IF;
  IF NEW.culto_id IS NOT NULL THEN
    SELECT igreja_id INTO v_campus FROM public.cultos WHERE id=NEW.culto_id AND deleted_at IS NULL FOR SHARE;
    IF v_campus IS NULL THEN
      RAISE EXCEPTION 'Culto indisponível para vincular a decisão.' USING ERRCODE='23503';
    END IF;
    IF NEW.igreja_id IS NOT NULL AND NEW.igreja_id<>v_campus THEN
      RAISE EXCEPTION 'Campus da decisão diverge do culto.' USING ERRCODE='23514';
    END IF;
    NEW.igreja_id:=v_campus;
  ELSIF NEW.igreja_id IS NULL THEN
    NEW.igreja_id:=public.fn_campus_legado_escrita();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER aa_decisao_herdar_campus BEFORE INSERT OR UPDATE OF culto_id,igreja_id ON public.cultos_decisoes_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.tg_decisao_herdar_campus();

CREATE TABLE public.vol_campus_service_types (
  igreja_id uuid NOT NULL REFERENCES public.igrejas(id),
  service_type_id uuid NOT NULL REFERENCES public.vol_service_types(id),
  recurrence_day smallint CHECK(recurrence_day BETWEEN 0 AND 6),
  recurrence_time time,
  is_active boolean NOT NULL DEFAULT true,
  capacidade_lugares integer CHECK(capacidade_lugares>0),
  PRIMARY KEY(igreja_id,service_type_id)
);
COMMENT ON TABLE public.vol_campus_service_types IS
  'Agenda por campus; dia e horário nulos herdam o catálogo. Sem PII; chave composta dispensa soft-delete, desativação por is_active.';
INSERT INTO public.vol_campus_service_types(igreja_id,service_type_id,recurrence_day,recurrence_time,is_active,capacidade_lugares)
  SELECT public.fn_campus_legado_escrita(),id,NULL,NULL,true,1300
  FROM public.vol_service_types;
-- NULL herda o catálogo; só edição humana cria override local.
-- Tipos novos continuam gerando agenda legada durante a preparação.
CREATE OR REPLACE FUNCTION public.tg_service_type_agenda_legada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_legado uuid;
BEGIN
  SELECT campus_legado_id INTO v_legado FROM public.app_campus_config
    WHERE id AND estado='preparacao' AND NOT ja_ativado;
  IF v_legado IS NOT NULL THEN
    INSERT INTO public.vol_campus_service_types(igreja_id,service_type_id,capacidade_lugares)
      VALUES(v_legado,NEW.id,1300) ON CONFLICT(igreja_id,service_type_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER service_type_agenda_legada AFTER INSERT ON public.vol_service_types
  FOR EACH ROW EXECUTE FUNCTION public.tg_service_type_agenda_legada();
REVOKE ALL ON FUNCTION public.tg_service_type_agenda_legada() FROM PUBLIC,anon,authenticated;
ALTER TABLE public.vol_campus_service_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vol_campus_service_types FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.vol_campus_service_types TO service_role;
GRANT SELECT ON public.vol_campus_service_types TO authenticated;
CREATE POLICY campus_agenda_leitura ON public.vol_campus_service_types FOR SELECT TO authenticated
  USING(public.fn_campus_permitido(igreja_id,'integracao'));
CREATE POLICY campus_agenda_service ON public.vol_campus_service_types FOR ALL TO service_role USING(true) WITH CHECK(true);

CREATE OR REPLACE FUNCTION public.gerar_cultos_recorrentes_campus(
  p_igreja_id uuid,p_data_inicio date,p_data_fim date
) RETURNS TABLE(out_service_type text,out_data date,out_status text)
LANGUAGE plpgsql SET search_path=public,extensions AS $$
DECLARE v_st record; v_data date; v_criado uuid;
BEGIN
  IF p_igreja_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.igrejas WHERE id=p_igreja_id AND ativa AND tipo='sede') THEN
    RAISE EXCEPTION 'Campus físico ativo obrigatório.' USING ERRCODE='23514';
  END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_inicio>p_data_fim THEN
    RAISE EXCEPTION 'Período de cultos inválido.' USING ERRCODE='22023';
  END IF;
  FOR v_st IN
    SELECT s.id,s.name,COALESCE(a.recurrence_day,s.recurrence_day) AS dia,
      COALESCE(a.recurrence_time,s.recurrence_time) AS hora,s.vigente_de,s.vigente_ate
    FROM public.vol_campus_service_types a JOIN public.vol_service_types s ON s.id=a.service_type_id
    WHERE a.igreja_id=p_igreja_id AND a.is_active AND s.is_active
      AND COALESCE(a.recurrence_day,s.recurrence_day) IS NOT NULL
      AND COALESCE(a.recurrence_time,s.recurrence_time) IS NOT NULL
  LOOP
    v_data:=p_data_inicio;
    WHILE v_data<=p_data_fim LOOP
      IF extract(dow FROM v_data)::int=v_st.dia
        AND (v_st.vigente_de IS NULL OR v_data>=v_st.vigente_de)
        AND (v_st.vigente_ate IS NULL OR v_data<=v_st.vigente_ate) THEN
        v_criado:=NULL;
        INSERT INTO public.cultos(igreja_id,service_type_id,nome,data,hora,
          presencial_adulto,presencial_kids,decisoes_presenciais,decisoes_online,visitantes,visitantes_online,voluntarios)
        VALUES(p_igreja_id,v_st.id,v_st.name||' — '||to_char(v_data,'DD/MM/YYYY'),v_data,v_st.hora,0,0,0,0,0,0,0)
        ON CONFLICT(igreja_id,service_type_id,data) DO NOTHING RETURNING id INTO v_criado;
        out_service_type:=v_st.name; out_data:=v_data;
        out_status:=CASE WHEN v_criado IS NULL THEN 'ja_existia' ELSE 'criado' END;
        RETURN NEXT;
      END IF;
      v_data:=v_data+1;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.gerar_cultos_recorrentes_campus(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_cultos_recorrentes_campus(uuid,date,date) TO service_role;

-- CREATE OR REPLACE conserva os grants antigos. O wrapper não é SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.gerar_cultos_recorrentes(p_data_inicio date,p_data_fim date)
RETURNS TABLE(out_service_type text,out_data date,out_status text)
LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.gerar_cultos_recorrentes_campus(
    public.fn_campus_legado_escrita(),p_data_inicio,p_data_fim);
END $$;

ALTER TABLE public.cultos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultos_decisoes_pessoas ENABLE ROW LEVEL SECURITY;
CREATE POLICY cultos_campus_restritivo ON public.cultos AS RESTRICTIVE FOR ALL TO authenticated
  USING(public.fn_campus_permitido(igreja_id,'integracao'))
  WITH CHECK(public.fn_campus_permitido(igreja_id,'integracao'));
CREATE POLICY decisoes_campus_restritivo ON public.cultos_decisoes_pessoas AS RESTRICTIVE FOR ALL TO authenticated
  USING(public.fn_campus_permitido(igreja_id,'integracao'))
  WITH CHECK(public.fn_campus_permitido(igreja_id,'integracao'));
REVOKE ALL ON FUNCTION public.tg_culto_preservar_campus(), public.tg_decisao_herdar_campus() FROM PUBLIC,anon,authenticated;

-- Matcher global preservado; apenas a pessoa nova recebe o campus do ato.
-- O trigger aa_decisao_herdar_campus antecede o matcher pela ordem do PostgreSQL.
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_resolve_membro()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_membro_id uuid;
  v_cpf_limpo text;
  v_tel_limpo text;
  v_criado boolean := false;
BEGIN
  -- Normaliza CPF (so digitos)
  IF NEW.cpf IS NOT NULL THEN
    v_cpf_limpo := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF length(v_cpf_limpo) = 11 THEN
      NEW.cpf := v_cpf_limpo;
    ELSE
      NEW.cpf := NULL;
    END IF;
  END IF;

  -- Normaliza CPF do responsavel (so digitos)
  IF NEW.responsavel_cpf IS NOT NULL THEN
    v_cpf_limpo := regexp_replace(NEW.responsavel_cpf, '\D', '', 'g');
    IF length(v_cpf_limpo) = 11 THEN
      NEW.responsavel_cpf := v_cpf_limpo;
    ELSE
      NEW.responsavel_cpf := NULL;
    END IF;
  END IF;

  -- KIDS: NÃO cria mem_membros automaticamente (LGPD com menores).
  IF NEW.tipo_decisao = 'kids' THEN
    NEW.membro_id := NULL;
    RETURN NEW;
  END IF;

  -- Se já veio com membro_id explícito (via UI de busca), respeita
  IF NEW.membro_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) CPF exato (só cadastros vivos · o índice UNIQUE é parcial em vivos)
  IF NEW.cpf IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = NEW.cpf
       AND deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- 2) E-mail + NOME compatível (e-mail da família compartilhado não pode
  --    ligar sozinho · política membroMatch)
  IF v_membro_id IS NULL AND NEW.email IS NOT NULL AND length(NEW.email) > 3 THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE lower(email) = lower(NEW.email)
       AND deleted_at IS NULL
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 3) Telefone + NOME compatível (branch NOVO · a decisão típica traz só
  --    nome+telefone — sem este branch, quem já existia virava stub duplicado)
  v_tel_limpo := NULLIF(regexp_replace(COALESCE(NEW.telefone, ''), '\D', '', 'g'), '');
  IF v_membro_id IS NULL AND v_tel_limpo IS NOT NULL AND length(v_tel_limpo) >= 10 THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE deleted_at IS NULL
       AND regexp_replace(COALESCE(telefone, ''), '\D', '', 'g') = v_tel_limpo
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 4) Nome compatível + data_nascimento (criterio estavel)
  IF v_membro_id IS NULL AND NEW.data_nascimento IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE data_nascimento = NEW.data_nascimento
       AND deleted_at IS NULL
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 5) Cria membro novo (status visitante) com os dados disponíveis.
  --    Corrida 23505 no CPF (dois fluxos com o mesmo CPF novo) religa no
  --    vencedor em vez de estourar o INSERT da decisão.
  IF v_membro_id IS NULL THEN
    BEGIN
      INSERT INTO public.mem_membros (
        nome, email, telefone, cpf, data_nascimento, status, igreja_id
      ) VALUES (
        NEW.nome,
        NEW.email,
        NEW.telefone,
        NEW.cpf,
        NEW.data_nascimento,
        'visitante',
        NEW.igreja_id
      ) RETURNING id INTO v_membro_id;
      v_criado := true;
    EXCEPTION WHEN unique_violation THEN
      IF NEW.cpf IS NOT NULL THEN
        SELECT id INTO v_membro_id
          FROM public.mem_membros
         WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = NEW.cpf
           AND deleted_at IS NULL
         LIMIT 1;
      END IF;
      IF v_membro_id IS NULL THEN
        RAISE;
      END IF;
    END;
  END IF;

  -- Contato divergente ACUMULA no cadastro (mem_contatos · nunca sobrescreve
  -- o principal). Só quando ligou em membro EXISTENTE — no criado, o contato
  -- da decisão JÁ é o principal.
  IF NOT v_criado THEN
    PERFORM public.fn_registrar_contato(v_membro_id, NEW.telefone, NEW.email, 'decisao');
  END IF;

  NEW.membro_id := v_membro_id;
  RETURN NEW;
END $function$
;

-- Atribuição histórica pelo evento pai; não altera o campus-base da pessoa.
UPDATE public.cui_convertidos cv SET igreja_id=c.igreja_id
  FROM public.cultos c WHERE c.id=cv.culto_id AND cv.igreja_id IS DISTINCT FROM c.igreja_id;
UPDATE public.nsm_eventos e SET igreja_id=d.igreja_id
  FROM public.cultos_decisoes_pessoas d WHERE e.origem='culto_decisao' AND e.origem_id=d.id
    AND e.igreja_id IS DISTINCT FROM d.igreja_id;
-- Propaga o campus aos destinos; critérios canônicos de deduplicação preservados.
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
        membro_id, etapa, concluida, data_conclusao, observacoes
      ) VALUES (
        NEW.membro_id, 'conversao', true, v_data_culto,
        'Decisao registrada no culto (cultos_decisoes_pessoas.id=' || NEW.id::text || ')'
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

CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_to_cuidados()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_data_culto date;
    v_st_name    text;
    v_area       text;
  BEGIN
    IF COALESCE(NEW.tipo_decisao, 'presencial') = 'kids' THEN
      RETURN NEW;
    END IF;

    SELECT c.data, st.name INTO v_data_culto, v_st_name
      FROM public.cultos c
      LEFT JOIN public.vol_service_types st ON st.id = c.service_type_id
     WHERE c.id = NEW.culto_id;
    IF v_data_culto IS NULL THEN
      RETURN NEW;
    END IF;

    IF COALESCE(NEW.tipo_decisao, 'presencial') = 'online' THEN
      v_area := 'online';
    ELSIF v_st_name ILIKE '%ami%' THEN
      v_area := 'ami';
    ELSIF v_st_name ILIKE '%bridge%' THEN
      v_area := 'bridge';
    ELSE
      v_area := 'sede';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.cui_convertidos cv
      WHERE (NEW.membro_id IS NOT NULL AND cv.membro_id = NEW.membro_id)
         OR (
           NEW.membro_id IS NULL
           AND lower(trim(cv.nome)) = lower(trim(NEW.nome))
           AND cv.data_culto = COALESCE(NEW.decidiu_em, v_data_culto)
         )
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.cui_convertidos
      (data_culto, culto_id, membro_id, nome, telefone, cpf,
       atendido_apos_culto, cadastrado, observacoes, area, igreja_id)
    VALUES
      (COALESCE(NEW.decidiu_em, v_data_culto), NEW.culto_id, NEW.membro_id, TRIM(NEW.nome),
       NEW.telefone, NEW.cpf, false, (NEW.membro_id IS NOT NULL), NEW.observacoes, v_area, NEW.igreja_id);

    RETURN NEW;
  END $function$
;

-- Coluna nova anexada: preserva nomes/ordem/tipos da view existente.
CREATE OR REPLACE VIEW public.vw_culto_stats WITH(security_invoker=true) AS
 SELECT c.id,
    c.service_type_id,
    c.nome,
    c.data,
    c.hora,
    c.presencial_adulto,
    c.presencial_kids,
    c.decisoes_presenciais,
    c.decisoes_online,
    c.youtube_video_id,
    c.online_pico,
    c.online_ds,
    c.online_ddus,
    c.ds_coletado_em,
    c.ddus_coletado_em,
    c.inserido_por,
    c.created_at,
    c.updated_at,
    c.visitantes,
    c.visitantes_online,
    c.voluntarios,
    c.decisoes_kids,
    c.observacoes,
    c.online_watch_minutes_ds,
    c.online_watch_minutes_ddus,
    c.online_retencao_pct_ds,
    c.online_retencao_pct_ddus,
    c.online_subs_ganhos,
    c.online_subs_perdidos,
    c.online_views_inscritos,
    c.online_views_nao_inscritos,
    c.deleted_at,
    c.voluntarios_escalados,
    c.voluntarios_checkin,
    c.online_decisoes_chat,
    c.online_chat_page_token,
    c.frequencia_lancada,
    c.decisoes_lancadas,
    vst.name AS service_type_name,
    vst.color AS service_type_color,
    vst.presencial_label AS service_type_presencial_label,
    vst.has_kids AS service_type_has_kids,
    vst.has_online AS service_type_has_online,
    round(c.presencial_adulto::numeric / NULLIF(agenda.capacidade_lugares,0)::numeric * 100::numeric, 1) AS taxa_ocupacao,
    c.presencial_adulto + c.presencial_kids AS total_presencial,
    COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0) AS total_decisoes,
    c.igreja_id
   FROM cultos c
     LEFT JOIN vol_service_types vst ON c.service_type_id = vst.id
     LEFT JOIN public.vol_campus_service_types agenda ON agenda.igreja_id=c.igreja_id AND agenda.service_type_id=c.service_type_id;

CREATE OR REPLACE FUNCTION public.fn_campus_soft_delete_culto(
  p_culto_id uuid,p_igreja_id uuid,p_usuario_id uuid
) RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF p_culto_id IS NULL OR p_igreja_id IS NULL OR p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Culto, campus e usuário são obrigatórios.' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.cultos WHERE id=p_culto_id AND igreja_id=p_igreja_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.app_soft_delete('cultos',p_culto_id::text,p_usuario_id);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_soft_delete_culto(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_soft_delete_culto(uuid,uuid,uuid) TO service_role;

-- O resultado de cada campus cabe em uma linha: o teto de 1000 do PostgREST
-- não pode truncar o número de cultos gerados pelo cron.
CREATE OR REPLACE FUNCTION public.fn_campus_gerar_cultos_resumo(
  p_igreja_id uuid,p_data_inicio date,p_data_fim date
) RETURNS jsonb LANGUAGE sql SET search_path=public AS $$
  SELECT jsonb_build_object(
    'total',count(*),
    'criados',count(*) FILTER(WHERE out_status='criado'),
    'ja_existia',count(*) FILTER(WHERE out_status='ja_existia')
  ) FROM public.gerar_cultos_recorrentes_campus(p_igreja_id,p_data_inicio,p_data_fim);
$$;
REVOKE ALL ON FUNCTION public.fn_campus_gerar_cultos_resumo(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_gerar_cultos_resumo(uuid,date,date) TO service_role;

COMMIT;

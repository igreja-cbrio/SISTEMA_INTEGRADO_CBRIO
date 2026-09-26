-- Kids: operações locais atômicas e bloqueio dos produtores legados ambíguos.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_kids_reservar_codigos(p_estacao_ref text, p_sessao_id uuid, p_quantidade integer DEFAULT 60, p_estacao_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(codigo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_falta integer;
    v_novo  text;
    v_i     integer := 0;
  BEGIN
 PERFORM public.fn_campus_legado_escrita(); -- legado apenas antes da ativação
    IF p_estacao_ref IS NULL OR btrim(p_estacao_ref) = '' THEN
      RAISE EXCEPTION 'estacao_ref obrigatorio';
    END IF;
    IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 200 THEN
      RAISE EXCEPTION 'quantidade fora da faixa (1..200)';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('kids-reserva:' || p_estacao_ref, 0));

    SELECT p_quantidade - count(*) INTO v_falta
      FROM public.kids_codigos_reservados r
     WHERE r.estacao_ref = p_estacao_ref
       AND r.sessao_id IS NOT DISTINCT FROM p_sessao_id
       AND r.status = 'reservado';

    WHILE v_falta > 0 AND v_i < p_quantidade * 5 LOOP
      v_i := v_i + 1;
      v_novo := public.fn_kids_gerar_codigo_seguranca();
      BEGIN
        INSERT INTO public.kids_codigos_reservados
          (codigo, estacao_id, estacao_ref, sessao_id)
        VALUES (v_novo, p_estacao_id, p_estacao_ref, p_sessao_id);
        v_falta := v_falta - 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;

    RETURN QUERY
      SELECT r.codigo
        FROM public.kids_codigos_reservados r
       WHERE r.estacao_ref = p_estacao_ref
         AND r.sessao_id IS NOT DISTINCT FROM p_sessao_id
         AND r.status = 'reservado'
       ORDER BY r.reservado_em;
  END;
  $function$
;
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_forcado_pendentes()
 RETURNS TABLE(checkins_fechados integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
  DECLARE v_count int;
  BEGIN
 PERFORM public.fn_campus_legado_escrita(); -- legado apenas antes da ativação
    UPDATE public.kids_checkins
      SET checkout_at = now(), checkout_metodo = 'checkout_forcado',
          observacoes_no_dia = COALESCE(observacoes_no_dia || ' · ', '') || 'Checkout forcado pelo cron noturno ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
      WHERE checkout_at IS NULL
        AND (checkin_at < now() - INTERVAL '8 hours'
             OR EXISTS (SELECT 1 FROM public.kids_sessoes s WHERE s.id = kids_checkins.sessao_id AND s.status = 'encerrada' AND s.encerrada_at < now() -
  INTERVAL '1 hour'));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    checkins_fechados := v_count;
    RETURN NEXT;
  END $function$
;
CREATE OR REPLACE FUNCTION public.merge_kids_criancas(p_keep uuid, p_merge uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pco text;
BEGIN
 PERFORM public.fn_campus_legado_escrita(); -- legado apenas antes da ativação
  IF p_keep IS NULL OR p_merge IS NULL OR array_length(p_merge, 1) IS NULL THEN
    RAISE EXCEPTION 'keep e merge obrigatórios';
  END IF;
  IF p_keep = ANY(p_merge) THEN
    RAISE EXCEPTION 'a criança mantida não pode estar na lista de fundidas';
  END IF;

  DELETE FROM kids_responsaveis r
   WHERE r.crianca_id = ANY(p_merge)
     AND EXISTS (SELECT 1 FROM kids_responsaveis k WHERE k.crianca_id = p_keep AND k.membro_id = r.membro_id);
  UPDATE kids_responsaveis SET crianca_id = p_keep WHERE crianca_id = ANY(p_merge);

  UPDATE kids_checkins        SET crianca_id = p_keep       WHERE crianca_id = ANY(p_merge);
  UPDATE kids_chamadas        SET crianca_id = p_keep       WHERE crianca_id = ANY(p_merge);
  UPDATE kids_atendimentos    SET crianca_id = p_keep       WHERE crianca_id = ANY(p_merge);
  UPDATE cultos_decisoes_pessoas SET kids_crianca_id = p_keep WHERE kids_crianca_id = ANY(p_merge);
  UPDATE kids_vinculo_solicitacoes SET crianca_id = p_keep        WHERE crianca_id = ANY(p_merge);
  UPDATE kids_vinculo_solicitacoes SET crianca_criada_id = p_keep WHERE crianca_criada_id = ANY(p_merge);

  SELECT max(planning_center_id) INTO v_pco
    FROM kids_criancas WHERE id = ANY(p_merge) AND planning_center_id IS NOT NULL;
  UPDATE kids_criancas SET planning_center_id = NULL WHERE id = ANY(p_merge);

  UPDATE kids_criancas k SET
    data_nascimento        = COALESCE(k.data_nascimento, m.data_nascimento),
    sexo                   = COALESCE(k.sexo, m.sexo),
    serie                  = COALESCE(k.serie, m.serie),
    foto_url               = COALESCE(k.foto_url, m.foto_url),
    foto_storage_path      = COALESCE(k.foto_storage_path, m.foto_storage_path),
    observacoes_medicas    = COALESCE(k.observacoes_medicas, m.observacoes_medicas),
    necessidades_especiais = COALESCE(k.necessidades_especiais, m.necessidades_especiais),
    data_conversao         = COALESCE(k.data_conversao, m.data_conversao),
    data_batismo           = COALESCE(k.data_batismo, m.data_batismo)
  FROM (
    SELECT
      max(data_nascimento) AS data_nascimento, max(sexo) AS sexo, max(serie) AS serie,
      max(foto_url) AS foto_url, max(foto_storage_path) AS foto_storage_path,
      max(observacoes_medicas) AS observacoes_medicas, max(necessidades_especiais) AS necessidades_especiais,
      max(data_conversao) AS data_conversao, max(data_batismo) AS data_batismo
    FROM kids_criancas WHERE id = ANY(p_merge)
  ) m
  WHERE k.id = p_keep;

  UPDATE kids_criancas
     SET planning_center_id = v_pco
   WHERE id = p_keep AND planning_center_id IS NULL AND v_pco IS NOT NULL;

  UPDATE kids_criancas
     SET deleted_at = now(), ativo = false,
         motivo_inativacao = 'Fundida na criança ' || p_keep::text
   WHERE id = ANY(p_merge);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_kids_ausentes_consecutivos(p_min integer DEFAULT 3)
 RETURNS TABLE(crianca_id uuid, nome text, ultima_presenca date, cultos_perdidos integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$ BEGIN
 PERFORM public.fn_campus_legado_escrita();
 RETURN QUERY WITH pres AS (
    SELECT DISTINCT ck.crianca_id, cu.data
    FROM public.kids_checkins ck
    JOIN public.kids_sessoes s ON s.id = ck.sessao_id
    JOIN public.cultos cu ON cu.id = s.culto_id
    WHERE ck.deleted_at IS NULL
      AND cu.data <= CURRENT_DATE
  ),
  cal AS (
    SELECT DISTINCT data FROM pres
  ),
  ult AS (
    SELECT p.crianca_id, max(p.data) AS ultima_data
    FROM pres p
    GROUP BY p.crianca_id
  )
  SELECT
    k.id, k.nome, ult.ultima_data,
    (SELECT count(*) FROM cal WHERE cal.data > ult.ultima_data)::int AS cultos_perdidos
  FROM public.kids_criancas k
  JOIN ult ON ult.crianca_id = k.id
  WHERE k.ativo = true
    AND k.deleted_at IS NULL
    AND COALESCE(k.visitante, false) = false
    AND ult.ultima_data >= (CURRENT_DATE - INTERVAL '90 days')
    AND (SELECT count(*) FROM cal WHERE cal.data > ult.ultima_data) >= p_min;
END $function$;
CREATE OR REPLACE FUNCTION public.fn_kids_sessao_consolida_culto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_total int;
  v_decisoes int;
BEGIN
  IF NEW.status = 'encerrada'
     AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'encerrada') THEN

    SELECT COUNT(DISTINCT crianca_id),
           COUNT(DISTINCT crianca_id) FILTER (WHERE fez_decisao_jesus = true)
      INTO v_total, v_decisoes
      FROM public.kids_checkins
      WHERE sessao_id = NEW.id AND igreja_id=NEW.igreja_id
        AND deleted_at IS NULL;

    UPDATE public.cultos
      SET presencial_kids = v_total,
          decisoes_kids   = v_decisoes,
          updated_at      = now()
      WHERE id = NEW.culto_id AND igreja_id=NEW.igreja_id;
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_kids_decisao_para_culto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
  DECLARE v_culto_id uuid; v_crianca_nome text; v_cpf_resp text;
  BEGIN
    IF NEW.fez_decisao_jesus = true AND (OLD.fez_decisao_jesus IS DISTINCT FROM NEW.fez_decisao_jesus) THEN
      SELECT culto_id INTO v_culto_id FROM public.kids_sessoes WHERE id = NEW.sessao_id AND igreja_id=NEW.igreja_id;
      SELECT nome INTO v_crianca_nome FROM public.kids_criancas WHERE id = NEW.crianca_id;
      IF NEW.responsavel_checkin_id IS NOT NULL THEN
        SELECT cpf INTO v_cpf_resp FROM public.mem_membros WHERE id = NEW.responsavel_checkin_id;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.cultos_decisoes_pessoas
         WHERE culto_id = v_culto_id AND tipo_decisao = 'kids' AND kids_crianca_id = NEW.crianca_id
      ) THEN
        INSERT INTO public.cultos_decisoes_pessoas (culto_id, tipo_decisao, nome, responsavel_nome, responsavel_telefone, responsavel_cpf, kids_crianca_id, igreja_id)
        VALUES (v_culto_id, 'kids', v_crianca_nome, NEW.responsavel_checkin_nome, NEW.responsavel_checkin_telefone, v_cpf_resp, NEW.crianca_id, NEW.igreja_id);
      END IF;
      IF NEW.decisao_jesus_em IS NULL THEN NEW.decisao_jesus_em := now(); END IF;
    END IF;
    RETURN NEW;
  END $function$
;
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_fecha_chamadas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.checkout_at IS NOT NULL
     AND (OLD.checkout_at IS NULL OR OLD.checkout_at IS DISTINCT FROM NEW.checkout_at)
  THEN
    UPDATE public.kids_chamadas
      SET atendida_em = NEW.checkout_at,
          atendida_por = NEW.checkout_por
     WHERE checkin_id = NEW.id AND igreja_id=NEW.igreja_id
       AND atendida_em IS NULL;
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_cancela_pager()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.checkout_at IS NOT NULL AND OLD.checkout_at IS NULL THEN
    UPDATE public.kids_pager_envios
       SET status = 'cancelado'
     WHERE checkin_id = NEW.id AND igreja_id=NEW.igreja_id AND status = 'pendente';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_campus_kids_checkin(
 p_igreja_id uuid,p_sessao_id uuid,p_crianca_id uuid,p_sala_id uuid,p_estacao_id uuid,p_responsavel_id uuid,p_usuario_id uuid,
 p_codigo_reservado text DEFAULT NULL,p_cultos_extras uuid[] DEFAULT '{}',
 p_responsavel_nome text DEFAULT NULL,p_responsavel_telefone text DEFAULT NULL,p_responsavel_parentesco text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,extensions AS $$
DECLARE s public.kids_sessoes%ROWTYPE; c public.cultos%ROWTYPE; sala public.kids_salas%ROWTYPE;
 r public.kids_responsaveis%ROWTYPE; membro public.mem_membros%ROWTYPE; reserva public.kids_codigos_reservados%ROWTYPE;
 v_cultos uuid[]; v_sessoes uuid[]; v_culto uuid; v_sessao uuid; v_codigo text; v_grupo uuid:=gen_random_uuid();
 v_check public.kids_checkins%ROWTYPE; v_principal jsonb; v_extras jsonb:='[]'::jsonb; v_total integer; v_i integer;
 v_hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
 IF p_igreja_id IS NULL OR p_sessao_id IS NULL OR p_crianca_id IS NULL OR p_sala_id IS NULL OR p_responsavel_id IS NULL OR p_usuario_id IS NULL
 OR p_cultos_extras IS NULL OR cardinality(p_cultos_extras)>12 OR array_position(p_cultos_extras,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Check-in exige campus, sessão, criança, sala, responsável e usuário válidos.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.igrejas WHERE id=p_igreja_id AND ativa FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campus Kids indisponível.' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM public.kids_sessoes WHERE id=p_sessao_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
 IF NOT FOUND OR s.culto_id IS NULL THEN RAISE EXCEPTION 'Sessão Kids exige culto deste campus.' USING ERRCODE='23514'; END IF;
 SELECT array_agg(DISTINCT id ORDER BY id) INTO v_cultos FROM unnest(array_append(p_cultos_extras,s.culto_id)) id;
 -- Toda transação usa a mesma ordem: cultos, sessões, sala, criança, responsável, código.
 PERFORM id FROM public.cultos WHERE id=ANY(v_cultos) ORDER BY id FOR UPDATE;
 SELECT * INTO c FROM public.cultos WHERE id=s.culto_id AND igreja_id=p_igreja_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Culto Kids indisponível neste campus.' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO v_total FROM public.cultos WHERE id=ANY(v_cultos) AND igreja_id=p_igreja_id AND data=c.data AND deleted_at IS NULL;
 IF v_total<>cardinality(v_cultos) THEN RAISE EXCEPTION 'Cultos extras devem pertencer ao mesmo dia e campus.' USING ERRCODE='23514'; END IF;
 IF c.data<v_hoje OR (c.data>v_hoje AND EXISTS(SELECT 1 FROM public.kids_sessoes ks JOIN public.cultos cu ON cu.id=ks.culto_id
  WHERE ks.igreja_id=p_igreja_id AND ks.status='aberta' AND ks.deleted_at IS NULL AND cu.igreja_id=p_igreja_id AND cu.deleted_at IS NULL AND cu.data=v_hoje)) THEN
  RAISE EXCEPTION 'Escolha uma sessão Kids válida para o dia.' USING ERRCODE='23514'; END IF;
 FOREACH v_culto IN ARRAY v_cultos LOOP
  INSERT INTO public.kids_sessoes(culto_id,igreja_id,status,abrir_em)
   VALUES(v_culto,p_igreja_id,'aberta',now()) ON CONFLICT(culto_id) DO NOTHING;
 END LOOP;
 PERFORM id FROM public.kids_sessoes WHERE culto_id=ANY(v_cultos) ORDER BY id FOR UPDATE;
 SELECT array_agg(id ORDER BY id) INTO v_sessoes FROM public.kids_sessoes
  WHERE culto_id=ANY(v_cultos) AND igreja_id=p_igreja_id AND status='aberta' AND deleted_at IS NULL;
 IF cardinality(v_sessoes) IS DISTINCT FROM cardinality(v_cultos) OR NOT(p_sessao_id=ANY(v_sessoes)) THEN
  RAISE EXCEPTION 'Todas as sessões Kids devem estar abertas.' USING ERRCODE='23514'; END IF;
 SELECT * INTO sala FROM public.kids_salas WHERE id=p_sala_id AND igreja_id=p_igreja_id AND ativo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sala Kids indisponível neste campus.' USING ERRCODE='23514'; END IF;
 IF p_estacao_id IS NOT NULL THEN
  PERFORM 1 FROM public.kids_estacoes WHERE id=p_estacao_id AND igreja_id=p_igreja_id AND ativo
   AND (sala_id IS NULL OR sala_id=p_sala_id) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estação Kids incompatível com sala ou campus.' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM 1 FROM public.kids_criancas WHERE id=p_crianca_id AND ativo AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Criança Kids indisponível.' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM public.kids_responsaveis WHERE crianca_id=p_crianca_id AND membro_id=p_responsavel_id AND autorizado_buscar FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Responsável não autorizado para esta criança.' USING ERRCODE='23514'; END IF;
 SELECT * INTO membro FROM public.mem_membros WHERE id=p_responsavel_id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Responsável indisponível.' USING ERRCODE='23514'; END IF;
 PERFORM 1 FROM public.kids_crianca_campi WHERE crianca_id=p_crianca_id AND igreja_id=p_igreja_id AND ativo FOR SHARE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado) THEN
   -- Primeiro ato válido do legado comprova participação; uma falha posterior
   -- reverte também o vínculo. Não é inferência pelo campus-base do responsável.
   INSERT INTO public.kids_crianca_campi(crianca_id,igreja_id,criado_por)
    VALUES(p_crianca_id,p_igreja_id,p_usuario_id) ON CONFLICT DO NOTHING;
   PERFORM 1 FROM public.kids_crianca_campi WHERE crianca_id=p_crianca_id AND igreja_id=p_igreja_id AND ativo FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo Kids desativado.' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION 'Criança sem vínculo ativo com este campus.' USING ERRCODE='23514'; END IF;
 END IF;
 -- Snapshots são canônicos, parâmetros de apresentação não mudam identidade.
 IF EXISTS(SELECT 1 FROM public.kids_checkins WHERE sessao_id=ANY(v_sessoes) AND crianca_id=p_crianca_id AND checkout_at IS NULL) THEN
  RAISE EXCEPTION 'Criança já tem check-in aberto em uma das sessões.' USING ERRCODE='23505'; END IF;
 SELECT count(DISTINCT k.crianca_id) INTO v_total FROM public.kids_checkins k JOIN public.kids_sessoes ks ON ks.id=k.sessao_id
  WHERE k.sala_id=p_sala_id AND k.igreja_id=p_igreja_id AND k.checkout_at IS NULL AND k.deleted_at IS NULL AND ks.status='aberta';
 IF v_total>=sala.capacidade AND NOT EXISTS(SELECT 1 FROM public.kids_checkins WHERE sala_id=p_sala_id AND igreja_id=p_igreja_id
  AND crianca_id=p_crianca_id AND checkout_at IS NULL AND deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Sala Kids sem capacidade disponível.' USING ERRCODE='23514'; END IF;
 IF p_codigo_reservado IS NOT NULL THEN
  SELECT * INTO reserva FROM public.kids_codigos_reservados WHERE codigo=p_codigo_reservado AND igreja_id=p_igreja_id FOR UPDATE;
  IF NOT FOUND OR reserva.status<>'reservado' OR reserva.estacao_id IS DISTINCT FROM p_estacao_id
   OR (reserva.sessao_id IS NOT NULL AND reserva.sessao_id<>p_sessao_id) THEN
   RAISE EXCEPTION 'Código reservado inválido para esta estação, sessão ou campus.' USING ERRCODE='23514'; END IF;
  v_codigo:=reserva.codigo;
 ELSE
  v_codigo:=public.fn_kids_gerar_codigo_seguranca();
 END IF;
 -- O trigger global de colisão preserva códigos entre campi. Erro aborta TODO o grupo.
 FOREACH v_sessao IN ARRAY v_sessoes LOOP
  INSERT INTO public.kids_checkins(sessao_id,crianca_id,sala_id,igreja_id,estacao_checkin_id,
   responsavel_checkin_id,responsavel_checkin_nome,responsavel_checkin_telefone,responsavel_checkin_parentesco,
   codigo_seguranca,codigo_barras,checkin_por,checkin_grupo_id)
  VALUES(v_sessao,p_crianca_id,p_sala_id,p_igreja_id,p_estacao_id,p_responsavel_id,membro.nome,membro.telefone,r.parentesco,
   v_codigo,v_codigo,p_usuario_id,v_grupo) RETURNING * INTO v_check;
  IF v_sessao=p_sessao_id THEN v_principal:=to_jsonb(v_check); ELSE v_extras:=v_extras||jsonb_build_array(to_jsonb(v_check)); END IF;
 END LOOP;
 IF p_codigo_reservado IS NOT NULL THEN
  UPDATE public.kids_codigos_reservados SET status='usado',usado_em=now(),checkin_id=(v_principal->>'id')::uuid
   WHERE codigo=p_codigo_reservado AND igreja_id=p_igreja_id;
 END IF;
 RETURN jsonb_build_object('checkin',v_principal,'extras',v_extras,'codigo_seguranca',v_codigo,'checkin_grupo_id',v_grupo);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_kids_checkin(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid[],text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_kids_checkin(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid[],text,text,text) TO service_role;
UPDATE public.app_campus_cobertura SET produtores_validados=false,regressao_validada=false WHERE frente IN('kids','jobs-notificacoes');
COMMIT;

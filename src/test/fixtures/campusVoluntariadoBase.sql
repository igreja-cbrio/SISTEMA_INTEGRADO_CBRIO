CREATE OR REPLACE FUNCTION public.fn_dash_vol_bloco_nome(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN p_nome ~~* 'Domingo - Manh%'  OR p_nome ~~* 'CBKIDS - Manh%'
      OR p_nome ~~* 'Domingo 08%'      OR p_nome ~~* 'Domingo 09%'
      OR p_nome ~~* 'Domingo 10%'      OR p_nome ~~* 'Domingo 11%'
      THEN 'Domingo Manhã'
    WHEN p_nome ~~* 'Domingo - Noite%' OR p_nome ~~* 'CBKIDS - Noite%'
      OR p_nome ~~* 'Domingo 18%'      OR p_nome ~~* 'Domingo 19%'
      OR p_nome ~~* 'Domingo 20%'
      THEN 'Domingo Noite'
    WHEN p_nome ~~* 'Quarta%'          OR p_nome ~~* 'CBKIDS - Quarta%' THEN 'Quarta'
    WHEN p_nome ~~* 'AMI%'             OR p_nome ~~* 'Culto AMI%'       THEN 'AMI'
    WHEN p_nome ~~* '%Bridge%'                                          THEN 'Bridge'
  END;
$function$
;
-- Catálogo estrutural vivo Voluntariado: sem PII. Sem vetor biométrico, FKs externos, auditoria, notificações ou recálculo KPI.
CREATE TABLE int_visitantes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"telefone" text,
"email" text,
"idade" integer,
"data_visita" date DEFAULT CURRENT_DATE NOT NULL,
"culto_id" uuid,
"origem" text,
"veio_acompanhado" boolean DEFAULT false,
"fez_decisao" boolean DEFAULT false,
"tipo_decisao" text,
"responsavel_id" uuid,
"status" text DEFAULT 'novo'::text NOT NULL,
"membresia_id" uuid,
"observacoes" text,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"cpf" text,
"igreja_id" uuid,
"deleted_at" timestamp with time zone
);
CREATE TABLE mem_ministerios(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"descricao" text,
"lider_id" uuid,
"cor" text DEFAULT '#00B39D'::text,
"ativo" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mem_voluntarios(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid,
"ministerio_id" uuid NOT NULL,
"papel" text,
"desde" date DEFAULT CURRENT_DATE NOT NULL,
"ate" date,
"motivo_saida" text,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"area" text,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
);
CREATE TABLE vol_area_supervisores(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid NOT NULL,
"area" text NOT NULL,
"concedido_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"position_id" uuid,
"culto_dia" text,
"culto_periodo" text,
"culto_semana" smallint,
"papel" text DEFAULT 'lider'::text NOT NULL,
"team_id" uuid
);
CREATE TABLE vol_availability(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"volunteer_profile_id" uuid,
"planning_center_person_id" text,
"unavailable_from" date NOT NULL,
"unavailable_to" date NOT NULL,
"reason" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"service_id" uuid
);
CREATE TABLE vol_background_checks(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"inscricao_id" uuid,
"membro_id" uuid,
"area" text,
"nome_completo" text,
"cpf" text,
"nome_mae" text,
"nome_pai" text,
"data_nascimento" date,
"uf_nascimento" text,
"consentimento" boolean DEFAULT false NOT NULL,
"consentimento_em" timestamp with time zone,
"consentimento_origem" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"fonte" text,
"resultado" text,
"certidao_url" text,
"consulta_raw" jsonb,
"consulta_em" timestamp with time zone,
"consulta_erro" text,
"revisado_por" uuid,
"revisado_por_nome" text,
"revisado_em" timestamp with time zone,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE vol_check_ins(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"schedule_id" uuid,
"volunteer_id" uuid,
"service_id" uuid,
"checked_in_by" uuid,
"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
"method" text NOT NULL,
"is_unscheduled" boolean DEFAULT false NOT NULL,
"volunteer_name" text
);
CREATE TABLE vol_config(
"id" integer DEFAULT 1 NOT NULL,
"muito_ativo_min" integer DEFAULT 8 NOT NULL,
"regular_min" integer DEFAULT 4 NOT NULL,
"pouco_ativo_min" integer DEFAULT 1 NOT NULL,
"sobrecarga_limite" integer DEFAULT 8 NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_by" uuid,
"pco_ativo" boolean DEFAULT true NOT NULL
);
CREATE TABLE vol_email_config(
"id" smallint DEFAULT 1 NOT NULL,
"assinatura_html" text DEFAULT ''::text NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_email_disparo_destinatarios(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"disparo_id" uuid NOT NULL,
"vol_profile_id" uuid,
"email" text NOT NULL,
"nome" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"erro_msg" text,
"enviado_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"aberto_em" timestamp with time zone,
"aberturas" integer DEFAULT 0 NOT NULL
);
CREATE TABLE vol_email_disparos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"assunto" text DEFAULT ''::text NOT NULL,
"corpo_html" text DEFAULT ''::text NOT NULL,
"segmento" jsonb DEFAULT '{"tipo": "todos"}'::jsonb NOT NULL,
"status" text DEFAULT 'rascunho'::text NOT NULL,
"agendado_para" timestamp with time zone,
"total_destinatarios" integer DEFAULT 0 NOT NULL,
"total_enviados" integer DEFAULT 0 NOT NULL,
"total_erros" integer DEFAULT 0 NOT NULL,
"criado_por" uuid,
"criado_por_nome" text,
"enviado_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"incluir_assinatura" boolean DEFAULT true NOT NULL
);
CREATE TABLE vol_email_templates(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"assunto" text DEFAULT ''::text NOT NULL,
"corpo_html" text DEFAULT ''::text NOT NULL,
"is_padrao" boolean DEFAULT false NOT NULL,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_escala_culto_itens(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"service_id" uuid NOT NULL,
"template_id" uuid,
"template_item_id" uuid,
"team_id" uuid NOT NULL,
"position_id" uuid,
"quantidade" integer DEFAULT 1 NOT NULL,
"fixo" boolean DEFAULT false NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"deleted_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"culto_id" uuid
);
CREATE TABLE vol_escala_template_item_pessoas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"item_id" uuid NOT NULL,
"volunteer_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_escala_template_itens(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"template_id" uuid NOT NULL,
"team_id" uuid NOT NULL,
"position_id" uuid,
"quantidade" integer DEFAULT 1 NOT NULL,
"fixo" boolean DEFAULT false NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_escala_template_liderancas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"template_id" uuid NOT NULL,
"team_id" uuid NOT NULL,
"responsavel_profile_id" uuid NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_escala_template_tipos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"template_id" uuid NOT NULL,
"service_type_id" uuid NOT NULL
);
CREATE TABLE vol_escala_templates(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"descricao" text,
"ativo" boolean DEFAULT true NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"deleted_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_form_opcoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"label" text NOT NULL,
"ordem" integer DEFAULT 0 NOT NULL,
"ativo" boolean DEFAULT true NOT NULL,
"area_canonica" text DEFAULT 'sede'::text NOT NULL,
"exige_dados_menor" boolean DEFAULT false NOT NULL,
"aviso_titulo" text,
"aviso_texto" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_inatividade(
"chave" text NOT NULL,
"motivo" text NOT NULL,
"detalhe" text,
"registrado_por" uuid,
"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_inscricoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"sobrenome" text NOT NULL,
"nome_completo" text NOT NULL,
"cpf" text,
"email" text,
"telefone" text,
"data_nascimento" date,
"nome_mae" text,
"data_inscricao" timestamp with time zone NOT NULL,
"participou_next" text,
"dom_predominante" text,
"ministerios_interesse" text,
"area" text NOT NULL,
"status" text NOT NULL,
"primeiro_contato_em" text,
"enviado_lider_em" text,
"feedback" text,
"integrado_em" text,
"membro_id" uuid,
"vol_profile_id" uuid,
"visitante_id" uuid,
"origem" text DEFAULT 'form_google'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"area_direcionada" text[],
"next_matricula_id" uuid,
"whatsapp_optin" boolean DEFAULT false NOT NULL,
"whatsapp_optin_em" timestamp with time zone,
"sexo" text,
"endereco" text,
"deleted_at" timestamp with time zone
);
CREATE TABLE vol_inscritos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome_planilha" text NOT NULL,
"nome_norm" text NOT NULL,
"vol_profile_id" uuid,
"membro_id" uuid,
"origem" text DEFAULT 'planilha_2026'::text NOT NULL,
"ativo" boolean DEFAULT true NOT NULL,
"deleted_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_parabens(
"vol_profile_id" uuid NOT NULL,
"ano" integer NOT NULL,
"enviado_em" timestamp with time zone DEFAULT now() NOT NULL,
"enviado_por" uuid,
"resultado" text
);
CREATE TABLE vol_pco_mapa(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"pco_nome" text NOT NULL,
"pco_chave" text NOT NULL,
"team_id" uuid,
"position_id" uuid,
"ignorar" boolean DEFAULT false NOT NULL,
"observacao" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_positions(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"team_id" uuid NOT NULL,
"name" text NOT NULL,
"description" text,
"min_volunteers" integer DEFAULT 1 NOT NULL,
"max_volunteers" integer,
"is_active" boolean DEFAULT true NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_schedules(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"service_id" uuid NOT NULL,
"volunteer_id" uuid,
"planning_center_person_id" text,
"volunteer_name" text NOT NULL,
"team_name" text,
"position_name" text,
"confirmation_status" text DEFAULT 'confirmed'::text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"team_id" uuid,
"position_id" uuid,
"source" text DEFAULT 'planning_center'::text NOT NULL,
"notes" text,
"recusa_motivo" text,
"escala_culto_item_id" uuid,
"slot_seq" smallint DEFAULT 0 NOT NULL,
"culto_id" uuid
);
CREATE TABLE vol_services(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"planning_center_id" text,
"name" text NOT NULL,
"service_type_name" text,
"scheduled_at" timestamp with time zone NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"service_type_id" uuid
);
CREATE TABLE vol_servicos_historico(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome_planilha" text NOT NULL,
"nome_norm" text NOT NULL,
"data" date NOT NULL,
"culto_label" text DEFAULT '—'::text NOT NULL,
"mes" text,
"origem" text DEFAULT 'planilha_2026'::text NOT NULL,
"vol_profile_id" uuid,
"membro_id" uuid,
"deleted_at" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_sync_logs(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"sync_type" text DEFAULT 'manual'::text NOT NULL,
"services_synced" integer DEFAULT 0 NOT NULL,
"schedules_synced" integer DEFAULT 0 NOT NULL,
"qrcodes_generated" integer DEFAULT 0 NOT NULL,
"status" text DEFAULT 'success'::text NOT NULL,
"error_message" text,
"triggered_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_team_members(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"team_id" uuid NOT NULL,
"position_id" uuid,
"volunteer_profile_id" uuid,
"planning_center_person_id" text,
"volunteer_name" text NOT NULL,
"is_active" boolean DEFAULT true NOT NULL,
"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"origem_pco_team" text,
"service_type_ids" uuid[]
);
CREATE TABLE vol_teams(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"description" text,
"color" text,
"leader_profile_id" uuid,
"is_active" boolean DEFAULT true NOT NULL,
"sort_order" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"area" text,
"split_por_horario" boolean DEFAULT false NOT NULL
);
CREATE TABLE vol_training_checkins(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"service_id" uuid,
"volunteer_name" text NOT NULL,
"team_name" text NOT NULL,
"phone" text,
"registered_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_user_roles(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"profile_id" uuid NOT NULL,
"role" vol_user_role DEFAULT 'volunteer'::vol_user_role NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_vinculo_snapshot_20260818(
"vol_profile_id" uuid NOT NULL,
"full_name" text,
"tirado_em" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_volunteer_qrcodes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"planning_center_person_id" text NOT NULL,
"volunteer_name" text NOT NULL,
"qr_code" text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
"avatar_url" text,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE vol_check_ins ADD CONSTRAINT vol_check_ins_method_check CHECK ((method = ANY (ARRAY['qr_code'::text, 'manual'::text, 'facial'::text, 'self_service'::text])));
ALTER TABLE vol_check_ins ADD CONSTRAINT vol_check_ins_pkey PRIMARY KEY (id);
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_origem_check CHECK ((origem = ANY (ARRAY['amigo'::text, 'redes_sociais'::text, 'site'::text, 'evento'::text, 'busca'::text, 'outro'::text])));
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_pkey PRIMARY KEY (id);
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_status_check CHECK ((status = ANY (ARRAY['novo'::text, 'primeiro_contato'::text, 'acompanhamento'::text, 'discipulado'::text, 'batizado'::text, 'membro_ativo'::text, 'inativo'::text, 'mudou_cidade'::text])));
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_tipo_decisao_check CHECK (((tipo_decisao IS NULL) OR (tipo_decisao = ANY (ARRAY['presencial'::text, 'online'::text]))));
ALTER TABLE vol_inscricoes ADD CONSTRAINT chk_vol_insc_sexo CHECK (((sexo IS NULL) OR (sexo = ANY (ARRAY['masculino'::text, 'feminino'::text]))));
ALTER TABLE vol_inscricoes ADD CONSTRAINT vol_inscricoes_area_check CHECK ((area = ANY (ARRAY['kids'::text, 'sede'::text, 'ami'::text, 'bridge'::text, 'online'::text])));
ALTER TABLE vol_inscricoes ADD CONSTRAINT vol_inscricoes_pkey PRIMARY KEY (id);
ALTER TABLE vol_inscricoes ADD CONSTRAINT vol_inscricoes_status_check CHECK ((status = ANY (ARRAY['inscrito'::text, 'enviado_ministerio'::text, 'integrado'::text, 'kids'::text, 'nao_responde'::text, 'nao_pode_ou_duplicata'::text, 'desistente'::text])));
ALTER TABLE vol_inatividade ADD CONSTRAINT vol_inatividade_pkey PRIMARY KEY (chave);
ALTER TABLE vol_vinculo_snapshot_20260818 ADD CONSTRAINT vol_vinculo_snapshot_20260818_pkey PRIMARY KEY (vol_profile_id);
ALTER TABLE vol_email_disparo_destinatarios ADD CONSTRAINT vol_email_disparo_destinatarios_disparo_id_email_key UNIQUE (disparo_id, email);
ALTER TABLE vol_email_disparo_destinatarios ADD CONSTRAINT vol_email_disparo_destinatarios_pkey PRIMARY KEY (id);
ALTER TABLE vol_email_disparo_destinatarios ADD CONSTRAINT vol_email_disparo_destinatarios_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'erro'::text])));
ALTER TABLE vol_email_disparos ADD CONSTRAINT vol_email_disparos_pkey PRIMARY KEY (id);
ALTER TABLE vol_email_disparos ADD CONSTRAINT vol_email_disparos_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'agendado'::text, 'enviando'::text, 'enviado'::text, 'erro'::text, 'cancelado'::text])));
ALTER TABLE vol_email_config ADD CONSTRAINT vol_email_config_id_check CHECK ((id = 1));
ALTER TABLE vol_email_config ADD CONSTRAINT vol_email_config_pkey PRIMARY KEY (id);
ALTER TABLE vol_volunteer_qrcodes ADD CONSTRAINT vol_volunteer_qrcodes_pkey PRIMARY KEY (id);
ALTER TABLE vol_volunteer_qrcodes ADD CONSTRAINT vol_volunteer_qrcodes_planning_center_person_id_key UNIQUE (planning_center_person_id);
ALTER TABLE vol_volunteer_qrcodes ADD CONSTRAINT vol_volunteer_qrcodes_qr_code_key UNIQUE (qr_code);
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_pc_unique UNIQUE NULLS NOT DISTINCT (service_id, planning_center_person_id, team_name, position_name, slot_seq);
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_pkey PRIMARY KEY (id);
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_source_check CHECK ((source = ANY (ARRAY['planning_center'::text, 'manual'::text, 'auto_rotation'::text, 'template'::text])));
ALTER TABLE vol_inscritos ADD CONSTRAINT vol_inscritos_pkey PRIMARY KEY (id);
ALTER TABLE vol_inscritos ADD CONSTRAINT vol_inscritos_uq UNIQUE (nome_norm, origem);
ALTER TABLE vol_email_templates ADD CONSTRAINT vol_email_templates_pkey PRIMARY KEY (id);
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_culto_dia_check CHECK (((culto_dia IS NULL) OR (culto_dia = ANY (ARRAY['domingo'::text, 'quarta'::text, 'sabado'::text]))));
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_culto_periodo_check CHECK (((culto_periodo IS NULL) OR (culto_periodo = ANY (ARRAY['manha'::text, 'noite'::text]))));
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_culto_semana_check CHECK (((culto_semana IS NULL) OR ((culto_semana >= 1) AND (culto_semana <= 4))));
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_papel_check CHECK ((papel = ANY (ARRAY['leitor'::text, 'lider'::text, 'admin'::text])));
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_pkey PRIMARY KEY (id);
ALTER TABLE vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_pco_chave_key UNIQUE (pco_chave);
ALTER TABLE vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_pkey PRIMARY KEY (id);
ALTER TABLE vol_teams ADD CONSTRAINT vol_teams_name_key UNIQUE (name);
ALTER TABLE vol_teams ADD CONSTRAINT vol_teams_pkey PRIMARY KEY (id);
ALTER TABLE vol_positions ADD CONSTRAINT vol_positions_pkey PRIMARY KEY (id);
ALTER TABLE vol_positions ADD CONSTRAINT vol_positions_team_id_name_key UNIQUE (team_id, name);
ALTER TABLE vol_availability ADD CONSTRAINT vol_availability_check CHECK ((unavailable_to >= unavailable_from));
ALTER TABLE vol_availability ADD CONSTRAINT vol_availability_check1 CHECK (((volunteer_profile_id IS NOT NULL) OR (planning_center_person_id IS NOT NULL)));
ALTER TABLE vol_availability ADD CONSTRAINT vol_availability_pkey PRIMARY KEY (id);
ALTER TABLE mem_ministerios ADD CONSTRAINT mem_ministerios_nome_key UNIQUE (nome);
ALTER TABLE mem_ministerios ADD CONSTRAINT mem_ministerios_pkey PRIMARY KEY (id);
ALTER TABLE vol_form_opcoes ADD CONSTRAINT vol_form_opcoes_area_canonica_check CHECK ((area_canonica = ANY (ARRAY['kids'::text, 'sede'::text, 'ami'::text, 'bridge'::text, 'online'::text])));
ALTER TABLE vol_form_opcoes ADD CONSTRAINT vol_form_opcoes_label_key UNIQUE (label);
ALTER TABLE vol_form_opcoes ADD CONSTRAINT vol_form_opcoes_pkey PRIMARY KEY (id);
ALTER TABLE vol_config ADD CONSTRAINT vol_config_pkey PRIMARY KEY (id);
ALTER TABLE vol_config ADD CONSTRAINT vol_config_singleton CHECK ((id = 1));
ALTER TABLE vol_escala_templates ADD CONSTRAINT vol_escala_templates_pkey PRIMARY KEY (id);
ALTER TABLE vol_escala_template_tipos ADD CONSTRAINT vol_escala_template_tipos_pkey PRIMARY KEY (id);
ALTER TABLE vol_escala_template_tipos ADD CONSTRAINT vol_escala_template_tipos_template_id_service_type_id_key UNIQUE (template_id, service_type_id);
ALTER TABLE vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_pkey PRIMARY KEY (id);
ALTER TABLE vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_quantidade_check CHECK ((quantidade >= 1));
ALTER TABLE vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_template_id_team_id_position_id_key UNIQUE NULLS NOT DISTINCT (template_id, team_id, position_id);
ALTER TABLE vol_escala_template_item_pessoas ADD CONSTRAINT vol_escala_template_item_pessoas_item_id_volunteer_id_key UNIQUE (item_id, volunteer_id);
ALTER TABLE vol_escala_template_item_pessoas ADD CONSTRAINT vol_escala_template_item_pessoas_pkey PRIMARY KEY (id);
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_alvo_unico UNIQUE NULLS NOT DISTINCT (service_id, team_id, position_id, culto_id);
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_pkey PRIMARY KEY (id);
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_quantidade_check CHECK ((quantidade >= 1));
ALTER TABLE mem_voluntarios ADD CONSTRAINT mem_voluntarios_area_check CHECK (((area IS NULL) OR (area = ANY (ARRAY['kids'::text, 'sede'::text, 'ami'::text, 'bridge'::text, 'online'::text]))));
ALTER TABLE mem_voluntarios ADD CONSTRAINT mem_voluntarios_pkey PRIMARY KEY (id);
ALTER TABLE vol_parabens ADD CONSTRAINT vol_parabens_pkey PRIMARY KEY (vol_profile_id, ano);
ALTER TABLE vol_services ADD CONSTRAINT vol_services_pkey PRIMARY KEY (id);
ALTER TABLE vol_services ADD CONSTRAINT vol_services_planning_center_id_key UNIQUE (planning_center_id);
ALTER TABLE vol_sync_logs ADD CONSTRAINT vol_sync_logs_pkey PRIMARY KEY (id);
ALTER TABLE vol_training_checkins ADD CONSTRAINT vol_training_checkins_pkey PRIMARY KEY (id);
ALTER TABLE vol_user_roles ADD CONSTRAINT vol_user_roles_pkey PRIMARY KEY (id);
ALTER TABLE vol_user_roles ADD CONSTRAINT vol_user_roles_profile_id_role_key UNIQUE (profile_id, role);
ALTER TABLE vol_servicos_historico ADD CONSTRAINT vol_servicos_historico_pkey PRIMARY KEY (id);
ALTER TABLE vol_background_checks ADD CONSTRAINT vol_background_checks_pkey PRIMARY KEY (id);
ALTER TABLE vol_background_checks ADD CONSTRAINT vol_background_checks_resultado_check CHECK ((resultado = ANY (ARRAY['nada_consta'::text, 'consta'::text, 'indeterminado'::text])));
ALTER TABLE vol_background_checks ADD CONSTRAINT vol_background_checks_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'consultando'::text, 'nada_consta'::text, 'possivel_registro'::text, 'erro'::text, 'aprovado_manual'::text, 'reprovado'::text, 'dispensado'::text])));
ALTER TABLE vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_pkey PRIMARY KEY (id);
ALTER TABLE vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_template_equipe_unica UNIQUE (template_id, team_id);
ALTER TABLE vol_team_members ADD CONSTRAINT vol_team_members_check CHECK (((volunteer_profile_id IS NOT NULL) OR (planning_center_person_id IS NOT NULL)));
ALTER TABLE vol_team_members ADD CONSTRAINT vol_team_members_pkey PRIMARY KEY (id);
ALTER TABLE vol_check_ins ADD CONSTRAINT vol_check_ins_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES vol_schedules(id) ON DELETE CASCADE;
ALTER TABLE vol_check_ins ADD CONSTRAINT vol_check_ins_service_id_fkey FOREIGN KEY (service_id) REFERENCES vol_services(id) ON DELETE SET NULL;
ALTER TABLE vol_check_ins ADD CONSTRAINT vol_check_ins_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES vol_services(id) ON DELETE SET NULL;
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_membresia_id_fkey FOREIGN KEY (membresia_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE int_visitantes ADD CONSTRAINT int_visitantes_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_inscricoes ADD CONSTRAINT vol_inscricoes_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE vol_inscricoes ADD CONSTRAINT vol_inscricoes_visitante_id_fkey FOREIGN KEY (visitante_id) REFERENCES int_visitantes(id) ON DELETE SET NULL;
ALTER TABLE vol_inscricoes ADD CONSTRAINT vol_inscricoes_vol_profile_id_fkey FOREIGN KEY (vol_profile_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_email_disparo_destinatarios ADD CONSTRAINT vol_email_disparo_destinatarios_disparo_id_fkey FOREIGN KEY (disparo_id) REFERENCES vol_email_disparos(id) ON DELETE CASCADE;
ALTER TABLE vol_email_disparo_destinatarios ADD CONSTRAINT vol_email_disparo_destinatarios_vol_profile_id_fkey FOREIGN KEY (vol_profile_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_email_disparos ADD CONSTRAINT vol_email_disparos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES cultos(id) ON DELETE SET NULL;
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_escala_culto_item_id_fkey FOREIGN KEY (escala_culto_item_id) REFERENCES vol_escala_culto_itens(id) ON DELETE SET NULL;
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_position_id_fkey FOREIGN KEY (position_id) REFERENCES vol_positions(id) ON DELETE SET NULL;
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_service_id_fkey FOREIGN KEY (service_id) REFERENCES vol_services(id) ON DELETE CASCADE;
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE SET NULL;
ALTER TABLE vol_schedules ADD CONSTRAINT vol_schedules_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_inscritos ADD CONSTRAINT vol_inscritos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE vol_inscritos ADD CONSTRAINT vol_inscritos_vol_profile_id_fkey FOREIGN KEY (vol_profile_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_email_templates ADD CONSTRAINT vol_email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_concedido_por_fkey FOREIGN KEY (concedido_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE CASCADE;
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_position_id_fkey FOREIGN KEY (position_id) REFERENCES vol_positions(id) ON DELETE CASCADE;
ALTER TABLE vol_area_supervisores ADD CONSTRAINT vol_area_supervisores_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE CASCADE;
ALTER TABLE vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_position_id_fkey FOREIGN KEY (position_id) REFERENCES vol_positions(id) ON DELETE SET NULL;
ALTER TABLE vol_pco_mapa ADD CONSTRAINT vol_pco_mapa_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE CASCADE;
ALTER TABLE vol_teams ADD CONSTRAINT vol_teams_leader_profile_id_fkey FOREIGN KEY (leader_profile_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_positions ADD CONSTRAINT vol_positions_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE CASCADE;
ALTER TABLE vol_availability ADD CONSTRAINT vol_availability_service_id_fkey FOREIGN KEY (service_id) REFERENCES vol_services(id) ON DELETE CASCADE;
ALTER TABLE vol_availability ADD CONSTRAINT vol_availability_volunteer_profile_id_fkey FOREIGN KEY (volunteer_profile_id) REFERENCES vol_profiles(id) ON DELETE CASCADE;
ALTER TABLE mem_ministerios ADD CONSTRAINT mem_ministerios_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE vol_escala_template_tipos ADD CONSTRAINT vol_escala_template_tipos_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES vol_service_types(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_template_tipos ADD CONSTRAINT vol_escala_template_tipos_template_id_fkey FOREIGN KEY (template_id) REFERENCES vol_escala_templates(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_position_id_fkey FOREIGN KEY (position_id) REFERENCES vol_positions(id) ON DELETE SET NULL;
ALTER TABLE vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_template_itens ADD CONSTRAINT vol_escala_template_itens_template_id_fkey FOREIGN KEY (template_id) REFERENCES vol_escala_templates(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_template_item_pessoas ADD CONSTRAINT vol_escala_template_item_pessoas_item_id_fkey FOREIGN KEY (item_id) REFERENCES vol_escala_template_itens(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_template_item_pessoas ADD CONSTRAINT vol_escala_template_item_pessoas_volunteer_id_fkey FOREIGN KEY (volunteer_id) REFERENCES vol_profiles(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES cultos(id) ON DELETE SET NULL;
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_position_id_fkey FOREIGN KEY (position_id) REFERENCES vol_positions(id) ON DELETE SET NULL;
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_service_id_fkey FOREIGN KEY (service_id) REFERENCES vol_services(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_template_id_fkey FOREIGN KEY (template_id) REFERENCES vol_escala_templates(id) ON DELETE SET NULL;
ALTER TABLE vol_escala_culto_itens ADD CONSTRAINT vol_escala_culto_itens_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES vol_escala_template_itens(id) ON DELETE SET NULL;
ALTER TABLE mem_voluntarios ADD CONSTRAINT mem_voluntarios_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE mem_voluntarios ADD CONSTRAINT mem_voluntarios_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_voluntarios ADD CONSTRAINT mem_voluntarios_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES mem_ministerios(id) ON DELETE CASCADE;
ALTER TABLE vol_parabens ADD CONSTRAINT vol_parabens_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_services ADD CONSTRAINT vol_services_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES vol_service_types(id) ON DELETE SET NULL;
ALTER TABLE vol_training_checkins ADD CONSTRAINT vol_training_checkins_service_id_fkey FOREIGN KEY (service_id) REFERENCES vol_services(id) ON DELETE SET NULL;
ALTER TABLE vol_user_roles ADD CONSTRAINT vol_user_roles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES vol_profiles(id) ON DELETE CASCADE;
ALTER TABLE vol_servicos_historico ADD CONSTRAINT vol_servicos_historico_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE vol_servicos_historico ADD CONSTRAINT vol_servicos_historico_vol_profile_id_fkey FOREIGN KEY (vol_profile_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_background_checks ADD CONSTRAINT vol_background_checks_inscricao_id_fkey FOREIGN KEY (inscricao_id) REFERENCES vol_inscricoes(id) ON DELETE SET NULL;
ALTER TABLE vol_background_checks ADD CONSTRAINT vol_background_checks_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE vol_background_checks ADD CONSTRAINT vol_background_checks_revisado_por_fkey FOREIGN KEY (revisado_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_responsavel_profile_id_fkey FOREIGN KEY (responsavel_profile_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE CASCADE;
ALTER TABLE vol_escala_template_liderancas ADD CONSTRAINT vol_escala_template_liderancas_template_id_fkey FOREIGN KEY (template_id) REFERENCES vol_escala_templates(id) ON DELETE CASCADE;
ALTER TABLE vol_team_members ADD CONSTRAINT vol_team_members_position_id_fkey FOREIGN KEY (position_id) REFERENCES vol_positions(id) ON DELETE SET NULL;
ALTER TABLE vol_team_members ADD CONSTRAINT vol_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES vol_teams(id) ON DELETE CASCADE;
ALTER TABLE vol_team_members ADD CONSTRAINT vol_team_members_volunteer_profile_id_fkey FOREIGN KEY (volunteer_profile_id) REFERENCES vol_profiles(id) ON DELETE CASCADE;
CREATE INDEX int_visitantes_status_idx ON public.int_visitantes USING btree (status);
CREATE INDEX int_visitantes_data_idx ON public.int_visitantes USING btree (data_visita DESC);
CREATE INDEX int_visitantes_responsavel_idx ON public.int_visitantes USING btree (responsavel_id);
CREATE INDEX int_visitantes_culto_idx ON public.int_visitantes USING btree (culto_id);
CREATE INDEX int_visitantes_cpf_idx ON public.int_visitantes USING btree (cpf) WHERE (cpf IS NOT NULL);
CREATE INDEX idx_int_visitantes_igreja ON public.int_visitantes USING btree (igreja_id);
CREATE INDEX idx_mem_ministerios_ativo ON public.mem_ministerios USING btree (ativo);
CREATE INDEX idx_mem_voluntarios_membro ON public.mem_voluntarios USING btree (membro_id);
CREATE INDEX idx_mem_voluntarios_ministerio ON public.mem_voluntarios USING btree (ministerio_id);
CREATE UNIQUE INDEX uniq_mem_voluntarios_ativo ON public.mem_voluntarios USING btree (membro_id, ministerio_id) WHERE (ate IS NULL);
CREATE INDEX idx_mem_voluntarios_active ON public.mem_voluntarios USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_voluntarios_igreja ON public.mem_voluntarios USING btree (igreja_id);
CREATE INDEX idx_vol_area_supervisores_membro ON public.vol_area_supervisores USING btree (membro_id);
CREATE INDEX vol_area_supervisores_position_idx ON public.vol_area_supervisores USING btree (position_id) WHERE (position_id IS NOT NULL);
CREATE UNIQUE INDEX vol_area_supervisores_escopo_uidx ON public.vol_area_supervisores USING btree (membro_id, area, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(position_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(culto_dia, ''::text), COALESCE(culto_periodo, ''::text), COALESCE((culto_semana)::integer, 0));
CREATE INDEX vol_area_supervisores_team_idx ON public.vol_area_supervisores USING btree (team_id);
CREATE INDEX vol_availability_profile_idx ON public.vol_availability USING btree (volunteer_profile_id);
CREATE INDEX vol_availability_dates_idx ON public.vol_availability USING btree (unavailable_from, unavailable_to);
CREATE UNIQUE INDEX vol_availability_profile_service_uq ON public.vol_availability USING btree (volunteer_profile_id, service_id) WHERE ((service_id IS NOT NULL) AND (volunteer_profile_id IS NOT NULL));
CREATE INDEX idx_vol_bgcheck_active ON public.vol_background_checks USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_vol_bgcheck_inscricao ON public.vol_background_checks USING btree (inscricao_id, created_at DESC);
CREATE INDEX idx_vol_bgcheck_pendente ON public.vol_background_checks USING btree (status, created_at DESC) WHERE ((deleted_at IS NULL) AND (status = ANY (ARRAY['pendente'::text, 'possivel_registro'::text, 'erro'::text])));
CREATE UNIQUE INDEX vol_check_ins_schedule_unique ON public.vol_check_ins USING btree (schedule_id) WHERE ((schedule_id IS NOT NULL) AND (is_unscheduled = false));
CREATE UNIQUE INDEX vol_check_ins_unscheduled_unique ON public.vol_check_ins USING btree (volunteer_id, service_id) WHERE ((is_unscheduled = true) AND (volunteer_id IS NOT NULL) AND (service_id IS NOT NULL));
CREATE INDEX vol_check_ins_service_idx ON public.vol_check_ins USING btree (service_id);
CREATE INDEX vol_check_ins_volunteer_idx ON public.vol_check_ins USING btree (volunteer_id);
CREATE INDEX idx_vol_email_dest_pendentes ON public.vol_email_disparo_destinatarios USING btree (disparo_id, status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_vol_email_disparos_active ON public.vol_email_disparos USING btree (created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_vol_email_disparos_pendentes ON public.vol_email_disparos USING btree (agendado_para) WHERE ((status = ANY (ARRAY['agendado'::text, 'enviando'::text])) AND (deleted_at IS NULL));
CREATE INDEX vol_esc_culto_itens_svc_idx ON public.vol_escala_culto_itens USING btree (service_id) WHERE (deleted_at IS NULL);
CREATE INDEX vol_escala_culto_itens_culto_idx ON public.vol_escala_culto_itens USING btree (culto_id) WHERE (culto_id IS NOT NULL);
CREATE INDEX vol_esc_tpl_item_pess_item_idx ON public.vol_escala_template_item_pessoas USING btree (item_id);
CREATE INDEX vol_esc_tpl_itens_tpl_idx ON public.vol_escala_template_itens USING btree (template_id);
CREATE INDEX vol_esc_tpl_liderancas_responsavel_idx ON public.vol_escala_template_liderancas USING btree (responsavel_profile_id);
CREATE INDEX vol_esc_tpl_liderancas_template_idx ON public.vol_escala_template_liderancas USING btree (template_id, team_id);
CREATE INDEX vol_esc_tpl_tipos_tpl_idx ON public.vol_escala_template_tipos USING btree (template_id);
CREATE INDEX vol_esc_tpl_tipos_st_idx ON public.vol_escala_template_tipos USING btree (service_type_id);
CREATE INDEX idx_vol_form_opcoes_ativo_ordem ON public.vol_form_opcoes USING btree (ativo, ordem);
CREATE INDEX idx_vol_inscricoes_cpf ON public.vol_inscricoes USING btree (cpf) WHERE (cpf IS NOT NULL);
CREATE INDEX idx_vol_inscricoes_email ON public.vol_inscricoes USING btree (lower(email)) WHERE (email IS NOT NULL);
CREATE INDEX idx_vol_inscricoes_nome ON public.vol_inscricoes USING btree (lower(nome_completo));
CREATE INDEX idx_vol_inscricoes_data ON public.vol_inscricoes USING btree (data_inscricao DESC);
CREATE INDEX idx_vol_inscricoes_status ON public.vol_inscricoes USING btree (status);
CREATE INDEX idx_vol_inscricoes_area ON public.vol_inscricoes USING btree (area);
CREATE INDEX idx_vol_inscricoes_membro ON public.vol_inscricoes USING btree (membro_id) WHERE (membro_id IS NOT NULL);
CREATE INDEX idx_vol_inscricoes_next_matricula ON public.vol_inscricoes USING btree (next_matricula_id) WHERE (next_matricula_id IS NOT NULL);
CREATE INDEX idx_vol_insc_ativas ON public.vol_inscricoes USING btree (status, data_inscricao DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_vol_inscritos_profile ON public.vol_inscritos USING btree (vol_profile_id);
CREATE INDEX idx_vol_inscritos_membro ON public.vol_inscritos USING btree (membro_id);
CREATE INDEX vol_pco_mapa_team_idx ON public.vol_pco_mapa USING btree (team_id);
CREATE INDEX vol_schedules_service_idx ON public.vol_schedules USING btree (service_id);
CREATE INDEX vol_schedules_volunteer_idx ON public.vol_schedules USING btree (volunteer_id);
CREATE INDEX vol_schedules_pc_person_idx ON public.vol_schedules USING btree (planning_center_person_id);
CREATE UNIQUE INDEX vol_schedules_manual_unique ON public.vol_schedules USING btree (service_id, volunteer_id, team_id) WHERE ((planning_center_person_id IS NULL) AND (volunteer_id IS NOT NULL));
CREATE INDEX vol_schedules_escala_item_idx ON public.vol_schedules USING btree (escala_culto_item_id) WHERE (escala_culto_item_id IS NOT NULL);
CREATE INDEX vol_schedules_culto_idx ON public.vol_schedules USING btree (culto_id) WHERE (culto_id IS NOT NULL);
CREATE INDEX vol_services_scheduled_idx ON public.vol_services USING btree (scheduled_at);
CREATE INDEX idx_vol_servhist_nome ON public.vol_servicos_historico USING btree (nome_norm);
CREATE INDEX idx_vol_servhist_profile ON public.vol_servicos_historico USING btree (vol_profile_id) WHERE (vol_profile_id IS NOT NULL);
CREATE INDEX idx_vol_servhist_data ON public.vol_servicos_historico USING btree (data);
CREATE UNIQUE INDEX uq_vol_servhist ON public.vol_servicos_historico USING btree (nome_norm, data, culto_label, origem);
CREATE INDEX vol_sync_logs_created_idx ON public.vol_sync_logs USING btree (created_at DESC);
CREATE INDEX vol_team_members_team_idx ON public.vol_team_members USING btree (team_id);
CREATE INDEX vol_team_members_profile_idx ON public.vol_team_members USING btree (volunteer_profile_id);
CREATE INDEX vol_team_members_pc_idx ON public.vol_team_members USING btree (planning_center_person_id);
CREATE UNIQUE INDEX vol_team_members_team_profile_pos_key ON public.vol_team_members USING btree (team_id, volunteer_profile_id, position_id) NULLS NOT DISTINCT WHERE (volunteer_profile_id IS NOT NULL);
CREATE UNIQUE INDEX vol_team_members_team_pc_pos_unique ON public.vol_team_members USING btree (team_id, planning_center_person_id, position_id) NULLS NOT DISTINCT WHERE ((volunteer_profile_id IS NULL) AND (planning_center_person_id IS NOT NULL));
CREATE INDEX vol_team_members_service_types_idx ON public.vol_team_members USING gin (service_type_ids) WHERE (service_type_ids IS NOT NULL);
CREATE INDEX idx_vol_teams_area ON public.vol_teams USING btree (area) WHERE (area IS NOT NULL);
CREATE OR REPLACE FUNCTION public.vol_update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_sync_telefone_vol_para_membro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tel_membro TEXT;
  v_tel_vol    TEXT;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT telefone_digits
    INTO v_tel_membro
    FROM public.mem_membros
   WHERE id = NEW.membresia_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_tel_vol := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), '');

  IF v_tel_membro IS NOT NULL THEN
    IF NEW.phone IS DISTINCT FROM v_tel_membro THEN
      UPDATE public.vol_profiles SET phone = v_tel_membro WHERE id = NEW.id;
    END IF;
  ELSIF v_tel_vol IS NOT NULL THEN
    UPDATE public.mem_membros
       SET telefone = v_tel_vol
     WHERE id = NEW.membresia_id
       AND (telefone IS NULL OR trim(telefone) = '')
       AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_sync_cpf_vol_para_membro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf_membro TEXT;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(regexp_replace(COALESCE(cpf, ''), '\D', '', 'g'), '')
    INTO v_cpf_membro
    FROM public.mem_membros
   WHERE id = NEW.membresia_id AND deleted_at IS NULL;

  IF NOT FOUND OR v_cpf_membro IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cpf IS DISTINCT FROM v_cpf_membro THEN
    UPDATE public.vol_profiles SET cpf = v_cpf_membro WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_vol_email_disparos_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_vol_profile_sync_mem_voluntarios()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_ministerio uuid;
  v_area text;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mem_voluntarios
     WHERE membro_id = NEW.membresia_id AND ate IS NULL AND deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_ministerio
    FROM public.mem_ministerios
   WHERE nome = 'Voluntariado (geral)'
   LIMIT 1;
  IF v_ministerio IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT vi.area INTO v_area
    FROM public.vol_inscricoes vi
   WHERE vi.membro_id = NEW.membresia_id
     AND vi.area IN ('kids', 'sede', 'ami', 'bridge', 'online')
   ORDER BY vi.data_inscricao DESC
   LIMIT 1;

  INSERT INTO public.mem_voluntarios (membro_id, ministerio_id, papel, desde, area, observacoes)
  VALUES (
    NEW.membresia_id,
    v_ministerio,
    'Voluntário',
    COALESCE(NEW.created_at::date, CURRENT_DATE),
    v_area,
    'Auto: sync do voluntariado (vol_profiles.id=' || NEW.id::text || ')'
  );

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_vol_schedule_link_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.volunteer_id IS NULL AND NEW.planning_center_person_id IS NOT NULL THEN
    SELECT vp.id INTO NEW.volunteer_id
      FROM public.vol_profiles vp
     WHERE vp.planning_center_id = NEW.planning_center_person_id
     ORDER BY vp.arquivado ASC, vp.id
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_vol_profile_link_schedules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.planning_center_id IS NOT NULL THEN
    UPDATE public.vol_schedules s
       SET volunteer_id = NEW.id
     WHERE s.planning_center_person_id = NEW.planning_center_id
       AND s.volunteer_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.vol_escala_template_liderancas_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_vol_inscricoes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$function$
;
CREATE OR REPLACE FUNCTION public.tg_nsm_voluntario_servir()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  PERFORM public.nsm_inserir_evento(
    NEW.membro_id,
    'servir',
    'mem_voluntarios',
    NEW.id,
    NEW.desde
  );
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.vol_escala_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;
CREATE OR REPLACE FUNCTION public.fn_sync_email_vol_para_membro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email_membro TEXT;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(lower(trim(COALESCE(email, ''))), '') INTO v_email_membro
    FROM public.mem_membros
   WHERE id = NEW.membresia_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_email_membro IS NOT NULL THEN
    -- canônico vence
    IF NEW.email IS DISTINCT FROM v_email_membro THEN
      UPDATE public.vol_profiles SET email = v_email_membro WHERE id = NEW.id;
    END IF;
  ELSIF NULLIF(trim(COALESCE(NEW.email, '')), '') IS NOT NULL THEN
    -- provisório sobe (só preenche vazio)
    UPDATE public.mem_membros
       SET email = lower(trim(NEW.email))
     WHERE id = NEW.membresia_id
       AND (email IS NULL OR trim(email) = '')
       AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_dash_vol_service_no_bloco(p_nome text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.fn_dash_vol_bloco_nome(p_nome) IS NOT NULL;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_dash_vol_bloco_nome(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN p_nome ~~* 'Domingo - Manh%'  OR p_nome ~~* 'CBKIDS - Manh%'
      OR p_nome ~~* 'Domingo 08%'      OR p_nome ~~* 'Domingo 09%'
      OR p_nome ~~* 'Domingo 10%'      OR p_nome ~~* 'Domingo 11%'
      THEN 'Domingo Manhã'
    WHEN p_nome ~~* 'Domingo - Noite%' OR p_nome ~~* 'CBKIDS - Noite%'
      OR p_nome ~~* 'Domingo 18%'      OR p_nome ~~* 'Domingo 19%'
      OR p_nome ~~* 'Domingo 20%'
      THEN 'Domingo Noite'
    WHEN p_nome ~~* 'Quarta%'          OR p_nome ~~* 'CBKIDS - Quarta%' THEN 'Quarta'
    WHEN p_nome ~~* 'AMI%'             OR p_nome ~~* 'Culto AMI%'       THEN 'AMI'
    WHEN p_nome ~~* '%Bridge%'                                          THEN 'Bridge'
  END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_dash_vol_bloco_id(p_nome text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE public.fn_dash_vol_bloco_nome(p_nome)
    WHEN 'Domingo Manhã' THEN 'b10c0000-0000-0000-0000-000000000001'::uuid
    WHEN 'Domingo Noite' THEN 'b10c0000-0000-0000-0000-000000000002'::uuid
    WHEN 'Quarta'        THEN 'b10c0000-0000-0000-0000-000000000003'::uuid
    WHEN 'AMI'           THEN 'b10c0000-0000-0000-0000-000000000004'::uuid
    WHEN 'Bridge'        THEN 'b10c0000-0000-0000-0000-000000000005'::uuid
  END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_vol_pco_chave(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select btrim(regexp_replace(
           lower(translate(coalesce(p_nome,''),
             'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
           '\s+', ' ', 'g'))
$function$
;
CREATE OR REPLACE FUNCTION public.nsm_inserir_evento(p_membro_id uuid, p_valor text, p_origem text, p_origem_id uuid DEFAULT NULL::uuid, p_data_engajamento date DEFAULT CURRENT_DATE)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_decisao_data date;
  v_membro_cpf text;
  v_membro_nome text;
  v_igreja_id uuid;
  v_visitante_id uuid;
BEGIN
  -- 1. Busca dados do membro
  SELECT cpf, nome, igreja_id
    INTO v_membro_cpf, v_membro_nome, v_igreja_id
    FROM public.mem_membros
   WHERE id = p_membro_id;

  IF v_membro_cpf IS NULL OR v_membro_cpf = '' THEN
    -- Sem CPF, nao da pra linkar com int_visitantes — sai silenciosamente
    RETURN;
  END IF;

  -- 2. Busca decisao mais recente em int_visitantes
  SELECT id, data_visita
    INTO v_visitante_id, v_decisao_data
    FROM public.int_visitantes
   WHERE cpf = v_membro_cpf
     AND fez_decisao = true
   ORDER BY data_visita DESC
   LIMIT 1;

  IF v_decisao_data IS NULL THEN
    -- Nao tem decisao registrada → nao entra no funil NSM
    RETURN;
  END IF;

  -- 3. Insere (ON CONFLICT DO NOTHING — primeiro engajamento por valor conta)
  INSERT INTO public.nsm_eventos (
    membro_id, visitante_id, cpf, nome, igreja_id,
    data_decisao, valor_engajado, data_engajamento,
    origem, origem_id
  ) VALUES (
    p_membro_id, v_visitante_id, v_membro_cpf, v_membro_nome, v_igreja_id,
    v_decisao_data, p_valor, p_data_engajamento,
    p_origem, p_origem_id
  )
  ON CONFLICT (coalesce(membro_id::text, visitante_id::text, cpf), valor_engajado) DO NOTHING;
END;
$function$
;
CREATE TRIGGER vol_profiles_updated_at BEFORE UPDATE ON public.vol_profiles FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
CREATE TRIGGER vol_services_updated_at BEFORE UPDATE ON public.vol_services FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
CREATE TRIGGER vol_qrcodes_updated_at BEFORE UPDATE ON public.vol_volunteer_qrcodes FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
CREATE TRIGGER vol_service_types_updated_at BEFORE UPDATE ON public.vol_service_types FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
CREATE TRIGGER vol_teams_updated_at BEFORE UPDATE ON public.vol_teams FOR EACH ROW EXECUTE FUNCTION vol_update_updated_at();
CREATE TRIGGER tg_nsm_voluntario_servir AFTER INSERT ON public.mem_voluntarios FOR EACH ROW EXECUTE FUNCTION tg_nsm_voluntario_servir();
CREATE TRIGGER trg_vol_profile_sync_mem_voluntarios AFTER INSERT OR UPDATE OF membresia_id ON public.vol_profiles FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION fn_vol_profile_sync_mem_voluntarios();
CREATE TRIGGER vol_email_disparos_updated_at BEFORE UPDATE ON public.vol_email_disparos FOR EACH ROW EXECUTE FUNCTION fn_vol_email_disparos_updated_at();
CREATE TRIGGER trg_sync_email_vol_para_membro AFTER INSERT OR UPDATE OF email, membresia_id ON public.vol_profiles FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION fn_sync_email_vol_para_membro();
CREATE TRIGGER trg_vol_schedule_link_profile BEFORE INSERT OR UPDATE OF planning_center_person_id, volunteer_id ON public.vol_schedules FOR EACH ROW EXECUTE FUNCTION fn_vol_schedule_link_profile();
CREATE TRIGGER trg_vol_profile_link_schedules AFTER INSERT OR UPDATE OF planning_center_id ON public.vol_profiles FOR EACH ROW EXECUTE FUNCTION fn_vol_profile_link_schedules();
CREATE TRIGGER trg_vol_inscricoes_updated_at BEFORE UPDATE ON public.vol_inscricoes FOR EACH ROW EXECUTE FUNCTION fn_vol_inscricoes_updated_at();
CREATE TRIGGER trg_vol_escala_templates_touch BEFORE UPDATE ON public.vol_escala_templates FOR EACH ROW EXECUTE FUNCTION vol_escala_touch_updated_at();
CREATE TRIGGER trg_vol_escala_culto_itens_touch BEFORE UPDATE ON public.vol_escala_culto_itens FOR EACH ROW EXECUTE FUNCTION vol_escala_touch_updated_at();
CREATE TRIGGER trg_vol_pco_mapa_touch BEFORE UPDATE ON public.vol_pco_mapa FOR EACH ROW EXECUTE FUNCTION vol_escala_touch_updated_at();
CREATE TRIGGER trg_vol_esc_tpl_liderancas_touch BEFORE UPDATE ON public.vol_escala_template_liderancas FOR EACH ROW EXECUTE FUNCTION vol_escala_template_liderancas_touch_updated_at();
CREATE TRIGGER trg_sync_telefone_vol_para_membro AFTER INSERT OR UPDATE OF phone, membresia_id ON public.vol_profiles FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION fn_sync_telefone_vol_para_membro();
CREATE TRIGGER trg_sync_cpf_vol_para_membro AFTER INSERT OR UPDATE OF cpf, membresia_id ON public.vol_profiles FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION fn_sync_cpf_vol_para_membro();
ALTER TABLE int_visitantes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON int_visitantes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON int_visitantes TO authenticated,service_role;
ALTER TABLE mem_ministerios ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_ministerios FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON mem_ministerios TO authenticated,service_role;
ALTER TABLE mem_voluntarios ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_voluntarios FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON mem_voluntarios TO authenticated,service_role;
ALTER TABLE vol_area_supervisores ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_area_supervisores FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_area_supervisores TO authenticated,service_role;
ALTER TABLE vol_availability ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_availability FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_availability TO authenticated,service_role;
ALTER TABLE vol_background_checks ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_background_checks FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_background_checks TO authenticated,service_role;
ALTER TABLE vol_check_ins ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_check_ins FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_check_ins TO authenticated,service_role;
ALTER TABLE vol_config ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_config FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_config TO authenticated,service_role;
ALTER TABLE vol_email_config ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_email_config FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_email_config TO authenticated,service_role;
ALTER TABLE vol_email_disparo_destinatarios ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_email_disparo_destinatarios FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_email_disparo_destinatarios TO authenticated,service_role;
ALTER TABLE vol_email_disparos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_email_disparos FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_email_disparos TO authenticated,service_role;
ALTER TABLE vol_email_templates ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_email_templates FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_email_templates TO authenticated,service_role;
ALTER TABLE vol_escala_culto_itens ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_escala_culto_itens FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_escala_culto_itens TO authenticated,service_role;
ALTER TABLE vol_escala_template_item_pessoas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_escala_template_item_pessoas FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_escala_template_item_pessoas TO authenticated,service_role;
ALTER TABLE vol_escala_template_itens ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_escala_template_itens FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_escala_template_itens TO authenticated,service_role;
ALTER TABLE vol_escala_template_liderancas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_escala_template_liderancas FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_escala_template_liderancas TO authenticated,service_role;
ALTER TABLE vol_escala_template_tipos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_escala_template_tipos FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_escala_template_tipos TO authenticated,service_role;
ALTER TABLE vol_escala_templates ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_escala_templates FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_escala_templates TO authenticated,service_role;
ALTER TABLE vol_form_opcoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_form_opcoes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_form_opcoes TO authenticated,service_role;
ALTER TABLE vol_inatividade ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_inatividade FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_inatividade TO authenticated,service_role;
ALTER TABLE vol_inscricoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_inscricoes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_inscricoes TO authenticated,service_role;
ALTER TABLE vol_inscritos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_inscritos FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_inscritos TO authenticated,service_role;
ALTER TABLE vol_parabens ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_parabens FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_parabens TO authenticated,service_role;
ALTER TABLE vol_pco_mapa ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_pco_mapa FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_pco_mapa TO authenticated,service_role;
ALTER TABLE vol_positions ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_positions FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_positions TO authenticated,service_role;
ALTER TABLE vol_schedules ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_schedules FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_schedules TO authenticated,service_role;
ALTER TABLE vol_services ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_services FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_services TO authenticated,service_role;
ALTER TABLE vol_servicos_historico ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_servicos_historico FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_servicos_historico TO authenticated,service_role;
ALTER TABLE vol_sync_logs ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_sync_logs FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_sync_logs TO authenticated,service_role;
ALTER TABLE vol_team_members ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_team_members FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_team_members TO authenticated,service_role;
ALTER TABLE vol_teams ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_teams FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_teams TO authenticated,service_role;
ALTER TABLE vol_training_checkins ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_training_checkins FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_training_checkins TO authenticated,service_role;
ALTER TABLE vol_user_roles ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_user_roles FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_user_roles TO authenticated,service_role;
ALTER TABLE vol_vinculo_snapshot_20260818 ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_vinculo_snapshot_20260818 FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_vinculo_snapshot_20260818 TO authenticated,service_role;
ALTER TABLE vol_volunteer_qrcodes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_volunteer_qrcodes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON vol_volunteer_qrcodes TO authenticated,service_role;

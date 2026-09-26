-- Snapshot estrutural de produção, 27/09/2026. Sem dados reais.
-- Tipos, defaults, constraints locais e índices preservados. FKs para tabelas fora
-- desta fixture e coluna biométrica vector são omitidos: fluxos fora do escopo.
-- Autenticação e soft-delete são adaptadores sintéticos; políticas multicampus
-- são sempre as migrations reais. Instala apenas os três triggers de decisões
-- envolvidos no matcher/jornada/Cuidados; não simula auditoria ou recálculo NSM.
-- View de KPI transversal é sentinela estrutural, sem validar seu cálculo global.
-- Permissões antigas deliberadamente permissivas em tabelas sintéticas comprovam
-- que as novas policies restritivas realmente isolam. Nenhum helper multicampus é simulado.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION unaccent WITH SCHEMA public; CREATE EXTENSION pg_trgm WITH SCHEMA extensions; SET search_path=public,extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.user',true),'')::uuid$$;
CREATE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE FUNCTION current_user_membro_id() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.member',true),'')::uuid$$;
CREATE FUNCTION current_user_module_level(text) RETURNS integer LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('test.level',true),'')::integer,1)$$;
CREATE OR REPLACE FUNCTION public.fn_batismo_gerar_codigo_acesso()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE codigo text; tentativas int := 0;
  BEGIN
    LOOP
      codigo := replace(gen_random_uuid()::text, '-', '');
      IF NOT EXISTS (SELECT 1 FROM public.batismo_inscricoes WHERE codigo_acesso = codigo) THEN
        RETURN codigo;
      END IF;
      tentativas := tentativas + 1;
      IF tentativas > 20 THEN RAISE EXCEPTION 'batismo: não conseguiu gerar codigo_acesso único'; END IF;
    END LOOP;
  END $function$
;
CREATE OR REPLACE FUNCTION public.fn_batismo_gerar_codigo_conferencia()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    codigo text; tentativas int := 0;
  BEGIN
    LOOP
      codigo := '';
      FOR i IN 1..6 LOOP
        codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
      END LOOP;
      IF NOT EXISTS (
        SELECT 1 FROM public.batismo_inscricoes
        WHERE codigo_conferencia = codigo AND deleted_at IS NULL
      ) THEN RETURN codigo; END IF;
      tentativas := tentativas + 1;
      IF tentativas > 50 THEN RAISE EXCEPTION 'batismo: não conseguiu gerar codigo_conferencia único após 50 tentativas'; END IF;
    END LOOP;
  END $function$
;
CREATE TYPE vol_user_role AS ENUM('volunteer','leader','admin');
CREATE TYPE area_adm_resp AS ENUM('reserva_espaco','cozinha','manutencao','logistica_estoque','logistica_compras','ti','rh','financeiro','producao','adoracao','marketing','limpeza','hospitalidade');
CREATE TYPE area_kpi AS ENUM('kids','ami','bridge','sede','online','cba');
CREATE TYPE grupo_funcao AS ENUM('visitante','frequentador','lider_treinamento','lider','co_lider','supervisor','coordenador');
CREATE SEQUENCE app_audit_log_id_seq;
CREATE SEQUENCE mem_grupo_membros_historico_id_seq;
CREATE SEQUENCE mem_grupos_historico_id_seq;
CREATE SEQUENCE modulos_id_seq;
CREATE TABLE app_audit_log(
"id" bigint DEFAULT nextval('app_audit_log_id_seq'::regclass) NOT NULL,
"table_name" text NOT NULL,
"row_id" text NOT NULL,
"action" text NOT NULL,
"user_id" uuid,
"user_email" text,
"changes" jsonb,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE app_super_admins(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"email" text NOT NULL,
"nome" text,
"ativo" boolean DEFAULT true NOT NULL,
"added_at" timestamp with time zone DEFAULT now() NOT NULL,
"added_by" text,
"notes" text
);
CREATE TABLE batismo_eventos(
"data" date NOT NULL,
"aberto" boolean DEFAULT true NOT NULL,
"observacao" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE batismo_horarios(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"horario" text NOT NULL,
"label" text NOT NULL,
"aberto" boolean DEFAULT true NOT NULL,
"limite" integer,
"ordem" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE batismo_inscricoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid,
"nome" text NOT NULL,
"sobrenome" text NOT NULL,
"data_nascimento" date,
"cpf" text,
"telefone" text,
"email" text,
"status" text DEFAULT 'pendente'::text,
"data_batismo" date,
"inscrito_por" uuid,
"origem" text DEFAULT 'manual'::text,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"area_kpi" text DEFAULT 'sede'::text NOT NULL,
"tamanho_camisa" text,
"eh_crianca" boolean DEFAULT false NOT NULL,
"categoria_etaria" text,
"possui_deficiencia" boolean DEFAULT false NOT NULL,
"deficiencia_descricao" text,
"endereco" text,
"deleted_at" timestamp with time zone,
"checkin_em" timestamp with time zone,
"codigo_acesso" text DEFAULT fn_batismo_gerar_codigo_acesso(),
"codigo_conferencia" text DEFAULT fn_batismo_gerar_codigo_conferencia(),
"checkin_por" uuid,
"foto_referencia_url" text,
"consentimento_em" timestamp with time zone,
"horario_culto" text,
"fez_next" boolean,
"cep" text,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
"sexo" text
);
CREATE TABLE cui_acompanhamentos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid,
"nome" text NOT NULL,
"cpf" text,
"telefone" text,
"responsavel_id" uuid,
"motivo" text,
"status" text DEFAULT 'ativo'::text NOT NULL,
"data_inicio" date DEFAULT CURRENT_DATE NOT NULL,
"data_encerramento" date,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_by" uuid,
"deleted_at" timestamp with time zone,
"tipo" text DEFAULT 'aconselhamento'::text NOT NULL,
"agendamento_data" date,
"agendamento_hora" time without time zone,
"agendamento_responsavel_id" uuid,
"agendamento_responsavel_nome" text,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
);
CREATE TABLE cui_atendimento_comentarios(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"ref_tipo" text NOT NULL,
"ref_id" uuid NOT NULL,
"texto" text NOT NULL,
"autor_id" uuid,
"autor_nome" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE cui_batismo_next_fila(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"convertido_id" uuid NOT NULL,
"area" text,
"responsavel_id" uuid,
"responsavel_nome" text,
"falta_batismo" boolean DEFAULT false NOT NULL,
"falta_next" boolean DEFAULT false NOT NULL,
"dias" integer,
"mensagem_rascunho" text,
"telefone" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"prazo" date,
"enviado_em" timestamp with time zone,
"enviado_por" uuid,
"feedback" text,
"agente_versao" text DEFAULT 'batismo-next-v1'::text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE cui_convertidos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"culto_id" uuid,
"data_culto" date NOT NULL,
"membro_id" uuid,
"nome" text NOT NULL,
"cpf" text,
"telefone" text,
"atendido_apos_culto" boolean DEFAULT false NOT NULL,
"cadastrado" boolean DEFAULT false NOT NULL,
"responsavel_id" uuid,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"encontro_marcado" boolean DEFAULT false NOT NULL,
"data_encontro" date,
"tags" text[] DEFAULT '{}'::text[] NOT NULL,
"deleted_at" timestamp with time zone,
"encontro_hora" time without time zone,
"encontro_responsavel_id" uuid,
"encontro_responsavel_nome" text,
"encontro_status" text,
"encontro_compareceu" boolean,
"desfecho_em" timestamp with time zone,
"desfecho_por" uuid,
"desfecho_observacoes" text,
"area" text,
"primeiro_contato_em" timestamp with time zone,
"primeiro_contato_por" uuid,
"primeiro_contato_status" text,
"next_resolucao" text,
"next_resolucao_em" timestamp with time zone,
"next_resolucao_por" uuid,
"responsavel_atendimento" text,
"direcionamento" text,
"direcionamento_em" timestamp with time zone,
"direcionamento_ref_tipo" text,
"direcionamento_ref_id" uuid,
"next_convite_em" timestamp with time zone,
"next_convite_por" uuid,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
);
CREATE TABLE cui_j180_encontro_presencas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"encontro_id" uuid NOT NULL,
"turma_membro_id" uuid NOT NULL,
"presente" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE cui_j180_encontros(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"turma_id" uuid NOT NULL,
"data" date DEFAULT CURRENT_DATE NOT NULL,
"tema" text,
"observacoes" text,
"registrado_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE cui_j180_turma_membros(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"turma_id" uuid NOT NULL,
"membro_id" uuid,
"nome" text NOT NULL,
"telefone" text,
"entrou_em" date DEFAULT CURRENT_DATE NOT NULL,
"saiu_em" date,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE cui_j180_turmas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"area" text DEFAULT 'sede'::text NOT NULL,
"lider_id" uuid,
"lider_nome" text,
"temporada" text,
"dia_semana" smallint,
"horario" time without time zone,
"descricao" text,
"ativo" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE cui_jornada180(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid,
"nome" text NOT NULL,
"cpf" text,
"etapa" integer DEFAULT 1 NOT NULL,
"data_encontro" date NOT NULL,
"presente" boolean DEFAULT true NOT NULL,
"responsavel_id" uuid,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
);
CREATE TABLE cui_pedidos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"canal" text DEFAULT 'manual'::text NOT NULL,
"tipo" text DEFAULT 'outro'::text NOT NULL,
"membro_id" uuid,
"nome" text,
"telefone" text,
"email" text,
"mensagem" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"atribuido_a" uuid,
"origem_ref" jsonb,
"atendimento_ref" jsonb,
"criado_por" uuid,
"tratado_por" uuid,
"tratado_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE cui_primeiro_contato_fila(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"convertido_id" uuid NOT NULL,
"area" text,
"responsavel_id" uuid,
"responsavel_nome" text,
"mensagem_rascunho" text,
"telefone" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"prazo" date,
"enviado_em" timestamp with time zone,
"enviado_por" uuid,
"feedback" text,
"agente_versao" text DEFAULT 'primeiro-contato-v1'::text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE cui_visitas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"membro_id" uuid,
"telefone" text,
"data_visita" date DEFAULT CURRENT_DATE NOT NULL,
"tipo" text DEFAULT 'visita_domiciliar'::text NOT NULL,
"responsavel" text,
"status" text DEFAULT 'realizada'::text NOT NULL,
"observacao" text,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"tipo_outro" text
);
CREATE TABLE cultos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"service_type_id" uuid,
"nome" text NOT NULL,
"data" date NOT NULL,
"hora" time without time zone NOT NULL,
"presencial_adulto" integer DEFAULT 0,
"presencial_kids" integer DEFAULT 0,
"decisoes_presenciais" integer DEFAULT 0,
"decisoes_online" integer DEFAULT 0,
"youtube_video_id" text,
"online_pico" integer,
"online_ds" integer,
"online_ddus" integer,
"ds_coletado_em" timestamp with time zone,
"ddus_coletado_em" timestamp with time zone,
"inserido_por" uuid,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"visitantes" integer,
"visitantes_online" integer,
"voluntarios" integer,
"decisoes_kids" integer DEFAULT 0 NOT NULL,
"observacoes" text,
"online_watch_minutes_ds" integer,
"online_watch_minutes_ddus" integer,
"online_retencao_pct_ds" numeric(5,2),
"online_retencao_pct_ddus" numeric(5,2),
"online_subs_ganhos" integer,
"online_subs_perdidos" integer,
"online_views_inscritos" integer,
"online_views_nao_inscritos" integer,
"deleted_at" timestamp with time zone,
"voluntarios_escalados" integer,
"voluntarios_checkin" integer,
"online_decisoes_chat" integer,
"online_chat_page_token" text,
"frequencia_lancada" boolean DEFAULT false NOT NULL,
"decisoes_lancadas" boolean DEFAULT false NOT NULL,
"kids_resumo_enviado_at" timestamp with time zone,
"online_pico_verificado" boolean DEFAULT false NOT NULL,
"online_views_live" integer,
"decisoes_online_extra" integer DEFAULT 0 NOT NULL
);
CREATE TABLE cultos_decisoes_pessoas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"culto_id" uuid,
"membro_id" uuid,
"nome" text NOT NULL,
"telefone" text,
"email" text,
"idade" integer,
"cpf" text,
"tipo_decisao" text DEFAULT 'presencial'::text NOT NULL,
"observacoes" text,
"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
"registrado_por" uuid,
"status_followup" text DEFAULT 'pendente'::text NOT NULL,
"observacoes_followup" text,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"data_nascimento" date,
"responsavel_nome" text,
"responsavel_telefone" text,
"responsavel_cpf" text,
"deleted_at" timestamp with time zone,
"kids_crianca_id" uuid,
"fonte" text DEFAULT 'manual'::text NOT NULL,
"cep" text,
"decidiu_em" date
);
CREATE TABLE dados_brutos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"tipo_id" text NOT NULL,
"area" text NOT NULL,
"data" date NOT NULL,
"valor" numeric NOT NULL,
"contexto" jsonb DEFAULT '{}'::jsonb,
"observacao" text,
"registrado_por" uuid,
"origem" text DEFAULT 'manual'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"validado_por_user_id" uuid,
"validado_em" timestamp with time zone
);
CREATE TABLE grupo_supervisao_observacoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"supervisor_id" uuid NOT NULL,
"periodo" text NOT NULL,
"observacao" text NOT NULL,
"registrado_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE grupo_supervisao_visitas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"supervisor_id" uuid,
"data_visita" date DEFAULT CURRENT_DATE NOT NULL,
"observacao" text,
"registrado_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"status" text DEFAULT 'realizada'::text NOT NULL,
"responsavel_id" uuid,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE identidade_pendencias(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"tipo" text NOT NULL,
"membro_id" uuid,
"membro_conflito_id" uuid,
"origem" text,
"origem_id" text,
"detalhe" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"resolvida_por" uuid,
"resolvida_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE igrejas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"slug" text NOT NULL,
"tipo" text NOT NULL,
"pastor_responsavel_id" uuid,
"cidade" text,
"estado" text,
"data_inicio" date,
"observacoes" text,
"ativa" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE inscricoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"evento_id" uuid NOT NULL,
"membro_id" uuid,
"nome_completo" text NOT NULL,
"telefone" text,
"cpf" text,
"email" text,
"data_nascimento" date,
"sexo" text,
"endereco" text,
"cep" text,
"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
"dados_anterior" jsonb,
"status" text DEFAULT 'confirmada'::text NOT NULL,
"origem" text DEFAULT 'formulario_publico'::text NOT NULL,
"numero_sorte" integer,
"legado_ref" uuid,
"legado_fonte" text,
"whatsapp_optin" boolean DEFAULT false NOT NULL,
"whatsapp_optin_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"valor_cobrado_centavos" integer,
"bolsa_tipo" text,
"bolsa_motivo" text,
"bolsa_por" uuid,
"bolsa_por_nome" text,
"bolsa_em" timestamp with time zone,
"codigo" text,
"totem_estacao_id" uuid,
"responsavel_nome" text,
"responsavel_cpf" text,
"responsavel_parentesco" text,
"responsavel_telefone" text,
"responsavel_email" text,
"responsavel_autoriza_batismo" boolean
);
CREATE TABLE mem_cadastros_pendentes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"email" text,
"telefone" text,
"data_nascimento" date,
"estado_civil" text,
"endereco" text,
"bairro" text,
"cidade" text,
"cep" text,
"profissao" text,
"como_conheceu" text,
"origem" text DEFAULT 'site'::text NOT NULL,
"aceita_termos" boolean DEFAULT false NOT NULL,
"aceita_contato" boolean DEFAULT false NOT NULL,
"consentimento_texto" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"duplicado_de_id" uuid,
"motivo_rejeicao" text,
"aprovado_por" uuid,
"aprovado_em" timestamp with time zone,
"membro_id" uuid,
"ip_origem" text,
"user_agent" text,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"cpf" text,
"familia_sugerida_id" uuid,
"foto_url" text,
"nao_vincular_fraco" boolean DEFAULT false NOT NULL,
"genero" text,
"whatsapp_optin" boolean DEFAULT false NOT NULL,
"whatsapp_optin_em" timestamp with time zone,
"converteu_na_cbrio" boolean,
"censo" boolean DEFAULT false NOT NULL,
"vinculo_declarado" text,
"censo_conflitos" jsonb,
"carta_transferencia" boolean,
"igreja_anterior" text
);
CREATE TABLE mem_contatos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid NOT NULL,
"tipo" text NOT NULL,
"valor" text NOT NULL,
"fonte" text,
"primeiro_visto" timestamp with time zone DEFAULT now() NOT NULL,
"ultimo_visto" timestamp with time zone DEFAULT now() NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE mem_grupo_agenda_excecoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"data_original" date NOT NULL,
"status" text NOT NULL,
"nova_data" date,
"novo_horario" time without time zone,
"motivo" text,
"decidido_por" uuid,
"decidido_por_nome" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mem_grupo_conferencias(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"temporada_id" text,
"rodada" integer DEFAULT 1 NOT NULL,
"lider_membro_id" uuid,
"lider_nome" text,
"lider_telefone" text,
"status" text DEFAULT 'enviada'::text NOT NULL,
"observacao" text,
"roster_total" integer,
"mantidos_count" integer,
"removidos_count" integer,
"mantidos_ids" jsonb,
"removidos_vinculo_ids" jsonb,
"token_geracao" integer DEFAULT 1 NOT NULL,
"enviado_em" timestamp with time zone,
"primeira_resposta_em" timestamp with time zone,
"ultima_resposta_em" timestamp with time zone,
"triagem_obs" text,
"triado_por" uuid,
"triado_por_nome" text,
"triado_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE mem_grupo_documentos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid,
"tipo" text DEFAULT 'arquivo'::text NOT NULL,
"nome" text NOT NULL,
"descricao" text,
"comentario" text,
"storage_path" text,
"sharepoint_url" text,
"sharepoint_item_id" text,
"uploaded_by" uuid,
"uploaded_by_name" text,
"created_at" timestamp with time zone DEFAULT now(),
"etiquetas" text[] DEFAULT ARRAY[]::text[],
"grupo_ids" uuid[] DEFAULT ARRAY[]::uuid[],
"estudo_semana" boolean DEFAULT false NOT NULL
);
CREATE TABLE mem_grupo_encontro_presencas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"encontro_id" uuid NOT NULL,
"membro_id" uuid,
"presente" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mem_grupo_encontros(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"data" date DEFAULT CURRENT_DATE NOT NULL,
"tema" text,
"observacoes" text,
"registrado_por" uuid,
"registrado_por_nome" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE mem_grupo_link(
"grupo_id" uuid NOT NULL,
"link" text NOT NULL,
"plataforma" text,
"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
"atualizado_por" uuid
);
CREATE TABLE mem_grupo_membros(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"membro_id" uuid,
"entrou_em" date DEFAULT CURRENT_DATE NOT NULL,
"saiu_em" date,
"motivo_saida" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"presencas" integer DEFAULT 0,
"funcao" grupo_funcao DEFAULT 'frequentador'::grupo_funcao NOT NULL,
"deleted_at" timestamp with time zone,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
"renovacao_id" uuid,
"conferencia_id" uuid
);
CREATE TABLE mem_grupo_membros_historico(
"id" bigint DEFAULT nextval('mem_grupo_membros_historico_id_seq'::regclass) NOT NULL,
"participacao_id" uuid NOT NULL,
"ocorrido_em" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"evento" text NOT NULL,
"estado" jsonb NOT NULL
);
CREATE TABLE mem_grupo_pedido_eventos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"pedido_id" uuid NOT NULL,
"tipo" text NOT NULL,
"detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL,
"autor_nome" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mem_grupo_pedidos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"membro_id" uuid,
"cadastro_pendente_id" uuid,
"nome" text NOT NULL,
"email" text,
"telefone" text,
"origem" text DEFAULT 'cadastro_interno'::text NOT NULL,
"status" text DEFAULT 'pendente'::text NOT NULL,
"motivo_rejeicao" text,
"observacao" text,
"decidido_por" uuid,
"decidido_por_nome" text,
"decidido_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"sugerido_grupo_id" uuid,
"sugerido_em" timestamp with time zone,
"sugerido_por_nome" text,
"resolvido_grupo_id" uuid,
"casal_pedido_id" uuid
);
CREATE TABLE mem_grupo_renovacoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"grupo_id" uuid NOT NULL,
"temporada_id" text NOT NULL,
"lider_membro_id" uuid,
"lider_nome" text,
"lider_telefone" text,
"status" text DEFAULT 'enviada'::text NOT NULL,
"motivo" text,
"roster_total" integer,
"confirmados_count" integer,
"removidos_count" integer,
"confirmados_ids" jsonb,
"removidos_vinculo_ids" jsonb,
"token_geracao" integer DEFAULT 1 NOT NULL,
"enviado_em" timestamp with time zone,
"primeira_resposta_em" timestamp with time zone,
"ultima_resposta_em" timestamp with time zone,
"triagem_acao" text,
"triagem_obs" text,
"triado_por" uuid,
"triado_por_nome" text,
"triado_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE mem_grupo_transferencias(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid NOT NULL,
"grupo_origem_id" uuid NOT NULL,
"vinculo_id" uuid,
"motivo" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"grupo_destino_id" uuid,
"pedido_por" uuid,
"pedido_por_nome" text,
"origem" text DEFAULT 'app'::text NOT NULL,
"resolvido_por" uuid,
"resolvido_por_nome" text,
"resolvido_em" timestamp with time zone,
"resolucao_obs" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE mem_grupos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"categoria" text,
"lider_id" uuid,
"local" text,
"endereco" text,
"dia_semana" smallint,
"horario" time without time zone,
"descricao" text,
"ativo" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"recorrencia" text DEFAULT 'semanal'::text,
"tema" text DEFAULT ''::text,
"foto_url" text,
"observacoes" text DEFAULT ''::text,
"grupo_origem_id" uuid,
"updated_at" timestamp with time zone DEFAULT now(),
"cep" text,
"lat" numeric(10,7),
"lng" numeric(10,7),
"bairro" text,
"status_temporada" text,
"temporada" text,
"codigo" text,
"complemento" text,
"supervisor_id" uuid,
"deleted_at" timestamp with time zone,
"area" text DEFAULT 'sede'::text NOT NULL,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
"faixa_etaria" text,
"capacidade" integer,
"aceitando_inscricoes" boolean DEFAULT true NOT NULL,
"rede_id" uuid,
"idade_min" integer,
"idade_max" integer,
"modo_inscricao" text DEFAULT 'temporada'::text NOT NULL
);
CREATE TABLE mem_grupos_historico(
"id" bigint DEFAULT nextval('mem_grupos_historico_id_seq'::regclass) NOT NULL,
"grupo_id" uuid NOT NULL,
"ocorrido_em" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
"evento" text NOT NULL,
"estado" jsonb NOT NULL
);
CREATE TABLE mem_historico(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid,
"tipo" text NOT NULL,
"descricao" text NOT NULL,
"data" date DEFAULT CURRENT_DATE NOT NULL,
"registrado_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE mem_membros(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"cpf" text,
"nome" text NOT NULL,
"email" text,
"telefone" text,
"data_nascimento" date,
"genero" text,
"estado_civil" text,
"endereco" text,
"bairro" text,
"cidade" text DEFAULT 'Rio de Janeiro'::text,
"foto_url" text,
"familia_id" uuid,
"status" text DEFAULT 'visitante'::text NOT NULL,
"data_conversao" date,
"batizado" boolean DEFAULT false,
"data_batismo" date,
"data_membresia" date,
"ministerio" text,
"grupo" text,
"voluntario" boolean DEFAULT false,
"lider" boolean DEFAULT false,
"como_conheceu" text,
"observacoes" text,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"parentesco" text,
"cep" text,
"profissao" text,
"quer_servir" boolean DEFAULT false NOT NULL,
"lat" numeric(10,7),
"lng" numeric(10,7),
"origem_cadastro" text,
"igreja_id" uuid,
"deleted_at" timestamp with time zone,
"cnpj" text,
"perfil_contribuicao" jsonb DEFAULT '{}'::jsonb,
"batizado_outra_igreja" boolean DEFAULT false,
"igreja_batismo_anterior" text,
"frequenta_area" text,
"whatsapp_optin" boolean DEFAULT false NOT NULL,
"whatsapp_optin_em" timestamp with time zone,
"face_consentimento" boolean DEFAULT false NOT NULL,
"face_consentimento_em" timestamp with time zone,
"face_cadastrado_em" timestamp with time zone,
"planning_center_id" text,
"apelido" text,
"censo_respondido_em" timestamp with time zone,
"censo_vinculo_declarado" text,
"escolaridade" text,
"telefone_digits" text GENERATED ALWAYS AS (
CASE
    WHEN (((length(regexp_replace(COALESCE(telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text)) >= 12) AND (length(regexp_replace(COALESCE(telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text)) <= 13)) AND ("left"(regexp_replace(COALESCE(telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text), 2) = '55'::text)) THEN substr(regexp_replace(COALESCE(telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text), 3)
    ELSE NULLIF(regexp_replace(COALESCE(telefone, ''::text), '[^0-9]'::text, ''::text, 'g'::text), ''::text)
END) STORED,
"inativado_em" timestamp with time zone,
"inativado_motivo" text,
"inativado_por" uuid,
"inativado_status_anterior" text,
"email_optout" boolean DEFAULT false NOT NULL,
"email_optout_em" timestamp with time zone,
"carta_transferencia" boolean,
"igreja_anterior" text
);
CREATE TABLE mem_temporada_consolidado(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"temporada" text NOT NULL,
"temporada_label" text,
"data_inicio" date,
"data_fim" date,
"num_grupos" integer DEFAULT 0 NOT NULL,
"num_inscricoes" integer DEFAULT 0 NOT NULL,
"num_membros" integer DEFAULT 0 NOT NULL,
"num_lideres" integer DEFAULT 0 NOT NULL,
"num_lideres_treinamento" integer DEFAULT 0 NOT NULL,
"satisfacao_lideres" numeric,
"satisfacao_lideres_data" date,
"total_encontros" integer DEFAULT 0 NOT NULL,
"total_presencas" integer DEFAULT 0 NOT NULL,
"frequencia_media" numeric DEFAULT 0 NOT NULL,
"metricas_extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
"consolidado_em" timestamp with time zone DEFAULT now() NOT NULL,
"consolidado_por" uuid,
"consolidado_por_nome" text
);
CREATE TABLE mem_temporadas(
"id" text NOT NULL,
"label" text NOT NULL,
"ano" smallint NOT NULL,
"numero" smallint NOT NULL,
"data_inicio" date,
"data_fim" date,
"ativa" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"inscricoes_abertas" boolean DEFAULT false NOT NULL
);
CREATE TABLE mem_trilha_valores(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid,
"etapa" text NOT NULL,
"data_conclusao" date,
"observacoes" text,
"concluida" boolean DEFAULT false NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE modulos(
"id" integer DEFAULT nextval('modulos_id_seq'::regclass) NOT NULL,
"nome" character varying(100) NOT NULL,
"descricao" text,
"ativo" boolean DEFAULT true,
"created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
"slug" text,
"rota" text,
"categoria" text,
"ordem" integer DEFAULT 0 NOT NULL,
"escopo_campus" text DEFAULT 'compartilhado'::text NOT NULL
);
CREATE TABLE next_encontros(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"turma_id" uuid NOT NULL,
"numero" integer DEFAULT 1 NOT NULL,
"data" date,
"tema" text,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE next_eventos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"data" date NOT NULL,
"titulo" text,
"status" text DEFAULT 'agendado'::text NOT NULL,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"total_lista" integer,
"presentes_impressa" integer,
"presentes_manuscritos" integer,
"arquivo_origem" text
);
CREATE TABLE next_indicacoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"inscricao_id" uuid NOT NULL,
"tipo" text NOT NULL,
"status" text DEFAULT 'pendente'::text NOT NULL,
"area_destino" text,
"observacoes" text,
"atendido_por" uuid,
"atendido_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now()
);
CREATE TABLE next_inscricoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"evento_id" uuid,
"nome" text NOT NULL,
"sobrenome" text,
"cpf" text,
"telefone" text,
"email" text,
"data_nascimento" date,
"observacoes" text,
"membro_id" uuid,
"ja_batizado" boolean DEFAULT false,
"ja_voluntario" boolean DEFAULT false,
"ja_doador" boolean DEFAULT false,
"check_in_at" timestamp with time zone,
"check_in_by" uuid,
"indicou_batismo" boolean DEFAULT false,
"indicou_servir" boolean DEFAULT false,
"indicou_grupo" boolean DEFAULT false,
"indicou_dizimo" boolean DEFAULT false,
"indicacao_observacoes" text,
"indicacao_marcada_em" timestamp with time zone,
"indicacao_marcada_por" uuid,
"origem" text DEFAULT 'formulario'::text NOT NULL,
"registered_by" uuid,
"created_at" timestamp with time zone DEFAULT now(),
"updated_at" timestamp with time zone DEFAULT now(),
"origem_lista" text,
"motivo" text,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
);
CREATE TABLE next_matriculas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"turma_id" uuid,
"nome" text NOT NULL,
"sobrenome" text,
"cpf" text,
"telefone" text,
"email" text,
"data_nascimento" date,
"observacoes" text,
"membro_id" uuid,
"ja_batizado" boolean DEFAULT false,
"ja_voluntario" boolean DEFAULT false,
"ja_doador" boolean DEFAULT false,
"indicou_batismo" boolean DEFAULT false,
"indicou_servir" boolean DEFAULT false,
"indicou_grupo" boolean DEFAULT false,
"indicou_dizimo" boolean DEFAULT false,
"status" text DEFAULT 'matriculado'::text NOT NULL,
"origem" text DEFAULT 'formulario'::text NOT NULL,
"registered_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"origem_inscricao_id" uuid,
"origem_mes_key" text,
"motivo" text,
"indicou_devocional" boolean DEFAULT false NOT NULL,
"check_in_at" timestamp with time zone,
"check_in_by" uuid,
"contato_em" timestamp with time zone,
"contato_por" uuid,
"sexo" text,
"endereco" text,
"whatsapp_optin" boolean DEFAULT false NOT NULL,
"whatsapp_optin_em" timestamp with time zone
);
CREATE TABLE next_presencas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"encontro_id" uuid NOT NULL,
"matricula_id" uuid NOT NULL,
"presente" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE next_turmas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"status" text DEFAULT 'aberta'::text NOT NULL,
"responsavel_id" uuid,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"origem_evento_id" uuid,
"origem_mes" text,
"horario" text,
"auto_domingo" date
);
CREATE TABLE notificacoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"usuario_id" uuid NOT NULL,
"titulo" text NOT NULL,
"mensagem" text NOT NULL,
"tipo" text DEFAULT 'info'::text NOT NULL,
"lida" boolean DEFAULT false NOT NULL,
"link" text,
"dados" jsonb,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"modulo" text,
"severidade" text DEFAULT 'info'::text,
"chave_dedup" text
);
CREATE TABLE nsm_eventos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"membro_id" uuid,
"visitante_id" uuid,
"cpf" text,
"nome" text,
"igreja_id" uuid,
"data_decisao" date NOT NULL,
"valor_engajado" text NOT NULL,
"data_engajamento" date NOT NULL,
"dias_da_decisao" integer GENERATED ALWAYS AS ((data_engajamento - data_decisao)) STORED,
"dentro_janela_60d" boolean GENERATED ALWAYS AS (((data_engajamento - data_decisao) <= 60)) STORED,
"origem" text NOT NULL,
"origem_id" uuid,
"observacao" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE profiles(
"id" uuid NOT NULL,
"name" text NOT NULL,
"email" text NOT NULL,
"role" text DEFAULT 'assistente'::text NOT NULL,
"area" text,
"avatar_url" text,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"kpi_areas" text[] DEFAULT ARRAY[]::text[] NOT NULL,
"is_diretoria_geral" boolean DEFAULT false NOT NULL,
"funcao_diretoria" text,
"ministerio_id" text,
"ministerio_papel" text,
"kpi_valores" text[] DEFAULT ARRAY[]::text[] NOT NULL,
"telefone" text,
"membro_id" uuid,
"is_membro_only" boolean DEFAULT false NOT NULL,
"password_changed_at" timestamp with time zone,
"status" text,
"data_nascimento" date,
"app_ficha_confirmada_em" timestamp with time zone,
"is_servico" boolean DEFAULT false NOT NULL
);
CREATE TABLE usuario_igrejas(
"usuario_id" uuid NOT NULL,
"igreja_id" uuid NOT NULL,
"papel" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE vol_profiles(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"auth_user_id" uuid,
"full_name" text NOT NULL,
"email" text,
"planning_center_id" text,
"qr_code" text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text),
"avatar_url" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"cpf" text,
"phone" text,
"profile_complete" boolean DEFAULT false NOT NULL,
"membresia_id" uuid,
"origem" text DEFAULT 'planning_center'::text NOT NULL,
"allocation_status" text DEFAULT 'active'::text NOT NULL,
"arquivado" boolean DEFAULT false NOT NULL,
"arquivado_em" timestamp with time zone,
"protegido_sync" boolean DEFAULT false NOT NULL,
"arquivado_manual" boolean DEFAULT false NOT NULL,
"rodizio_semana" smallint
);
CREATE TABLE vol_service_types(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"description" text,
"recurrence_day" smallint,
"recurrence_time" time without time zone,
"is_active" boolean DEFAULT true NOT NULL,
"color" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"has_online_stream" boolean DEFAULT true NOT NULL,
"presencial_label" text DEFAULT 'Presencial'::text NOT NULL,
"has_kids" boolean DEFAULT false NOT NULL,
"has_online" boolean DEFAULT false NOT NULL,
"meta_duracao_min" integer DEFAULT 60 NOT NULL,
"bloco_servico" text,
"vigente_de" date,
"vigente_ate" date,
"linhagem_key" text,
"consolidacao_key" text,
"capacidade_lugares" integer
);
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_censo_vinculo_declarado_check CHECK (((censo_vinculo_declarado IS NULL) OR (censo_vinculo_declarado = ANY (ARRAY['membro'::text, 'congregado'::text, 'visitante'::text]))));
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_estado_civil_check CHECK (((estado_civil IS NULL) OR (estado_civil = ANY (ARRAY['solteiro'::text, 'casado'::text, 'divorciado'::text, 'viuvo'::text, 'uniao_estavel'::text]))));
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_frequenta_area_check CHECK ((frequenta_area = ANY (ARRAY['ami'::text, 'bridge'::text, 'online'::text])));
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_genero_check CHECK ((genero = ANY (ARRAY['masculino'::text, 'feminino'::text, 'outro'::text])));
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_parentesco_check CHECK ((parentesco = ANY (ARRAY['responsavel'::text, 'conjuge'::text, 'filho'::text, 'outro'::text])));
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_pkey PRIMARY KEY (id);
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_status_check CHECK ((status = ANY (ARRAY['visitante'::text, 'frequentador'::text, 'membro'::text, 'membro_ativo'::text, 'inativo'::text, 'transferido'::text, 'contribuinte_avulso'::text])));
ALTER TABLE mem_grupos_historico ADD CONSTRAINT mem_grupos_historico_evento_check CHECK ((evento = ANY (ARRAY['BASELINE'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE mem_grupos_historico ADD CONSTRAINT mem_grupos_historico_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_membros_historico ADD CONSTRAINT mem_grupo_membros_historico_evento_check CHECK ((evento = ANY (ARRAY['BASELINE'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE mem_grupo_membros_historico ADD CONSTRAINT mem_grupo_membros_historico_pkey PRIMARY KEY (id);
ALTER TABLE mem_trilha_valores ADD CONSTRAINT mem_trilha_valores_pkey PRIMARY KEY (id);
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_pkey PRIMARY KEY (id);
ALTER TABLE batismo_eventos ADD CONSTRAINT batismo_eventos_pkey PRIMARY KEY (data);
ALTER TABLE mem_grupo_link ADD CONSTRAINT chk_mem_grupo_link_https CHECK ((link ~* '^https://[^[:space:]]{4,500}$'::text));
ALTER TABLE mem_grupo_link ADD CONSTRAINT mem_grupo_link_pkey PRIMARY KEY (grupo_id);
ALTER TABLE mem_grupo_membros ADD CONSTRAINT chk_grupo_membros_sem_colider CHECK ((funcao <> 'co_lider'::grupo_funcao));
ALTER TABLE mem_grupo_membros ADD CONSTRAINT mem_grupo_membros_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_documentos ADD CONSTRAINT mem_grupo_documentos_pkey PRIMARY KEY (id);
ALTER TABLE vol_profiles ADD CONSTRAINT vol_profiles_allocation_status_check CHECK ((allocation_status = ANY (ARRAY['active'::text, 'waiting_allocation'::text, 'inactive'::text])));
ALTER TABLE vol_profiles ADD CONSTRAINT vol_profiles_origem_check CHECK ((origem = ANY (ARRAY['planning_center'::text, 'membresia'::text, 'manual'::text])));
ALTER TABLE vol_profiles ADD CONSTRAINT vol_profiles_pkey PRIMARY KEY (id);
ALTER TABLE vol_profiles ADD CONSTRAINT vol_profiles_planning_center_id_key UNIQUE (planning_center_id);
ALTER TABLE vol_profiles ADD CONSTRAINT vol_profiles_qr_code_key UNIQUE (qr_code);
ALTER TABLE vol_profiles ADD CONSTRAINT vol_profiles_rodizio_semana_check CHECK (((rodizio_semana IS NULL) OR ((rodizio_semana >= 1) AND (rodizio_semana <= 4))));
ALTER TABLE dados_brutos ADD CONSTRAINT dados_brutos_origem_check CHECK ((origem = ANY (ARRAY['manual'::text, 'auto'::text, 'importado'::text])));
ALTER TABLE dados_brutos ADD CONSTRAINT dados_brutos_pkey PRIMARY KEY (id);
ALTER TABLE dados_brutos ADD CONSTRAINT uq_dado_bruto_chave UNIQUE (tipo_id, area, data, contexto);
ALTER TABLE grupo_supervisao_visitas ADD CONSTRAINT grupo_supervisao_visitas_pkey PRIMARY KEY (id);
ALTER TABLE grupo_supervisao_visitas ADD CONSTRAINT grupo_supervisao_visitas_status_check CHECK ((status = ANY (ARRAY['agendada'::text, 'realizada'::text, 'cancelada'::text])));
ALTER TABLE grupo_supervisao_observacoes ADD CONSTRAINT grupo_supervisao_observacoes_pkey PRIMARY KEY (id);
ALTER TABLE grupo_supervisao_observacoes ADD CONSTRAINT uniq_observacao_grupo_periodo UNIQUE (grupo_id, periodo);
ALTER TABLE next_inscricoes ADD CONSTRAINT next_inscricoes_origem_check CHECK ((origem = ANY (ARRAY['formulario'::text, 'manual'::text, 'app'::text])));
ALTER TABLE next_inscricoes ADD CONSTRAINT next_inscricoes_origem_lista_check CHECK ((origem_lista = ANY (ARRAY['impressa'::text, 'manuscrito'::text])));
ALTER TABLE next_inscricoes ADD CONSTRAINT next_inscricoes_pkey PRIMARY KEY (id);
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_fonte_check CHECK ((fonte = ANY (ARRAY['manual'::text, 'form_publico'::text, 'chat'::text, 'app'::text, 'link_culto'::text, 'importacao_planilha_kids'::text])));
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_idade_check CHECK (((idade IS NULL) OR ((idade >= 0) AND (idade <= 120))));
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_nome_check CHECK ((length(TRIM(BOTH FROM nome)) >= 2));
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_pkey PRIMARY KEY (id);
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_status_followup_check CHECK ((status_followup = ANY (ARRAY['pendente'::text, 'em_acompanhamento'::text, 'integrado'::text, 'sem_resposta'::text])));
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_tipo_decisao_check CHECK ((tipo_decisao = ANY (ARRAY['presencial'::text, 'online'::text, 'kids'::text])));
ALTER TABLE modulos ADD CONSTRAINT modulos_escopo_campus_check CHECK ((escopo_campus = ANY (ARRAY['isolado'::text, 'compartilhado'::text])));
ALTER TABLE modulos ADD CONSTRAINT modulos_nome_key UNIQUE (nome);
ALTER TABLE modulos ADD CONSTRAINT modulos_pkey PRIMARY KEY (id);
ALTER TABLE cultos ADD CONSTRAINT cultos_decisoes_kids_check CHECK ((decisoes_kids >= 0));
ALTER TABLE cultos ADD CONSTRAINT cultos_decisoes_online_check CHECK ((decisoes_online >= 0));
ALTER TABLE cultos ADD CONSTRAINT cultos_decisoes_presenciais_check CHECK ((decisoes_presenciais >= 0));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_ddus_check CHECK ((online_ddus >= 0));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_ds_check CHECK ((online_ds >= 0));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_pico_check CHECK ((online_pico >= 0));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_retencao_pct_ddus_check CHECK (((online_retencao_pct_ddus IS NULL) OR ((online_retencao_pct_ddus >= (0)::numeric) AND (online_retencao_pct_ddus <= (100)::numeric))));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_retencao_pct_ds_check CHECK (((online_retencao_pct_ds IS NULL) OR ((online_retencao_pct_ds >= (0)::numeric) AND (online_retencao_pct_ds <= (100)::numeric))));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_subs_ganhos_check CHECK (((online_subs_ganhos IS NULL) OR (online_subs_ganhos >= 0)));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_subs_perdidos_check CHECK (((online_subs_perdidos IS NULL) OR (online_subs_perdidos >= 0)));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_views_inscritos_check CHECK (((online_views_inscritos IS NULL) OR (online_views_inscritos >= 0)));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_views_nao_inscritos_check CHECK (((online_views_nao_inscritos IS NULL) OR (online_views_nao_inscritos >= 0)));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_watch_minutes_ddus_check CHECK (((online_watch_minutes_ddus IS NULL) OR (online_watch_minutes_ddus >= 0)));
ALTER TABLE cultos ADD CONSTRAINT cultos_online_watch_minutes_ds_check CHECK (((online_watch_minutes_ds IS NULL) OR (online_watch_minutes_ds >= 0)));
ALTER TABLE cultos ADD CONSTRAINT cultos_pkey PRIMARY KEY (id);
ALTER TABLE cultos ADD CONSTRAINT cultos_presencial_adulto_check CHECK ((presencial_adulto >= 0));
ALTER TABLE cultos ADD CONSTRAINT cultos_presencial_kids_check CHECK ((presencial_kids >= 0));
ALTER TABLE cultos ADD CONSTRAINT uniq_culto_service_data UNIQUE (service_type_id, data);
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT chk_pedido_um_solicitante CHECK ((((membro_id IS NOT NULL) AND (cadastro_pendente_id IS NULL)) OR ((membro_id IS NULL) AND (cadastro_pendente_id IS NOT NULL))));
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_origem_check CHECK ((origem = ANY (ARRAY['cadastro_interno'::text, 'formulario_publico'::text, 'manual'::text, 'app'::text, 'totem'::text, 'mapa'::text])));
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'devolvido'::text, 'encaminhado'::text, 'aprovado'::text, 'rejeitado'::text, 'cancelado'::text, 'sem_contato'::text])));
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_direcionamento_check CHECK (((direcionamento IS NULL) OR (direcionamento = ANY (ARRAY['grupos'::text, 'devocionais'::text, 'voluntarios'::text, 'next'::text, 'batismo'::text]))));
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_encontro_status_check CHECK ((encontro_status = ANY (ARRAY['agendado'::text, 'realizado'::text, 'faltou'::text, 'cancelado'::text])));
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_next_resolucao_check CHECK (((next_resolucao IS NULL) OR (next_resolucao = ANY (ARRAY['contatado'::text, 'sem_interesse'::text, 'ja_fez_fora'::text, 'encerrado'::text]))));
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_pkey PRIMARY KEY (id);
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_primeiro_contato_status_check CHECK (((primeiro_contato_status IS NULL) OR (primeiro_contato_status = ANY (ARRAY['contato_impossivel'::text, 'contactada'::text, 'respondeu'::text, 'atendido'::text, 'atendido_respondido'::text, 'nao_respondeu'::text, 'nao_compareceu'::text, 'nao_atendido'::text, 'sem_retorno'::text, 'numero_errado'::text]))));
ALTER TABLE mem_grupo_pedido_eventos ADD CONSTRAINT mem_grupo_pedido_eventos_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupos ADD CONSTRAINT chk_mem_grupos_modo_inscricao CHECK ((modo_inscricao = ANY (ARRAY['fechado'::text, 'temporada'::text, 'sempre_aberto'::text])));
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_area_check CHECK ((area = ANY (ARRAY['ami'::text, 'bridge'::text, 'sede'::text, 'online'::text])));
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)));
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_idade_range_check CHECK ((((idade_min IS NULL) OR ((idade_min >= 0) AND (idade_min <= 120))) AND ((idade_max IS NULL) OR ((idade_max >= 0) AND (idade_max <= 120))) AND ((idade_min IS NULL) OR (idade_max IS NULL) OR (idade_min <= idade_max))));
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_pkey PRIMARY KEY (id);
ALTER TABLE cui_j180_turmas ADD CONSTRAINT cui_j180_turmas_area_check CHECK ((area = ANY (ARRAY['ami'::text, 'sede'::text, 'online'::text])));
ALTER TABLE cui_j180_turmas ADD CONSTRAINT cui_j180_turmas_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6)));
ALTER TABLE cui_j180_turmas ADD CONSTRAINT cui_j180_turmas_pkey PRIMARY KEY (id);
ALTER TABLE cui_j180_turma_membros ADD CONSTRAINT cui_j180_turma_membros_pkey PRIMARY KEY (id);
ALTER TABLE cui_j180_encontros ADD CONSTRAINT cui_j180_encontros_pkey PRIMARY KEY (id);
ALTER TABLE cui_j180_encontro_presencas ADD CONSTRAINT cui_j180_encontro_presencas_encontro_id_turma_membro_id_key UNIQUE (encontro_id, turma_membro_id);
ALTER TABLE cui_j180_encontro_presencas ADD CONSTRAINT cui_j180_encontro_presencas_pkey PRIMARY KEY (id);
ALTER TABLE mem_cadastros_pendentes ADD CONSTRAINT mem_cadastros_pendentes_origem_check CHECK ((origem = ANY ('{evento,importacao,qr_code,site,online}'::text[])));
ALTER TABLE mem_cadastros_pendentes ADD CONSTRAINT mem_cadastros_pendentes_pkey PRIMARY KEY (id);
ALTER TABLE mem_cadastros_pendentes ADD CONSTRAINT mem_cadastros_pendentes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text, 'duplicado'::text, 'aplicado'::text])));
ALTER TABLE mem_cadastros_pendentes ADD CONSTRAINT mem_cadastros_pendentes_vinculo_declarado_check CHECK (((vinculo_declarado IS NULL) OR (vinculo_declarado = ANY (ARRAY['membro'::text, 'congregado'::text, 'visitante'::text]))));
ALTER TABLE next_encontros ADD CONSTRAINT next_encontros_numero_check CHECK (((numero >= 1) AND (numero <= 6)));
ALTER TABLE next_encontros ADD CONSTRAINT next_encontros_pkey PRIMARY KEY (id);
ALTER TABLE next_encontros ADD CONSTRAINT next_encontros_turma_id_numero_key UNIQUE (turma_id, numero);
ALTER TABLE batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_area_kpi_check CHECK ((area_kpi = ANY (ARRAY['kids'::text, 'sede'::text, 'bridge'::text, 'ami'::text, 'online'::text])));
ALTER TABLE batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_categoria_etaria_check CHECK (((categoria_etaria IS NULL) OR (categoria_etaria = ANY (ARRAY['crianca'::text, 'adolescente'::text, 'jovem'::text, 'adulto'::text]))));
ALTER TABLE batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_origem_check CHECK ((origem = ANY (ARRAY['totem'::text, 'manual'::text, 'publico'::text, 'app'::text, 'next'::text])));
ALTER TABLE batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_pkey PRIMARY KEY (id);
ALTER TABLE batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'realizado'::text, 'cancelado'::text])));
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_canal_check CHECK ((canal = ANY (ARRAY['app'::text, 'whatsapp'::text, 'plataforma'::text, 'manual'::text])));
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_pkey PRIMARY KEY (id);
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'concluido'::text])));
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_tipo_check CHECK ((tipo = ANY (ARRAY['aconselhamento'::text, 'capelania'::text, 'oracao'::text, 'sos'::text, 'visita'::text, 'outro'::text])));
ALTER TABLE mem_grupo_renovacoes ADD CONSTRAINT mem_grupo_renovacoes_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_renovacoes ADD CONSTRAINT mem_grupo_renovacoes_status_check CHECK ((status = ANY (ARRAY['enviada'::text, 'continua'::text, 'nao_continua'::text, 'triada'::text])));
ALTER TABLE mem_grupo_renovacoes ADD CONSTRAINT mem_grupo_renovacoes_triagem_acao_check CHECK ((triagem_acao = ANY (ARRAY['fechar_grupo'::text, 'buscar_lider'::text, 'manter'::text])));
ALTER TABLE mem_grupo_renovacoes ADD CONSTRAINT uniq_mem_grupo_renovacoes_grupo_temporada UNIQUE (grupo_id, temporada_id);
ALTER TABLE cui_visitas ADD CONSTRAINT cui_visitas_pkey PRIMARY KEY (id);
ALTER TABLE cui_visitas ADD CONSTRAINT cui_visitas_status_check CHECK ((status = ANY (ARRAY['agendada'::text, 'realizada'::text, 'cancelada'::text])));
ALTER TABLE cui_visitas ADD CONSTRAINT cui_visitas_tipo_check CHECK ((tipo = ANY (ARRAY['visita_domiciliar'::text, 'visita_hospitalar'::text, 'funeral'::text, 'casamento'::text, 'aconselhamento'::text, 'outro'::text])));
ALTER TABLE inscricoes ADD CONSTRAINT chk_inscricoes_bolsa CHECK ((((bolsa_tipo IS NULL) AND (bolsa_motivo IS NULL)) OR ((bolsa_tipo = 'integral'::text) AND (valor_cobrado_centavos = 0) AND (bolsa_motivo IS NOT NULL) AND (length(btrim(bolsa_motivo)) >= 3)) OR ((bolsa_tipo = 'parcial'::text) AND (valor_cobrado_centavos > 0) AND (bolsa_motivo IS NOT NULL) AND (length(btrim(bolsa_motivo)) >= 3))));
ALTER TABLE inscricoes ADD CONSTRAINT chk_inscricoes_contrato CHECK (((legado_fonte IS NOT NULL) OR ((telefone IS NOT NULL) AND (cpf IS NOT NULL) AND (email IS NOT NULL) AND (data_nascimento IS NOT NULL) AND (sexo IS NOT NULL))));
ALTER TABLE inscricoes ADD CONSTRAINT chk_inscricoes_responsavel_cpf_digits CHECK (((responsavel_cpf IS NULL) OR (responsavel_cpf ~ '^[0-9]{11}$'::text)));
ALTER TABLE inscricoes ADD CONSTRAINT chk_inscricoes_valor_cobrado CHECK (((valor_cobrado_centavos IS NULL) OR (valor_cobrado_centavos >= 0)));
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_codigo_key UNIQUE (codigo);
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_pkey PRIMARY KEY (id);
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_sexo_check CHECK (((sexo IS NULL) OR (sexo = ANY (ARRAY['masculino'::text, 'feminino'::text]))));
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_status_check CHECK ((status = ANY (ARRAY['recebida'::text, 'confirmada'::text, 'cancelada'::text])));
ALTER TABLE profiles ADD CONSTRAINT profiles_ministerio_papel_check CHECK (((ministerio_papel IS NULL) OR (ministerio_papel = ANY (ARRAY['lider'::text, 'assistente'::text]))));
ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['assistente'::text, 'admin'::text, 'diretor'::text])));
ALTER TABLE mem_grupo_agenda_excecoes ADD CONSTRAINT chk_agenda_excecao_coerente CHECK ((((status = 'remarcado'::text) AND (nova_data IS NOT NULL)) OR ((status = 'cancelado'::text) AND (nova_data IS NULL) AND (novo_horario IS NULL))));
ALTER TABLE mem_grupo_agenda_excecoes ADD CONSTRAINT mem_grupo_agenda_excecoes_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_agenda_excecoes ADD CONSTRAINT mem_grupo_agenda_excecoes_status_check CHECK ((status = ANY (ARRAY['cancelado'::text, 'remarcado'::text])));
ALTER TABLE mem_grupo_conferencias ADD CONSTRAINT mem_grupo_conferencias_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_conferencias ADD CONSTRAINT mem_grupo_conferencias_status_check CHECK ((status = ANY (ARRAY['enviada'::text, 'respondida'::text, 'triada'::text])));
ALTER TABLE nsm_eventos ADD CONSTRAINT chk_pessoa_identificada CHECK (((membro_id IS NOT NULL) OR (visitante_id IS NOT NULL) OR (cpf IS NOT NULL)));
ALTER TABLE nsm_eventos ADD CONSTRAINT nsm_eventos_pkey PRIMARY KEY (id);
ALTER TABLE nsm_eventos ADD CONSTRAINT nsm_eventos_valor_engajado_check CHECK ((valor_engajado = ANY (ARRAY['seguir'::text, 'conectar'::text, 'investir'::text, 'servir'::text, 'generosidade'::text])));
ALTER TABLE cui_primeiro_contato_fila ADD CONSTRAINT cui_pcf_um_por_convertido UNIQUE (convertido_id);
ALTER TABLE cui_primeiro_contato_fila ADD CONSTRAINT cui_primeiro_contato_fila_pkey PRIMARY KEY (id);
ALTER TABLE cui_primeiro_contato_fila ADD CONSTRAINT cui_primeiro_contato_fila_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'contato_feito'::text, 'ignorado'::text, 'expirado'::text])));
ALTER TABLE igrejas ADD CONSTRAINT igrejas_pkey PRIMARY KEY (id);
ALTER TABLE igrejas ADD CONSTRAINT igrejas_slug_key UNIQUE (slug);
ALTER TABLE igrejas ADD CONSTRAINT igrejas_tipo_check CHECK ((tipo = ANY (ARRAY['sede'::text, 'online'::text, 'cba_acompanhada'::text])));
ALTER TABLE cui_batismo_next_fila ADD CONSTRAINT cui_batismo_next_fila_pkey PRIMARY KEY (id);
ALTER TABLE cui_batismo_next_fila ADD CONSTRAINT cui_batismo_next_fila_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'contato_feito'::text, 'ignorado'::text, 'expirado'::text])));
ALTER TABLE cui_batismo_next_fila ADD CONSTRAINT cui_bnf_um_por_convertido UNIQUE (convertido_id);
ALTER TABLE mem_historico ADD CONSTRAINT mem_historico_pkey PRIMARY KEY (id);
ALTER TABLE mem_historico ADD CONSTRAINT mem_historico_tipo_check CHECK ((tipo = ANY (ARRAY['visita'::text, 'decisao'::text, 'batismo'::text, 'membresia'::text, 'transferencia'::text, 'cuidado'::text, 'outro'::text])));
ALTER TABLE mem_grupo_encontros ADD CONSTRAINT mem_grupo_encontros_grupo_id_data_key UNIQUE (grupo_id, data);
ALTER TABLE mem_grupo_encontros ADD CONSTRAINT mem_grupo_encontros_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_encontro_presencas ADD CONSTRAINT mem_grupo_encontro_presencas_encontro_id_membro_id_key UNIQUE (encontro_id, membro_id);
ALTER TABLE mem_grupo_encontro_presencas ADD CONSTRAINT mem_grupo_encontro_presencas_pkey PRIMARY KEY (id);
ALTER TABLE next_indicacoes ADD CONSTRAINT next_indicacoes_inscricao_id_tipo_key UNIQUE (inscricao_id, tipo);
ALTER TABLE next_indicacoes ADD CONSTRAINT next_indicacoes_pkey PRIMARY KEY (id);
ALTER TABLE next_indicacoes ADD CONSTRAINT next_indicacoes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'concluido'::text, 'cancelado'::text])));
ALTER TABLE next_indicacoes ADD CONSTRAINT next_indicacoes_tipo_check CHECK ((tipo = ANY (ARRAY['batismo'::text, 'servir'::text, 'grupo'::text, 'dizimo'::text])));
ALTER TABLE next_eventos ADD CONSTRAINT next_eventos_data_key UNIQUE (data);
ALTER TABLE next_eventos ADD CONSTRAINT next_eventos_pkey PRIMARY KEY (id);
ALTER TABLE next_eventos ADD CONSTRAINT next_eventos_status_check CHECK ((status = ANY (ARRAY['agendado'::text, 'realizado'::text, 'cancelado'::text])));
ALTER TABLE cui_jornada180 ADD CONSTRAINT cui_jornada180_pkey PRIMARY KEY (id);
ALTER TABLE mem_temporadas ADD CONSTRAINT mem_temporadas_numero_check CHECK ((numero = ANY (ARRAY[1, 2])));
ALTER TABLE mem_temporadas ADD CONSTRAINT mem_temporadas_pkey PRIMARY KEY (id);
ALTER TABLE app_audit_log ADD CONSTRAINT app_audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE app_audit_log ADD CONSTRAINT app_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE mem_contatos ADD CONSTRAINT mem_contatos_pkey PRIMARY KEY (id);
ALTER TABLE mem_contatos ADD CONSTRAINT mem_contatos_tipo_check CHECK ((tipo = ANY (ARRAY['telefone'::text, 'email'::text])));
ALTER TABLE mem_temporada_consolidado ADD CONSTRAINT mem_temporada_consolidado_pkey PRIMARY KEY (id);
ALTER TABLE mem_temporada_consolidado ADD CONSTRAINT mem_temporada_consolidado_temporada_key UNIQUE (temporada);
ALTER TABLE usuario_igrejas ADD CONSTRAINT usuario_igrejas_pkey PRIMARY KEY (usuario_id, igreja_id);
ALTER TABLE app_super_admins ADD CONSTRAINT app_super_admins_email_key UNIQUE (email);
ALTER TABLE app_super_admins ADD CONSTRAINT app_super_admins_pkey PRIMARY KEY (id);
ALTER TABLE cui_acompanhamentos ADD CONSTRAINT cui_acompanhamentos_pkey PRIMARY KEY (id);
ALTER TABLE cui_acompanhamentos ADD CONSTRAINT cui_acompanhamentos_tipo_check CHECK ((tipo = ANY (ARRAY['aconselhamento'::text, 'capelania'::text])));
ALTER TABLE cui_atendimento_comentarios ADD CONSTRAINT cui_atendimento_comentarios_pkey PRIMARY KEY (id);
ALTER TABLE cui_atendimento_comentarios ADD CONSTRAINT cui_atendimento_comentarios_ref_tipo_check CHECK ((ref_tipo = ANY (ARRAY['visita'::text, 'acompanhamento'::text])));
ALTER TABLE next_matriculas ADD CONSTRAINT chk_next_mat_sexo CHECK (((sexo IS NULL) OR (sexo = ANY (ARRAY['masculino'::text, 'feminino'::text]))));
ALTER TABLE next_matriculas ADD CONSTRAINT next_matriculas_origem_check CHECK ((origem = ANY (ARRAY['formulario'::text, 'manual'::text, 'totem'::text, 'app'::text])));
ALTER TABLE next_matriculas ADD CONSTRAINT next_matriculas_pkey PRIMARY KEY (id);
ALTER TABLE next_matriculas ADD CONSTRAINT next_matriculas_status_check CHECK ((status = ANY (ARRAY['matriculado'::text, 'formado'::text, 'incompleto'::text, 'desistiu'::text])));
ALTER TABLE next_presencas ADD CONSTRAINT next_presencas_encontro_id_matricula_id_key UNIQUE (encontro_id, matricula_id);
ALTER TABLE next_presencas ADD CONSTRAINT next_presencas_pkey PRIMARY KEY (id);
ALTER TABLE next_turmas ADD CONSTRAINT next_turmas_pkey PRIMARY KEY (id);
ALTER TABLE next_turmas ADD CONSTRAINT next_turmas_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'encerrada'::text, 'cancelada'::text])));
ALTER TABLE identidade_pendencias ADD CONSTRAINT identidade_pendencias_pkey PRIMARY KEY (id);
ALTER TABLE identidade_pendencias ADD CONSTRAINT identidade_pendencias_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'resolvida'::text, 'descartada'::text])));
ALTER TABLE identidade_pendencias ADD CONSTRAINT identidade_pendencias_tipo_check CHECK ((tipo = ANY (ARRAY['cpf_conflito'::text, 'cpf_divergente'::text, 'vinculo_divergente'::text, 'cpf_para_confirmar'::text, 'inscricao_sem_vinculo'::text])));
ALTER TABLE batismo_horarios ADD CONSTRAINT batismo_horarios_pkey PRIMARY KEY (id);
ALTER TABLE vol_service_types ADD CONSTRAINT vol_service_types_capacidade_pos CHECK (((capacidade_lugares IS NULL) OR ((capacidade_lugares > 0) AND (capacidade_lugares <= 20000))));
ALTER TABLE vol_service_types ADD CONSTRAINT vol_service_types_name_unique UNIQUE (name);
ALTER TABLE vol_service_types ADD CONSTRAINT vol_service_types_pkey PRIMARY KEY (id);
ALTER TABLE vol_service_types ADD CONSTRAINT vol_service_types_recurrence_day_check CHECK (((recurrence_day >= 0) AND (recurrence_day <= 6)));
ALTER TABLE mem_grupo_transferencias ADD CONSTRAINT chk_grupo_transf_coerente CHECK ((((status = 'pendente'::text) AND (resolvido_em IS NULL)) OR ((status <> 'pendente'::text) AND (resolvido_em IS NOT NULL))));
ALTER TABLE mem_grupo_transferencias ADD CONSTRAINT mem_grupo_transferencias_pkey PRIMARY KEY (id);
ALTER TABLE mem_grupo_transferencias ADD CONSTRAINT mem_grupo_transferencias_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'concluida'::text, 'recusada'::text])));
ALTER TABLE mem_membros ADD CONSTRAINT mem_membros_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE mem_trilha_valores ADD CONSTRAINT mem_trilha_valores_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_link ADD CONSTRAINT mem_grupo_link_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_link ADD CONSTRAINT mem_grupo_link_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_membros ADD CONSTRAINT mem_grupo_membros_conferencia_id_fkey FOREIGN KEY (conferencia_id) REFERENCES mem_grupo_conferencias(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_membros ADD CONSTRAINT mem_grupo_membros_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_membros ADD CONSTRAINT mem_grupo_membros_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_membros ADD CONSTRAINT mem_grupo_membros_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_membros ADD CONSTRAINT mem_grupo_membros_renovacao_id_fkey FOREIGN KEY (renovacao_id) REFERENCES mem_grupo_renovacoes(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_documentos ADD CONSTRAINT mem_grupo_documentos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_documentos ADD CONSTRAINT mem_grupo_documentos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vol_profiles ADD CONSTRAINT vol_profiles_membresia_id_fkey FOREIGN KEY (membresia_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE grupo_supervisao_visitas ADD CONSTRAINT grupo_supervisao_visitas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE grupo_supervisao_visitas ADD CONSTRAINT grupo_supervisao_visitas_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE grupo_supervisao_visitas ADD CONSTRAINT grupo_supervisao_visitas_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES mem_membros(id);
ALTER TABLE grupo_supervisao_observacoes ADD CONSTRAINT grupo_supervisao_observacoes_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE grupo_supervisao_observacoes ADD CONSTRAINT grupo_supervisao_observacoes_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES mem_membros(id);
ALTER TABLE next_inscricoes ADD CONSTRAINT next_inscricoes_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES next_eventos(id) ON DELETE SET NULL;
ALTER TABLE next_inscricoes ADD CONSTRAINT next_inscricoes_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE next_inscricoes ADD CONSTRAINT next_inscricoes_membro_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE next_inscricoes ADD CONSTRAINT next_inscricoes_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES cultos(id) ON DELETE SET NULL;
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE cultos ADD CONSTRAINT cultos_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES vol_service_types(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_cadastro_pendente_id_fkey FOREIGN KEY (cadastro_pendente_id) REFERENCES mem_cadastros_pendentes(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_casal_pedido_id_fkey FOREIGN KEY (casal_pedido_id) REFERENCES mem_grupo_pedidos(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE CASCADE;
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_culto_fk FOREIGN KEY (culto_id) REFERENCES cultos(id) ON DELETE SET NULL;
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE cui_convertidos ADD CONSTRAINT cui_convertidos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_pedido_eventos ADD CONSTRAINT mem_grupo_pedido_eventos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES mem_grupo_pedidos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_grupo_origem_id_fkey FOREIGN KEY (grupo_origem_id) REFERENCES mem_grupos(id) ON DELETE SET NULL;
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_grupos ADD CONSTRAINT mem_grupos_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cui_j180_turmas ADD CONSTRAINT cui_j180_turmas_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cui_j180_turma_membros ADD CONSTRAINT cui_j180_turma_membros_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cui_j180_turma_membros ADD CONSTRAINT cui_j180_turma_membros_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES cui_j180_turmas(id) ON DELETE CASCADE;
ALTER TABLE cui_j180_encontros ADD CONSTRAINT cui_j180_encontros_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES cui_j180_turmas(id) ON DELETE CASCADE;
ALTER TABLE cui_j180_encontro_presencas ADD CONSTRAINT cui_j180_encontro_presencas_encontro_id_fkey FOREIGN KEY (encontro_id) REFERENCES cui_j180_encontros(id) ON DELETE CASCADE;
ALTER TABLE cui_j180_encontro_presencas ADD CONSTRAINT cui_j180_encontro_presencas_turma_membro_id_fkey FOREIGN KEY (turma_membro_id) REFERENCES cui_j180_turma_membros(id) ON DELETE CASCADE;
ALTER TABLE mem_cadastros_pendentes ADD CONSTRAINT mem_cadastros_pendentes_duplicado_de_id_fkey FOREIGN KEY (duplicado_de_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_cadastros_pendentes ADD CONSTRAINT mem_cadastros_pendentes_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE next_encontros ADD CONSTRAINT next_encontros_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES next_turmas(id) ON DELETE CASCADE;
ALTER TABLE batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_atribuido_a_fkey FOREIGN KEY (atribuido_a) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cui_pedidos ADD CONSTRAINT cui_pedidos_tratado_por_fkey FOREIGN KEY (tratado_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_renovacoes ADD CONSTRAINT mem_grupo_renovacoes_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_renovacoes ADD CONSTRAINT mem_grupo_renovacoes_lider_membro_id_fkey FOREIGN KEY (lider_membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_renovacoes ADD CONSTRAINT mem_grupo_renovacoes_temporada_id_fkey FOREIGN KEY (temporada_id) REFERENCES mem_temporadas(id) ON DELETE CASCADE;
ALTER TABLE cui_visitas ADD CONSTRAINT cui_visitas_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_bolsa_por_fkey FOREIGN KEY (bolsa_por) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE inscricoes ADD CONSTRAINT inscricoes_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id);
ALTER TABLE mem_grupo_agenda_excecoes ADD CONSTRAINT mem_grupo_agenda_excecoes_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_conferencias ADD CONSTRAINT mem_grupo_conferencias_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_conferencias ADD CONSTRAINT mem_grupo_conferencias_lider_membro_id_fkey FOREIGN KEY (lider_membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_conferencias ADD CONSTRAINT mem_grupo_conferencias_temporada_id_fkey FOREIGN KEY (temporada_id) REFERENCES mem_temporadas(id) ON DELETE SET NULL;
ALTER TABLE nsm_eventos ADD CONSTRAINT nsm_eventos_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE nsm_eventos ADD CONSTRAINT nsm_eventos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cui_primeiro_contato_fila ADD CONSTRAINT cui_primeiro_contato_fila_convertido_id_fkey FOREIGN KEY (convertido_id) REFERENCES cui_convertidos(id) ON DELETE CASCADE;
ALTER TABLE cui_primeiro_contato_fila ADD CONSTRAINT cui_primeiro_contato_fila_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE cui_batismo_next_fila ADD CONSTRAINT cui_batismo_next_fila_convertido_id_fkey FOREIGN KEY (convertido_id) REFERENCES cui_convertidos(id) ON DELETE CASCADE;
ALTER TABLE cui_batismo_next_fila ADD CONSTRAINT cui_batismo_next_fila_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE mem_historico ADD CONSTRAINT mem_historico_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_historico ADD CONSTRAINT mem_historico_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES profiles(id);
ALTER TABLE mem_grupo_encontros ADD CONSTRAINT mem_grupo_encontros_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_encontro_presencas ADD CONSTRAINT mem_grupo_encontro_presencas_encontro_id_fkey FOREIGN KEY (encontro_id) REFERENCES mem_grupo_encontros(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_encontro_presencas ADD CONSTRAINT mem_grupo_encontro_presencas_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE next_indicacoes ADD CONSTRAINT next_indicacoes_inscricao_id_fkey FOREIGN KEY (inscricao_id) REFERENCES next_inscricoes(id) ON DELETE CASCADE;
ALTER TABLE cui_jornada180 ADD CONSTRAINT cui_jornada180_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE cui_jornada180 ADD CONSTRAINT cui_jornada180_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_contatos ADD CONSTRAINT mem_contatos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE CASCADE;
ALTER TABLE usuario_igrejas ADD CONSTRAINT usuario_igrejas_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE CASCADE;
ALTER TABLE usuario_igrejas ADD CONSTRAINT usuario_igrejas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE cui_acompanhamentos ADD CONSTRAINT cui_acompanhamentos_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE cui_acompanhamentos ADD CONSTRAINT cui_acompanhamentos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE cui_atendimento_comentarios ADD CONSTRAINT cui_atendimento_comentarios_autor_id_fkey FOREIGN KEY (autor_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE next_matriculas ADD CONSTRAINT next_matriculas_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE next_matriculas ADD CONSTRAINT next_matriculas_origem_inscricao_id_fkey FOREIGN KEY (origem_inscricao_id) REFERENCES next_inscricoes(id) ON DELETE SET NULL;
ALTER TABLE next_matriculas ADD CONSTRAINT next_matriculas_turma_id_fkey FOREIGN KEY (turma_id) REFERENCES next_turmas(id) ON DELETE SET NULL;
ALTER TABLE next_presencas ADD CONSTRAINT next_presencas_encontro_id_fkey FOREIGN KEY (encontro_id) REFERENCES next_encontros(id) ON DELETE CASCADE;
ALTER TABLE next_presencas ADD CONSTRAINT next_presencas_matricula_id_fkey FOREIGN KEY (matricula_id) REFERENCES next_matriculas(id) ON DELETE CASCADE;
ALTER TABLE next_turmas ADD CONSTRAINT next_turmas_origem_evento_id_fkey FOREIGN KEY (origem_evento_id) REFERENCES next_eventos(id) ON DELETE SET NULL;
ALTER TABLE identidade_pendencias ADD CONSTRAINT identidade_pendencias_membro_conflito_id_fkey FOREIGN KEY (membro_conflito_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE identidade_pendencias ADD CONSTRAINT identidade_pendencias_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_transferencias ADD CONSTRAINT mem_grupo_transferencias_grupo_destino_id_fkey FOREIGN KEY (grupo_destino_id) REFERENCES mem_grupos(id) ON DELETE SET NULL;
ALTER TABLE mem_grupo_transferencias ADD CONSTRAINT mem_grupo_transferencias_grupo_origem_id_fkey FOREIGN KEY (grupo_origem_id) REFERENCES mem_grupos(id) ON DELETE CASCADE;
ALTER TABLE mem_grupo_transferencias ADD CONSTRAINT mem_grupo_transferencias_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.fn_nome_norm(p_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT lower(public.unaccent('public.unaccent', p_nome))
$function$
;
CREATE INDEX idx_app_audit_log_table_row ON public.app_audit_log USING btree (table_name, row_id, created_at DESC);
CREATE INDEX idx_app_audit_log_user ON public.app_audit_log USING btree (user_id, created_at DESC);
CREATE INDEX idx_app_audit_log_created ON public.app_audit_log USING btree (created_at DESC);
CREATE UNIQUE INDEX uq_batismo_horarios_horario ON public.batismo_horarios USING btree (horario) WHERE (deleted_at IS NULL);
CREATE INDEX idx_batismo_status ON public.batismo_inscricoes USING btree (status);
CREATE INDEX idx_batismo_cpf ON public.batismo_inscricoes USING btree (cpf);
CREATE INDEX idx_batismo_categoria ON public.batismo_inscricoes USING btree (categoria_etaria);
CREATE INDEX idx_batismo_deficiencia ON public.batismo_inscricoes USING btree (possui_deficiencia) WHERE (possui_deficiencia = true);
CREATE INDEX idx_batismo_inscricoes_active ON public.batismo_inscricoes USING btree (id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX uq_batismo_codigo_acesso ON public.batismo_inscricoes USING btree (codigo_acesso) WHERE (codigo_acesso IS NOT NULL);
CREATE INDEX idx_batismo_inscricoes_igreja ON public.batismo_inscricoes USING btree (igreja_id);
CREATE INDEX idx_batismo_inscricoes_membro ON public.batismo_inscricoes USING btree (membro_id) WHERE (membro_id IS NOT NULL);
CREATE INDEX idx_cui_acomp_status ON public.cui_acompanhamentos USING btree (status);
CREATE INDEX idx_cui_acomp_membro ON public.cui_acompanhamentos USING btree (membro_id);
CREATE INDEX idx_cui_acomp_resp ON public.cui_acompanhamentos USING btree (responsavel_id);
CREATE INDEX idx_cui_acomp_agenda ON public.cui_acompanhamentos USING btree (agendamento_data) WHERE ((agendamento_data IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_cui_acompanhamentos_igreja ON public.cui_acompanhamentos USING btree (igreja_id);
CREATE INDEX idx_cui_atend_coment_ref ON public.cui_atendimento_comentarios USING btree (ref_tipo, ref_id, created_at) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_bnf_pendente ON public.cui_batismo_next_fila USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_bnf_area ON public.cui_batismo_next_fila USING btree (area, status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_conv_data ON public.cui_convertidos USING btree (data_culto);
CREATE INDEX idx_cui_conv_membro ON public.cui_convertidos USING btree (membro_id);
CREATE INDEX idx_cui_conv_encontro ON public.cui_convertidos USING btree (encontro_marcado, data_encontro);
CREATE INDEX idx_cui_conv_tags ON public.cui_convertidos USING gin (tags);
CREATE INDEX idx_cui_conv_area ON public.cui_convertidos USING btree (area) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_convertidos_igreja ON public.cui_convertidos USING btree (igreja_id);
CREATE INDEX idx_cui_j180_presencas_encontro ON public.cui_j180_encontro_presencas USING btree (encontro_id);
CREATE INDEX idx_cui_j180_encontros_turma_data ON public.cui_j180_encontros USING btree (turma_id, data DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_j180_turma_membros_turma ON public.cui_j180_turma_membros USING btree (turma_id) WHERE (saiu_em IS NULL);
CREATE INDEX idx_cui_j180_turmas_ativa ON public.cui_j180_turmas USING btree (area) WHERE ((deleted_at IS NULL) AND (ativo = true));
CREATE INDEX idx_cui_jor_data ON public.cui_jornada180 USING btree (data_encontro);
CREATE INDEX idx_cui_jor_membro ON public.cui_jornada180 USING btree (membro_id);
CREATE INDEX idx_cui_jornada180_igreja ON public.cui_jornada180 USING btree (igreja_id);
CREATE INDEX idx_cui_pedidos_fila ON public.cui_pedidos USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_pcf_pendente ON public.cui_primeiro_contato_fila USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_pcf_area ON public.cui_primeiro_contato_fila USING btree (area, status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cui_visitas_data ON public.cui_visitas USING btree (data_visita DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cultos_data ON public.cultos USING btree (data DESC);
CREATE INDEX idx_cultos_service_type ON public.cultos USING btree (service_type_id);
CREATE UNIQUE INDEX cultos_service_type_data_hora_uniq ON public.cultos USING btree (COALESCE(service_type_id, '00000000-0000-0000-0000-000000000000'::uuid), data, hora);
CREATE INDEX idx_cultos_active ON public.cultos USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cultos_dec_pessoas_membro ON public.cultos_decisoes_pessoas USING btree (membro_id);
CREATE INDEX idx_cultos_dec_pessoas_status ON public.cultos_decisoes_pessoas USING btree (status_followup, registrado_em DESC);
CREATE INDEX idx_cultos_dec_pessoas_data ON public.cultos_decisoes_pessoas USING btree (registrado_em DESC);
CREATE INDEX idx_cultos_dec_pessoas_data_nasc ON public.cultos_decisoes_pessoas USING btree (data_nascimento) WHERE (data_nascimento IS NOT NULL);
CREATE INDEX idx_cultos_dec_pessoas_culto ON public.cultos_decisoes_pessoas USING btree (culto_id);
CREATE INDEX idx_cultos_decisoes_pessoas_active ON public.cultos_decisoes_pessoas USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_cultos_dec_pessoas_kids_crianca ON public.cultos_decisoes_pessoas USING btree (kids_crianca_id) WHERE (kids_crianca_id IS NOT NULL);
CREATE UNIQUE INDEX uq_cdp_import_planilha_kids ON public.cultos_decisoes_pessoas USING btree (kids_crianca_id, decidiu_em, culto_id) NULLS NOT DISTINCT WHERE ((fonte = 'importacao_planilha_kids'::text) AND (deleted_at IS NULL));
CREATE INDEX idx_dado_bruto_tipo_area_data ON public.dados_brutos USING btree (tipo_id, area, data DESC);
CREATE INDEX idx_dado_bruto_data ON public.dados_brutos USING btree (data DESC);
CREATE INDEX idx_dados_brutos_validacao ON public.dados_brutos USING btree (validado_em) WHERE (validado_em IS NOT NULL);
CREATE INDEX idx_supervisao_obs_grupo ON public.grupo_supervisao_observacoes USING btree (grupo_id, periodo DESC);
CREATE INDEX idx_supervisao_visitas_grupo ON public.grupo_supervisao_visitas USING btree (grupo_id, data_visita DESC);
CREATE INDEX idx_supervisao_visitas_supervisor ON public.grupo_supervisao_visitas USING btree (supervisor_id, data_visita DESC);
CREATE INDEX idx_supervisao_visitas_agendadas ON public.grupo_supervisao_visitas USING btree (data_visita) WHERE (status = 'agendada'::text);
CREATE UNIQUE INDEX uniq_identidade_pendencia_aberta ON public.identidade_pendencias USING btree (tipo, membro_id, membro_conflito_id) NULLS NOT DISTINCT WHERE ((status = 'pendente'::text) AND (tipo <> 'inscricao_sem_vinculo'::text));
CREATE UNIQUE INDEX uniq_identidade_pendencia_insc_orfa ON public.identidade_pendencias USING btree (tipo, origem_id) WHERE ((status = 'pendente'::text) AND (tipo = 'inscricao_sem_vinculo'::text));
CREATE INDEX idx_identidade_pendencias_status ON public.identidade_pendencias USING btree (status, created_at DESC);
CREATE INDEX idx_igrejas_tipo ON public.igrejas USING btree (tipo) WHERE (ativa = true);
CREATE INDEX idx_igrejas_ativa ON public.igrejas USING btree (ativa);
CREATE INDEX idx_inscricoes_codigo ON public.inscricoes USING btree (codigo) WHERE (deleted_at IS NULL);
CREATE INDEX inscricoes_totem_estacao_idx ON public.inscricoes USING btree (totem_estacao_id) WHERE (totem_estacao_id IS NOT NULL);
CREATE UNIQUE INDEX uq_inscricoes_evento_cpf ON public.inscricoes USING btree (evento_id, cpf) WHERE ((deleted_at IS NULL) AND (cpf IS NOT NULL));
CREATE UNIQUE INDEX uq_inscricoes_evento_sorte ON public.inscricoes USING btree (evento_id, numero_sorte) WHERE ((deleted_at IS NULL) AND (numero_sorte IS NOT NULL));
CREATE INDEX idx_inscricoes_evento ON public.inscricoes USING btree (evento_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inscricoes_membro ON public.inscricoes USING btree (membro_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inscricoes_cpf ON public.inscricoes USING btree (cpf) WHERE (deleted_at IS NULL);
CREATE INDEX idx_inscricoes_created ON public.inscricoes USING btree (created_at DESC);
CREATE UNIQUE INDEX uq_inscricoes_legado ON public.inscricoes USING btree (legado_fonte, legado_ref) WHERE (legado_ref IS NOT NULL);
CREATE INDEX idx_mem_cadastros_pendentes_status ON public.mem_cadastros_pendentes USING btree (status, created_at DESC);
CREATE INDEX idx_mem_cadastros_pendentes_created ON public.mem_cadastros_pendentes USING btree (created_at DESC);
CREATE INDEX idx_mem_cadastros_pendentes_cpf ON public.mem_cadastros_pendentes USING btree (cpf) WHERE (cpf IS NOT NULL);
CREATE INDEX idx_mem_cad_pend_censo ON public.mem_cadastros_pendentes USING btree (created_at DESC) WHERE (censo = true);
CREATE UNIQUE INDEX uniq_mem_contatos_valor ON public.mem_contatos USING btree (membro_id, tipo, valor) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_contatos_lookup ON public.mem_contatos USING btree (tipo, valor) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_contatos_membro ON public.mem_contatos USING btree (membro_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX uniq_grupo_agenda_excecao ON public.mem_grupo_agenda_excecoes USING btree (grupo_id, data_original);
CREATE INDEX idx_grupo_agenda_excecoes_grupo ON public.mem_grupo_agenda_excecoes USING btree (grupo_id, data_original DESC);
CREATE UNIQUE INDEX uniq_mem_grupo_conferencias_grupo_rodada ON public.mem_grupo_conferencias USING btree (grupo_id, rodada) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_grupo_conferencias_status ON public.mem_grupo_conferencias USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_grupo_conferencias_temporada ON public.mem_grupo_conferencias USING btree (temporada_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mgd_grupo ON public.mem_grupo_documentos USING btree (grupo_id);
CREATE INDEX idx_mem_grupo_documentos_etiquetas ON public.mem_grupo_documentos USING gin (etiquetas);
CREATE INDEX idx_mem_grupo_documentos_grupos ON public.mem_grupo_documentos USING gin (grupo_ids);
CREATE INDEX idx_mem_grupo_documentos_created ON public.mem_grupo_documentos USING btree (created_at DESC);
CREATE INDEX idx_mem_grupo_encontro_presencas_encontro ON public.mem_grupo_encontro_presencas USING btree (encontro_id);
CREATE INDEX idx_mem_grupo_encontro_presencas_membro ON public.mem_grupo_encontro_presencas USING btree (membro_id);
CREATE INDEX idx_mem_grupo_encontros_grupo_data ON public.mem_grupo_encontros USING btree (grupo_id, data DESC);
CREATE INDEX idx_mem_grupo_membros_membro ON public.mem_grupo_membros USING btree (membro_id);
CREATE INDEX idx_mem_grupo_membros_grupo ON public.mem_grupo_membros USING btree (grupo_id);
CREATE INDEX idx_grupo_membros_funcao ON public.mem_grupo_membros USING btree (funcao) WHERE (saiu_em IS NULL);
CREATE INDEX idx_mem_grupo_membros_active ON public.mem_grupo_membros USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_grupo_membros_igreja ON public.mem_grupo_membros USING btree (igreja_id);
CREATE INDEX idx_mem_grupo_membros_conferencia ON public.mem_grupo_membros USING btree (conferencia_id) WHERE (conferencia_id IS NOT NULL);
CREATE INDEX idx_mem_grupo_membros_renovacao ON public.mem_grupo_membros USING btree (renovacao_id) WHERE (renovacao_id IS NOT NULL);
CREATE INDEX idx_mem_grupo_membros_historico_data ON public.mem_grupo_membros_historico USING btree (participacao_id, ocorrido_em DESC, id DESC);
CREATE INDEX idx_pedido_eventos_pedido ON public.mem_grupo_pedido_eventos USING btree (pedido_id, created_at);
CREATE INDEX idx_mem_grupo_pedidos_grupo ON public.mem_grupo_pedidos USING btree (grupo_id);
CREATE INDEX idx_mem_grupo_pedidos_membro ON public.mem_grupo_pedidos USING btree (membro_id) WHERE (membro_id IS NOT NULL);
CREATE INDEX idx_mem_grupo_pedidos_cadastro ON public.mem_grupo_pedidos USING btree (cadastro_pendente_id) WHERE (cadastro_pendente_id IS NOT NULL);
CREATE INDEX idx_mem_grupo_pedidos_status ON public.mem_grupo_pedidos USING btree (status);
CREATE UNIQUE INDEX uniq_pedido_pendente_membro ON public.mem_grupo_pedidos USING btree (grupo_id, membro_id) WHERE ((status = 'pendente'::text) AND (membro_id IS NOT NULL));
CREATE UNIQUE INDEX uniq_pedido_pendente_cadastro ON public.mem_grupo_pedidos USING btree (grupo_id, cadastro_pendente_id) WHERE ((status = 'pendente'::text) AND (cadastro_pendente_id IS NOT NULL));
CREATE INDEX idx_mem_grupo_pedidos_casal ON public.mem_grupo_pedidos USING btree (casal_pedido_id) WHERE (casal_pedido_id IS NOT NULL);
CREATE INDEX idx_mem_grupo_renovacoes_temporada ON public.mem_grupo_renovacoes USING btree (temporada_id, status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_grupo_renovacoes_grupo ON public.mem_grupo_renovacoes USING btree (grupo_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX uniq_grupo_transf_pendente ON public.mem_grupo_transferencias USING btree (membro_id, grupo_origem_id) WHERE (status = 'pendente'::text);
CREATE INDEX idx_grupo_transf_fila ON public.mem_grupo_transferencias USING btree (status, created_at DESC);
CREATE INDEX idx_grupo_transf_origem ON public.mem_grupo_transferencias USING btree (grupo_origem_id, status);
CREATE INDEX idx_mem_grupos_lider ON public.mem_grupos USING btree (lider_id) WHERE (lider_id IS NOT NULL);
CREATE INDEX idx_mem_grupos_ativo ON public.mem_grupos USING btree (ativo);
CREATE INDEX idx_mem_grupos_origem ON public.mem_grupos USING btree (grupo_origem_id) WHERE (grupo_origem_id IS NOT NULL);
CREATE INDEX idx_mem_grupos_bairro ON public.mem_grupos USING btree (bairro) WHERE (bairro IS NOT NULL);
CREATE INDEX idx_mem_grupos_temporada ON public.mem_grupos USING btree (temporada) WHERE (temporada IS NOT NULL);
CREATE INDEX idx_mem_grupos_status_temporada ON public.mem_grupos USING btree (status_temporada) WHERE (status_temporada IS NOT NULL);
CREATE UNIQUE INDEX uniq_mem_grupos_codigo ON public.mem_grupos USING btree (codigo) WHERE (codigo IS NOT NULL);
CREATE INDEX idx_mem_grupos_supervisor ON public.mem_grupos USING btree (supervisor_id) WHERE ((supervisor_id IS NOT NULL) AND (ativo = true));
CREATE INDEX idx_mem_grupos_active ON public.mem_grupos USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_mem_grupos_igreja ON public.mem_grupos USING btree (igreja_id);
CREATE INDEX idx_mem_grupos_rede ON public.mem_grupos USING btree (rede_id) WHERE (rede_id IS NOT NULL);
CREATE INDEX idx_mem_grupos_historico_data ON public.mem_grupos_historico USING btree (grupo_id, ocorrido_em DESC, id DESC);
CREATE INDEX idx_mem_historico_membro ON public.mem_historico USING btree (membro_id);
CREATE INDEX idx_mem_membros_cpf ON public.mem_membros USING btree (cpf);
CREATE INDEX idx_mem_membros_status ON public.mem_membros USING btree (status);
CREATE INDEX idx_mem_membros_familia ON public.mem_membros USING btree (familia_id);
CREATE INDEX idx_mem_membros_nome ON public.mem_membros USING btree (nome);
CREATE INDEX idx_mem_membros_active ON public.mem_membros USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX mem_membros_cnpj_idx ON public.mem_membros USING btree (cnpj) WHERE (cnpj IS NOT NULL);
CREATE UNIQUE INDEX mem_membros_cnpj_uniq ON public.mem_membros USING btree (cnpj) WHERE (cnpj IS NOT NULL);
CREATE INDEX idx_mem_membros_perfil_dizimista ON public.mem_membros USING btree (((perfil_contribuicao ->> 'eh_dizimista'::text))) WHERE (((perfil_contribuicao ->> 'eh_dizimista'::text))::boolean = true);
CREATE INDEX idx_mem_membros_perfil_ofertante ON public.mem_membros USING btree (((perfil_contribuicao ->> 'eh_ofertante'::text))) WHERE (((perfil_contribuicao ->> 'eh_ofertante'::text))::boolean = true);
CREATE INDEX idx_mem_membros_nome_norm_active ON public.mem_membros USING btree (fn_nome_norm(nome)) WHERE ((deleted_at IS NULL) AND (active = true));
CREATE INDEX idx_mem_membros_censo_pendente ON public.mem_membros USING btree (nome) WHERE ((censo_respondido_em IS NULL) AND (deleted_at IS NULL) AND (active = true));
CREATE INDEX idx_mem_membros_censo_respondido ON public.mem_membros USING btree (censo_respondido_em DESC) WHERE (censo_respondido_em IS NOT NULL);
CREATE INDEX idx_mem_membros_frequenta_area ON public.mem_membros USING btree (frequenta_area) WHERE ((frequenta_area IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_mem_membros_nome_trgm ON public.mem_membros USING gin (lower(nome) gin_trgm_ops);
CREATE UNIQUE INDEX mem_membros_planning_center_id_uidx ON public.mem_membros USING btree (planning_center_id) WHERE (planning_center_id IS NOT NULL);
CREATE UNIQUE INDEX uniq_mem_membros_cpf_ativo ON public.mem_membros USING btree (regexp_replace(cpf, '\D'::text, ''::text, 'g'::text)) WHERE ((cpf IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_mem_membros_telefone_digits ON public.mem_membros USING btree (regexp_replace(telefone, '\D'::text, ''::text, 'g'::text)) WHERE ((telefone IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_mem_membros_email_lower ON public.mem_membros USING btree (lower(TRIM(BOTH FROM email))) WHERE ((email IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_mem_membros_igreja ON public.mem_membros USING btree (igreja_id);
CREATE INDEX idx_mem_membros_inativos ON public.mem_membros USING btree (inativado_em DESC) WHERE ((status = 'inativo'::text) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX uniq_mem_temporadas_ativa ON public.mem_temporadas USING btree ((1)) WHERE (ativa = true);
CREATE INDEX idx_mem_trilha_membro ON public.mem_trilha_valores USING btree (membro_id);
CREATE INDEX idx_mem_trilha_valores_active ON public.mem_trilha_valores USING btree (id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX modulos_slug_uidx ON public.modulos USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX idx_next_encontros_turma ON public.next_encontros USING btree (turma_id);
CREATE INDEX idx_next_eventos_data ON public.next_eventos USING btree (data DESC);
CREATE INDEX idx_next_eventos_status ON public.next_eventos USING btree (status);
CREATE INDEX idx_next_indic_status ON public.next_indicacoes USING btree (status);
CREATE INDEX idx_next_indic_tipo ON public.next_indicacoes USING btree (tipo);
CREATE INDEX idx_next_indic_inscricao ON public.next_indicacoes USING btree (inscricao_id);
CREATE INDEX idx_next_inscricoes_evento ON public.next_inscricoes USING btree (evento_id);
CREATE INDEX idx_next_inscricoes_email ON public.next_inscricoes USING btree (email);
CREATE INDEX idx_next_inscricoes_cpf ON public.next_inscricoes USING btree (cpf);
CREATE INDEX idx_next_inscricoes_created ON public.next_inscricoes USING btree (created_at DESC);
CREATE INDEX idx_next_inscricoes_checkin ON public.next_inscricoes USING btree (check_in_at) WHERE (check_in_at IS NOT NULL);
CREATE UNIQUE INDEX uq_next_insc_evento_cpf ON public.next_inscricoes USING btree (evento_id, cpf) WHERE ((cpf IS NOT NULL) AND (evento_id IS NOT NULL));
CREATE UNIQUE INDEX uq_next_insc_evento_email ON public.next_inscricoes USING btree (evento_id, email) WHERE ((email IS NOT NULL) AND (evento_id IS NOT NULL));
CREATE INDEX next_inscricoes_membro_idx ON public.next_inscricoes USING btree (membro_id) WHERE (membro_id IS NOT NULL);
CREATE INDEX idx_next_insc_origem_lista ON public.next_inscricoes USING btree (origem_lista) WHERE (origem_lista IS NOT NULL);
CREATE UNIQUE INDEX uq_next_insc_evento_membro ON public.next_inscricoes USING btree (evento_id, membro_id) WHERE ((evento_id IS NOT NULL) AND (membro_id IS NOT NULL));
CREATE INDEX idx_next_inscricoes_igreja ON public.next_inscricoes USING btree (igreja_id);
CREATE INDEX idx_next_matriculas_membro ON public.next_matriculas USING btree (membro_id);
CREATE INDEX idx_next_matriculas_turma ON public.next_matriculas USING btree (turma_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_next_matriculas_created ON public.next_matriculas USING btree (created_at DESC);
CREATE INDEX idx_next_matriculas_fila ON public.next_matriculas USING btree (created_at) WHERE ((turma_id IS NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX uq_next_matriculas_turma_cpf ON public.next_matriculas USING btree (turma_id, cpf) WHERE ((cpf IS NOT NULL) AND (turma_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX uq_next_matriculas_turma_email ON public.next_matriculas USING btree (turma_id, email) WHERE ((email IS NOT NULL) AND (turma_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX uq_next_matriculas_origem_insc ON public.next_matriculas USING btree (origem_inscricao_id) WHERE (origem_inscricao_id IS NOT NULL);
CREATE UNIQUE INDEX uq_next_matriculas_origem_mes_key ON public.next_matriculas USING btree (origem_mes_key) WHERE (origem_mes_key IS NOT NULL);
CREATE UNIQUE INDEX uq_next_matriculas_espera_membro ON public.next_matriculas USING btree (membro_id) WHERE ((turma_id IS NULL) AND (deleted_at IS NULL) AND (membro_id IS NOT NULL));
CREATE INDEX idx_next_matriculas_checkin ON public.next_matriculas USING btree (check_in_at) WHERE ((check_in_at IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_next_presencas_encontro ON public.next_presencas USING btree (encontro_id);
CREATE INDEX idx_next_presencas_matricula ON public.next_presencas USING btree (matricula_id);
CREATE INDEX idx_next_turmas_status ON public.next_turmas USING btree (status) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX uq_next_turmas_origem_evento ON public.next_turmas USING btree (origem_evento_id) WHERE (origem_evento_id IS NOT NULL);
CREATE UNIQUE INDEX uq_next_turmas_origem_mes ON public.next_turmas USING btree (origem_mes) WHERE (origem_mes IS NOT NULL);
CREATE UNIQUE INDEX uq_next_turmas_auto_domingo ON public.next_turmas USING btree (auto_domingo);
CREATE INDEX idx_notificacoes_usuario ON public.notificacoes USING btree (usuario_id);
CREATE INDEX idx_notificacoes_lida ON public.notificacoes USING btree (lida);
CREATE INDEX idx_notificacoes_created ON public.notificacoes USING btree (created_at DESC);
CREATE INDEX idx_notif_usuario_lida ON public.notificacoes USING btree (usuario_id, lida);
CREATE INDEX idx_notif_modulo ON public.notificacoes USING btree (modulo);
CREATE INDEX idx_notif_dedup ON public.notificacoes USING btree (usuario_id, chave_dedup) WHERE (chave_dedup IS NOT NULL);
CREATE INDEX idx_nsm_eventos_pessoa_data ON public.nsm_eventos USING btree (membro_id, data_decisao);
CREATE INDEX idx_nsm_eventos_visitante ON public.nsm_eventos USING btree (visitante_id);
CREATE INDEX idx_nsm_eventos_cpf ON public.nsm_eventos USING btree (cpf);
CREATE INDEX idx_nsm_eventos_igreja ON public.nsm_eventos USING btree (igreja_id);
CREATE INDEX idx_nsm_eventos_janela ON public.nsm_eventos USING btree (dentro_janela_60d) WHERE (dentro_janela_60d = true);
CREATE INDEX idx_nsm_eventos_origem ON public.nsm_eventos USING btree (origem, origem_id);
CREATE UNIQUE INDEX nsm_eventos_pessoa_valor_uq ON public.nsm_eventos USING btree (COALESCE((membro_id)::text, (visitante_id)::text, cpf), valor_engajado);
CREATE INDEX idx_nsm_eventos_active ON public.nsm_eventos USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_profiles_active ON public.profiles USING btree (active);
CREATE INDEX idx_profiles_membro_id ON public.profiles USING btree (membro_id) WHERE (membro_id IS NOT NULL);
CREATE INDEX idx_profiles_kpi_areas ON public.profiles USING gin (kpi_areas);
CREATE INDEX idx_profiles_diretoria ON public.profiles USING btree (is_diretoria_geral) WHERE (is_diretoria_geral = true);
CREATE INDEX idx_profiles_ministerio ON public.profiles USING btree (ministerio_id) WHERE (ministerio_id IS NOT NULL);
CREATE INDEX idx_profiles_kpi_valores ON public.profiles USING gin (kpi_valores);
CREATE INDEX idx_usuario_igrejas_usuario ON public.usuario_igrejas USING btree (usuario_id);
CREATE INDEX idx_usuario_igrejas_igreja ON public.usuario_igrejas USING btree (igreja_id);
CREATE UNIQUE INDEX vol_profiles_auth_user_idx ON public.vol_profiles USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE INDEX vol_profiles_email_idx ON public.vol_profiles USING btree (email);
CREATE INDEX vol_profiles_cpf_idx ON public.vol_profiles USING btree (cpf) WHERE (cpf IS NOT NULL);
CREATE INDEX vol_profiles_allocation_status_idx ON public.vol_profiles USING btree (allocation_status) WHERE (allocation_status = 'waiting_allocation'::text);
CREATE INDEX vol_profiles_membresia_idx ON public.vol_profiles USING btree (membresia_id) WHERE (membresia_id IS NOT NULL);
CREATE INDEX idx_vol_profiles_ativos ON public.vol_profiles USING btree (arquivado) WHERE (arquivado = false);
CREATE INDEX idx_vol_profiles_arquivado_manual ON public.vol_profiles USING btree (id) WHERE arquivado_manual;
CREATE OR REPLACE FUNCTION public.fn_identidade_nomes_compativeis(a text, b text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN a IS NULL OR b IS NULL OR trim(a) = '' OR trim(b) = '' THEN false
    WHEN lower(unaccent(trim(a))) = lower(unaccent(trim(b))) THEN true
    ELSE similarity(lower(unaccent(a)), lower(unaccent(b))) >= 0.90
  END
$function$
;
CREATE OR REPLACE FUNCTION public.fn_registrar_contato(p_membro_id uuid, p_telefone text, p_email text, p_fonte text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_tel text;
  v_email text;
  v_tel_princ text;
  v_email_princ text;
BEGIN
  IF p_membro_id IS NULL THEN RETURN; END IF;
  v_tel := nullif(regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'), '');
  v_email := nullif(lower(trim(coalesce(p_email,''))), '');
  IF v_tel IS NOT NULL AND length(v_tel) < 10 THEN v_tel := NULL; END IF;
  IF v_email IS NOT NULL AND position('@' in v_email) = 0 THEN v_email := NULL; END IF;
  IF v_tel IS NULL AND v_email IS NULL THEN RETURN; END IF;

  SELECT nullif(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), ''),
         nullif(lower(trim(coalesce(email,''))), '')
    INTO v_tel_princ, v_email_princ
    FROM public.mem_membros WHERE id = p_membro_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_tel IS NOT NULL AND v_tel IS DISTINCT FROM v_tel_princ THEN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    VALUES (p_membro_id, 'telefone', v_tel, p_fonte)
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL
    DO UPDATE SET ultimo_visto = now();
  END IF;
  IF v_email IS NOT NULL AND v_email IS DISTINCT FROM v_email_princ THEN
    INSERT INTO public.mem_contatos (membro_id, tipo, valor, fonte)
    VALUES (p_membro_id, 'email', v_email, p_fonte)
    ON CONFLICT (membro_id, tipo, valor) WHERE deleted_at IS NULL
    DO UPDATE SET ultimo_visto = now();
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- enriquecimento é best-effort: não pode derrubar a porta que chamou
  RAISE WARNING 'fn_registrar_contato: contato não registrado (%)', SQLERRM;
END $function$
;
ALTER TABLE app_audit_log ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON app_audit_log FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE app_super_admins ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON app_super_admins FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE batismo_eventos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON batismo_eventos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE batismo_horarios ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON batismo_horarios FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE batismo_inscricoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON batismo_inscricoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_acompanhamentos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_acompanhamentos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_atendimento_comentarios ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_atendimento_comentarios FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_batismo_next_fila ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_batismo_next_fila FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_convertidos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_convertidos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_j180_encontro_presencas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_j180_encontro_presencas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_j180_encontros ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_j180_encontros FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_j180_turma_membros ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_j180_turma_membros FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_j180_turmas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_j180_turmas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_jornada180 ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_jornada180 FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_pedidos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_pedidos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_primeiro_contato_fila ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_primeiro_contato_fila FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cui_visitas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cui_visitas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cultos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cultos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE cultos_decisoes_pessoas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON cultos_decisoes_pessoas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE dados_brutos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON dados_brutos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE grupo_supervisao_observacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON grupo_supervisao_observacoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE grupo_supervisao_visitas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON grupo_supervisao_visitas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE identidade_pendencias ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON identidade_pendencias FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE igrejas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON igrejas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE inscricoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON inscricoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_cadastros_pendentes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_cadastros_pendentes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_contatos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_contatos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_agenda_excecoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_agenda_excecoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_conferencias ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_conferencias FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_documentos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_documentos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_encontro_presencas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_encontro_presencas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_encontros ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_encontros FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_link ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_link FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_membros ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_membros FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_membros_historico ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_membros_historico FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_pedido_eventos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_pedido_eventos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_pedidos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_pedidos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_renovacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_renovacoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupo_transferencias ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupo_transferencias FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_grupos_historico ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_grupos_historico FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_historico ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_historico FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_membros ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_membros FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_temporada_consolidado ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_temporada_consolidado FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_temporadas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_temporadas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE mem_trilha_valores ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON mem_trilha_valores FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE modulos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON modulos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE next_encontros ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON next_encontros FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE next_eventos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON next_eventos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE next_indicacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON next_indicacoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE next_inscricoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON next_inscricoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE next_matriculas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON next_matriculas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE next_presencas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON next_presencas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE next_turmas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON next_turmas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON notificacoes FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE nsm_eventos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON nsm_eventos FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE usuario_igrejas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON usuario_igrejas FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE vol_profiles ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_profiles FOR ALL TO authenticated USING(true) WITH CHECK(true);
ALTER TABLE vol_service_types ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON vol_service_types FOR ALL TO authenticated USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA public,auth,extensions TO authenticated,service_role; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON app_audit_log TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON app_super_admins TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON batismo_eventos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON batismo_horarios TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON batismo_inscricoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_acompanhamentos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_atendimento_comentarios TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_batismo_next_fila TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_convertidos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_j180_encontro_presencas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_j180_encontros TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_j180_turma_membros TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_j180_turmas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_jornada180 TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_pedidos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_primeiro_contato_fila TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cui_visitas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cultos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON cultos_decisoes_pessoas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON dados_brutos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON grupo_supervisao_observacoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON grupo_supervisao_visitas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON identidade_pendencias TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON igrejas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON inscricoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_cadastros_pendentes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_contatos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_agenda_excecoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_conferencias TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_documentos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_encontro_presencas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_encontros TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_link TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_membros TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_membros_historico TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_pedido_eventos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_pedidos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_renovacoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupo_transferencias TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_grupos_historico TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_historico TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_membros TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_temporada_consolidado TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_temporadas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON mem_trilha_valores TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON modulos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON next_encontros TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON next_eventos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON next_indicacoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON next_inscricoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON next_matriculas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON next_presencas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON next_turmas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON notificacoes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON nsm_eventos TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON profiles TO service_role;
GRANT SELECT,INSERT,UPDATE ON usuario_igrejas TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON vol_profiles TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON vol_service_types TO authenticated,service_role;
CREATE FUNCTION app_soft_deletable_tables() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT ARRAY['cultos','next_turmas','next_matriculas','cui_convertidos','cui_jornada180','cui_acompanhamentos']::text[]$$;
CREATE FUNCTION app_soft_delete(t text,i text,u uuid) RETURNS boolean LANGUAGE plpgsql AS $$BEGIN IF NOT(t=ANY(app_soft_deletable_tables())) THEN RAISE EXCEPTION 'Tabela fora da whitelist';END IF;EXECUTE format('UPDATE %I SET deleted_at=now() WHERE id=$1::uuid',t) USING i;RETURN true;END$$;
CREATE OR REPLACE FUNCTION public.fn_link_or_create_membro(p_cpf text, p_telefone text, p_email text, p_nome text, p_status_inicial text DEFAULT 'visitante'::text, p_fonte text DEFAULT NULL::text)
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
    INSERT INTO public.mem_membros (nome, cpf, telefone, email, status, active, created_at, updated_at)
    VALUES (
      trim(p_nome),
      v_cpf,
      nullif(p_telefone, ''),
      v_email,
      coalesce(p_status_inicial, 'visitante'),
      true,
      now(),
      now()
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
    INSERT INTO public.mem_historico (membro_id, tipo, descricao, created_at)
    VALUES (
      v_membro_id,
      'outro',
      '[criado_auto] Criado automaticamente via ' || coalesce(p_fonte, 'fluxo'),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_link_or_create_membro: rastro criado_auto não gravado (%)', SQLERRM;
  END;

  RETURN v_membro_id;
END;
$function$
;
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
        nome, email, telefone, cpf, data_nascimento, status
      ) VALUES (
        NEW.nome,
        NEW.email,
        NEW.telefone,
        NEW.cpf,
        NEW.data_nascimento,
        'visitante'
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
        origem, origem_id, observacao
      ) VALUES (
        NEW.membro_id, NEW.cpf, NEW.nome,
        v_data_culto, 'seguir', v_data_culto,
        'culto_decisao', NEW.id,
        'Decisao de Cristo registrada via modal de culto'
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
       atendido_apos_culto, cadastrado, observacoes, area)
    VALUES
      (COALESCE(NEW.decidiu_em, v_data_culto), NEW.culto_id, NEW.membro_id, TRIM(NEW.nome),
       NEW.telefone, NEW.cpf, false, (NEW.membro_id IS NOT NULL), NEW.observacoes, v_area);

    RETURN NEW;
  END $function$
;
CREATE TRIGGER cultos_dec_pessoas_jornada AFTER INSERT ON public.cultos_decisoes_pessoas FOR EACH ROW EXECUTE FUNCTION tg_cultos_dec_pessoas_jornada();
CREATE TRIGGER cultos_dec_pessoas_resolve_membro BEFORE INSERT ON public.cultos_decisoes_pessoas FOR EACH ROW EXECUTE FUNCTION tg_cultos_dec_pessoas_resolve_membro();
CREATE TRIGGER z_dec_pessoas_to_cuidados AFTER INSERT ON public.cultos_decisoes_pessoas FOR EACH ROW EXECUTE FUNCTION tg_cultos_dec_pessoas_to_cuidados();
CREATE FUNCTION gerar_cultos_recorrentes(p_data_inicio date,p_data_fim date) RETURNS TABLE(out_service_type text,out_data date,out_status text) LANGUAGE sql AS $$ SELECT 'fixture'::text,p_data_inicio,'criado'::text $$; REVOKE ALL ON FUNCTION gerar_cultos_recorrentes(date,date) FROM PUBLIC; GRANT EXECUTE ON FUNCTION gerar_cultos_recorrentes(date,date) TO service_role;
CREATE VIEW vw_grupos_supervisao AS  SELECT g.id,
    g.nome,
    g.categoria,
    g.local,
    g.dia_semana,
    g.horario,
    g.bairro,
    g.ativo,
    g.temporada,
    g.status_temporada,
    g.lider_id,
    l.nome AS lider_nome,
    g.supervisor_id,
    s.nome AS supervisor_nome,
    ( SELECT count(*) AS count
           FROM mem_grupo_membros m
          WHERE m.grupo_id = g.id AND m.saiu_em IS NULL) AS total_membros,
    ( SELECT count(*) AS count
           FROM mem_grupo_membros m
          WHERE m.grupo_id = g.id AND m.saiu_em IS NULL AND m.funcao = 'lider_treinamento'::grupo_funcao) AS total_lider_treinamento,
    ( SELECT max(v.data_visita) AS max
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'realizada'::text) AS ultima_visita,
    ( SELECT count(*) AS count
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'realizada'::text AND v.data_visita >= date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date) AS visitas_mes_atual,
    ( SELECT min(v.data_visita) AS min
           FROM grupo_supervisao_visitas v
          WHERE v.grupo_id = g.id AND v.status = 'agendada'::text AND v.data_visita >= CURRENT_DATE) AS proxima_visita
   FROM mem_grupos g
     LEFT JOIN mem_membros l ON l.id = g.lider_id
     LEFT JOIN mem_membros s ON s.id = g.supervisor_id
  WHERE g.ativo = true AND g.deleted_at IS NULL;;
CREATE VIEW vw_culto_stats AS  SELECT c.id,
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
    round(c.presencial_adulto::numeric / 1300::numeric * 100::numeric, 1) AS taxa_ocupacao,
    c.presencial_adulto + c.presencial_kids AS total_presencial,
    COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0) AS total_decisoes
   FROM cultos c
     LEFT JOIN vol_service_types vst ON c.service_type_id = vst.id;;
REVOKE ALL ON FUNCTION fn_link_or_create_membro(text,text,text,text,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION fn_link_or_create_membro(text,text,text,text,text,text) TO authenticated,service_role; GRANT EXECUTE ON FUNCTION gerar_cultos_recorrentes(date,date) TO authenticated;
CREATE VIEW vw_kpi_trajetoria_atual AS SELECT 1 AS fixture_nao_testada;

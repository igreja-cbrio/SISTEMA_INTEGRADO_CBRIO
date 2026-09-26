-- Complemento estrutural Kids do catálogo vivo 27/09/2026, sem dados pessoais.
-- Executado antes das migrations; FKs auth.users/patrimônio fora desta fixture.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions'
AS $function$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $function$
;
CREATE OR REPLACE FUNCTION public.fn_kids_pre_checkin_codigo()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text;
  v_i int;
  v_try int := 0;
BEGIN
  LOOP
    v_codigo := '';
    FOR v_i IN 1..6 LOOP
      v_codigo := v_codigo || substr(v_alfabeto, floor(random() * length(v_alfabeto) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.kids_pre_checkins WHERE codigo = v_codigo AND status = 'pendente'
    );
    v_try := v_try + 1;
    IF v_try > 20 THEN EXIT; END IF;
  END LOOP;
  RETURN v_codigo;
END $function$
;
CREATE OR REPLACE FUNCTION public.fn_kids_gerar_codigo_seguranca()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_codigo text;
    tentativa integer := 0;
  BEGIN
    LOOP
      tentativa := tentativa + 1;
      v_codigo := '';

      FOR i IN 1..4 LOOP
        v_codigo := v_codigo || substr(
          chars,
          1 + floor(random() * length(chars))::integer,
          1
        );
      END LOOP;

      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM public.kids_checkins k
        WHERE k.codigo_seguranca = v_codigo
          AND k.checkout_at IS NULL
          AND k.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kids_codigos_reservados r
        WHERE r.codigo = v_codigo
          AND r.status = 'reservado'
      );

      IF tentativa >= 100 THEN
        RAISE EXCEPTION
          'Nao foi possivel gerar codigo de seguranca livre';
      END IF;
    END LOOP;

    RETURN v_codigo;
  END;
  $function$
;
CREATE TABLE kids_atendimentos(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"crianca_id" uuid NOT NULL,
"tipo" text DEFAULT 'contato'::text NOT NULL,
"descricao" text NOT NULL,
"data" date DEFAULT CURRENT_DATE NOT NULL,
"registrado_por" uuid,
"registrado_por_nome" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE kids_chamadas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"sessao_id" uuid NOT NULL,
"checkin_id" uuid NOT NULL,
"crianca_id" uuid NOT NULL,
"sala_id" uuid NOT NULL,
"estacao_origem_id" uuid,
"codigo_seguranca" text NOT NULL,
"responsavel_nome_snapshot" text,
"responsavel_telefone_snapshot" text,
"chamada_em" timestamp with time zone DEFAULT now() NOT NULL,
"atendida_em" timestamp with time zone,
"atendida_por" uuid,
"re_chamadas" integer DEFAULT 0 NOT NULL,
"ultima_rechamada_em" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE kids_checkins(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"sessao_id" uuid NOT NULL,
"crianca_id" uuid NOT NULL,
"sala_id" uuid NOT NULL,
"estacao_checkin_id" uuid,
"responsavel_checkin_id" uuid,
"responsavel_checkin_nome" text NOT NULL,
"responsavel_checkin_telefone" text,
"responsavel_checkin_parentesco" text,
"codigo_seguranca" text NOT NULL,
"codigo_barras" text NOT NULL,
"checkin_at" timestamp with time zone DEFAULT now() NOT NULL,
"checkin_por" uuid,
"checkout_at" timestamp with time zone,
"responsavel_checkout_id" uuid,
"responsavel_checkout_nome" text,
"checkout_metodo" text,
"checkout_por" uuid,
"override_motivo" text,
"override_aprovado_por" uuid,
"observacoes_no_dia" text,
"fez_decisao_jesus" boolean DEFAULT false NOT NULL,
"decisao_jesus_marcada_por" uuid,
"decisao_jesus_em" timestamp with time zone,
"labels_impressas" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"pager_id" uuid,
"checkin_grupo_id" uuid,
"pager_numero" text,
"pager_devolvido_at" timestamp with time zone,
"pager_devolvido_por" uuid
);
CREATE TABLE kids_codigos_reservados(
"codigo" text NOT NULL,
"estacao_id" uuid,
"estacao_ref" text NOT NULL,
"sessao_id" uuid,
"status" text DEFAULT 'reservado'::text NOT NULL,
"reservado_em" timestamp with time zone DEFAULT now() NOT NULL,
"usado_em" timestamp with time zone,
"checkin_id" uuid
);
CREATE TABLE kids_conversoes_import(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"lote" text NOT NULL,
"linha" integer NOT NULL,
"nome_planilha" text NOT NULL,
"nome_norm_planilha" text NOT NULL,
"nome_base_pin" text,
"idade_planilha" integer,
"tel_planilha" text,
"data_decisao" date NOT NULL,
"periodo" text,
"culto_txt" text NOT NULL,
"obs_planilha" text,
"faixa" text NOT NULL,
"motivo" text NOT NULL,
"crianca_id" uuid,
"culto_id" uuid,
"culto_origem" text,
"decisao_id" uuid,
"data_conversao_antes" date,
"status" text DEFAULT 'pendente'::text NOT NULL,
"decidido_por" uuid,
"decidido_em" timestamp with time zone,
"decisao_nota" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE kids_criancas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"data_nascimento" date,
"sexo" text,
"familia_id" uuid,
"observacoes_medicas" text,
"necessidades_especiais" text,
"foto_url" text,
"foto_consentimento_em" timestamp with time zone,
"visitante" boolean DEFAULT true NOT NULL,
"ativo" boolean DEFAULT true NOT NULL,
"observacoes_internas" text,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"foto_storage_path" text,
"foto_consentimento_por" uuid,
"foto_consentimento_versao" text,
"planning_center_id" text,
"serie" text,
"consent_marketing" boolean,
"consent_marketing_em" timestamp with time zone,
"consent_marketing_versao" text,
"inativado_em" timestamp with time zone,
"motivo_inativacao" text,
"data_conversao" date,
"data_batismo" date,
"tem_espectro" boolean,
"espectro_qual" text,
"tem_alergia" boolean,
"alergia_qual" text,
"tem_limitacao_fisica" boolean,
"limitacao_fisica_qual" text,
"nome_norm" text GENERATED ALWAYS AS (lower(f_unaccent(nome))) STORED,
"data_limite" date,
"visitante_relacao" text
);
CREATE TABLE kids_estacoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"tipo" text DEFAULT 'manned'::text NOT NULL,
"sala_id" uuid,
"printer_target" text,
"printer_modelo" text DEFAULT 'QL-820NWB'::text NOT NULL,
"printer_largura_mm" numeric DEFAULT 90,
"printer_altura_mm" numeric DEFAULT 29,
"ativo" boolean DEFAULT true NOT NULL,
"ultima_impressao_at" timestamp with time zone,
"ultima_impressao_status" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"token_pareamento" uuid DEFAULT gen_random_uuid() NOT NULL,
"pareada_em" timestamp with time zone,
"user_agent_pareada" text
);
CREATE TABLE kids_estoque(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"sala_id" uuid NOT NULL,
"nome" text NOT NULL,
"categoria" text,
"unidade" text DEFAULT 'un'::text NOT NULL,
"qtd_esperada" integer DEFAULT 0 NOT NULL,
"qtd_atual" integer DEFAULT 0 NOT NULL,
"pat_bem_id" uuid,
"observacao" text,
"ativo" boolean DEFAULT true NOT NULL,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE kids_etiqueta_config(
"id" smallint DEFAULT 1 NOT NULL,
"logo_tamanho" text DEFAULT 'M'::text NOT NULL,
"logo_posicao" text DEFAULT 'esquerda'::text NOT NULL,
"nome_tamanho" text DEFAULT 'auto'::text NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"logo_aniversario_url" text,
"fonte" text DEFAULT 'sans'::text NOT NULL,
"escala_fonte" text DEFAULT 'M'::text NOT NULL
);
CREATE TABLE kids_etiquetas_log(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"checkin_id" uuid NOT NULL,
"estacao_id" uuid,
"tipo" text NOT NULL,
"conteudo_json" jsonb NOT NULL,
"reimpressao" boolean DEFAULT false NOT NULL,
"motivo_reimpressao" text,
"impressa_por" uuid,
"impressa_at" timestamp with time zone DEFAULT now() NOT NULL,
"status" text DEFAULT 'enviada'::text NOT NULL,
"erro" text
);
CREATE TABLE kids_pager_envios(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"chamada_id" uuid,
"checkin_id" uuid,
"pager_id" uuid,
"pager_numero" integer NOT NULL,
"cor" text DEFAULT 'R'::text NOT NULL,
"tipo_lrs" integer DEFAULT 2 NOT NULL,
"origem" text DEFAULT 'chamada'::text NOT NULL,
"status" text DEFAULT 'pendente'::text NOT NULL,
"tentativas" integer DEFAULT 0 NOT NULL,
"erro" text,
"criado_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"enviado_em" timestamp with time zone
);
CREATE TABLE kids_pagers(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"igreja_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
"numero" integer NOT NULL,
"rotulo" text,
"cor" text DEFAULT 'R'::text NOT NULL,
"tipo_lrs" integer DEFAULT 2 NOT NULL,
"responsavel_padrao_id" uuid,
"ativo" boolean DEFAULT true NOT NULL,
"observacao" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE kids_pco_presencas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"crianca_id" uuid NOT NULL,
"data" date NOT NULL,
"culto_id" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE kids_portao_scans(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"checkin_id" uuid,
"codigo" text NOT NULL,
"resultado" text NOT NULL,
"crianca_nome" text,
"detalhe" text,
"criado_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE kids_pre_checkins(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"codigo" text NOT NULL,
"responsavel_membro_id" uuid NOT NULL,
"responsavel_nome" text NOT NULL,
"responsavel_telefone" text,
"crianca_ids" uuid[] NOT NULL,
"status" text DEFAULT 'pendente'::text NOT NULL,
"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
"expira_em" timestamp with time zone NOT NULL,
"usado_em" timestamp with time zone,
"usado_por" uuid,
"checkin_ids" uuid[]
);
CREATE TABLE kids_responsaveis(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"crianca_id" uuid NOT NULL,
"membro_id" uuid NOT NULL,
"parentesco" text,
"autorizado_buscar" boolean DEFAULT true NOT NULL,
"contato_emergencia" boolean DEFAULT false NOT NULL,
"observacao" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE kids_sala_voluntarios(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"sala_id" uuid NOT NULL,
"vol_profile_id" uuid,
"membro_id" uuid,
"nome" text NOT NULL,
"telefone" text,
"papel" text DEFAULT 'voluntario'::text NOT NULL,
"observacao" text,
"ativo" boolean DEFAULT true NOT NULL,
"created_by" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE kids_salas(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"faixa_etaria_min_meses" integer DEFAULT 0 NOT NULL,
"faixa_etaria_max_meses" integer DEFAULT 156 NOT NULL,
"capacidade" integer DEFAULT 30 NOT NULL,
"cor" text DEFAULT '#EC4899'::text NOT NULL,
"igreja_id" uuid,
"ativo" boolean DEFAULT true NOT NULL,
"ordem" integer DEFAULT 0 NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"pat_localizacao_id" uuid,
"logo_url" text
);
CREATE TABLE kids_sessoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"culto_id" uuid,
"abrir_em" timestamp with time zone NOT NULL,
"fechar_em" timestamp with time zone,
"encerrada_at" timestamp with time zone,
"encerrada_por" uuid,
"status" text DEFAULT 'agendada'::text NOT NULL,
"observacoes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone
);
CREATE TABLE kids_totem_config(
"id" boolean DEFAULT true NOT NULL,
"edit_senha_hash" text,
"edit_senha_por" uuid,
"edit_senha_em" timestamp with time zone,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE kids_vinculo_solicitacoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"solicitante_membro_id" uuid NOT NULL,
"solicitante_nome" text NOT NULL,
"solicitante_telefone" text,
"solicitante_parentesco" text DEFAULT 'outro'::text NOT NULL,
"crianca_id" uuid,
"crianca_nome" text NOT NULL,
"crianca_data_nascimento" date,
"crianca_doc_path" text,
"doc_pai_path" text,
"doc_mae_path" text,
"observacao" text,
"status" text DEFAULT 'pendente'::text NOT NULL,
"decidido_por" uuid,
"decidido_por_nome" text,
"decidido_em" timestamp with time zone,
"motivo_rejeicao" text,
"crianca_criada_id" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"deleted_at" timestamp with time zone,
"mae_nome" text,
"pai_nome" text,
"crianca_foto_path" text,
"foto_consentimento_em" timestamp with time zone,
"foto_consentimento_versao" text,
"serie" text,
"foto_mae_path" text,
"foto_pai_path" text,
"necessidade_especial" text,
"consent_marketing" boolean,
"consent_marketing_em" timestamp with time zone,
"consent_marketing_versao" text,
"tem_espectro" boolean,
"espectro_qual" text,
"tem_alergia" boolean,
"alergia_qual" text,
"tem_limitacao_fisica" boolean,
"limitacao_fisica_qual" text,
"observacoes_medicas" text
);
CREATE TABLE totem_estacao_tokens(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"estacao_id" uuid NOT NULL,
"tipo" text NOT NULL,
"token_hash" text NOT NULL,
"prefixo" text NOT NULL,
"rotulo" text,
"linhagem" uuid DEFAULT gen_random_uuid() NOT NULL,
"criado_por" uuid,
"expira_em" timestamp with time zone,
"pareado_em" timestamp with time zone,
"pareado_ip" text,
"pareado_user_agent" text,
"usado_em" timestamp with time zone,
"ultimo_uso_em" timestamp with time zone,
"revogado_em" timestamp with time zone,
"revogado_por" uuid,
"revogado_motivo" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE totem_estacoes(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"codigo" text NOT NULL,
"nome" text NOT NULL,
"finalidades" text[] DEFAULT ARRAY['inscricoes'::text] NOT NULL,
"local" text,
"igreja_id" uuid,
"evento_fixo_id" uuid,
"tef_provider" text,
"tef_terminal_serie" text,
"tef_terminal_logico" text,
"tef_ativo" boolean DEFAULT false NOT NULL,
"printer_target" text,
"printer_modelo" text DEFAULT 'QL-820NWB'::text,
"printer_largura_mm" numeric DEFAULT 80,
"printer_altura_mm" numeric,
"ativo" boolean DEFAULT true NOT NULL,
"ip_permitidos" inet[],
"revogada_em" timestamp with time zone,
"revogada_por" uuid,
"revogada_motivo" text,
"ultima_batida_em" timestamp with time zone,
"ultimo_ip" text,
"ultimo_user_agent" text,
"versao_app" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"created_by" uuid,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"conta_id" uuid
);
ALTER TABLE totem_estacoes ADD CONSTRAINT chk_totem_estacoes_revogacao CHECK (((revogada_em IS NULL) OR ((revogada_motivo IS NOT NULL) AND (length(btrim(revogada_motivo)) >= 3))));
ALTER TABLE totem_estacoes ADD CONSTRAINT totem_estacoes_codigo_check CHECK ((codigo ~ '^[a-z0-9][a-z0-9-]{1,30}$'::text));
ALTER TABLE totem_estacoes ADD CONSTRAINT totem_estacoes_codigo_key UNIQUE (codigo);
ALTER TABLE totem_estacoes ADD CONSTRAINT totem_estacoes_finalidades_check CHECK (((finalidades <@ ARRAY['inscricoes'::text, 'kids'::text, 'membro'::text, 'voluntariado'::text]) AND (array_length(finalidades, 1) >= 1)));
ALTER TABLE totem_estacoes ADD CONSTRAINT totem_estacoes_pkey PRIMARY KEY (id);
ALTER TABLE totem_estacoes ADD CONSTRAINT totem_estacoes_tef_provider_check CHECK (((tef_provider IS NULL) OR (tef_provider = ANY (ARRAY['paygo'::text, 'sitef'::text]))));
ALTER TABLE kids_portao_scans ADD CONSTRAINT kids_portao_scans_pkey PRIMARY KEY (id);
ALTER TABLE kids_portao_scans ADD CONSTRAINT kids_portao_scans_resultado_check CHECK ((resultado = ANY (ARRAY['ok'::text, 'ja_retirada'::text, 'fora_de_sessao'::text, 'nao_reconhecido'::text])));
ALTER TABLE kids_responsaveis ADD CONSTRAINT kids_responsaveis_crianca_id_membro_id_key UNIQUE (crianca_id, membro_id);
ALTER TABLE kids_responsaveis ADD CONSTRAINT kids_responsaveis_parentesco_check CHECK ((parentesco = ANY (ARRAY['mae'::text, 'pai'::text, 'padrasto'::text, 'madrasta'::text, 'avo_a'::text, 'tio_a'::text, 'irmao_a'::text, 'tutor'::text, 'outro'::text])));
ALTER TABLE kids_responsaveis ADD CONSTRAINT kids_responsaveis_pkey PRIMARY KEY (id);
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_checkout_metodo_check CHECK ((checkout_metodo = ANY (ARRAY['codigo_digitado'::text, 'barcode_escaneado'::text, 'responsavel_autorizado'::text, 'override_supervisor'::text, 'checkout_forcado'::text, 'painel'::text, 'portao'::text])));
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_pkey PRIMARY KEY (id);
ALTER TABLE kids_pager_envios ADD CONSTRAINT kids_pager_envios_origem_check CHECK ((origem = ANY (ARRAY['chamada'::text, 'rechamada'::text, 'teste'::text, 'manual'::text])));
ALTER TABLE kids_pager_envios ADD CONSTRAINT kids_pager_envios_pkey PRIMARY KEY (id);
ALTER TABLE kids_pager_envios ADD CONSTRAINT kids_pager_envios_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'erro'::text, 'cancelado'::text])));
ALTER TABLE kids_etiqueta_config ADD CONSTRAINT kids_etiqueta_config_pkey PRIMARY KEY (id);
ALTER TABLE kids_etiqueta_config ADD CONSTRAINT kids_etiqueta_config_singleton CHECK ((id = 1));
ALTER TABLE kids_vinculo_solicitacoes ADD CONSTRAINT kids_vinculo_solicitacoes_pkey PRIMARY KEY (id);
ALTER TABLE kids_vinculo_solicitacoes ADD CONSTRAINT kids_vinculo_solicitacoes_solicitante_parentesco_check CHECK ((solicitante_parentesco = ANY (ARRAY['mae'::text, 'pai'::text, 'avo_a'::text, 'tio_a'::text, 'tutor'::text, 'outro'::text])));
ALTER TABLE kids_vinculo_solicitacoes ADD CONSTRAINT kids_vinculo_solicitacoes_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text, 'cancelado'::text])));
ALTER TABLE kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_faixa_check CHECK ((faixa = ANY (ARRAY['A'::text, 'B'::text])));
ALTER TABLE kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_periodo_check CHECK (((periodo IS NULL) OR (periodo = ANY (ARRAY['manha'::text, 'noite'::text]))));
ALTER TABLE kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_pkey PRIMARY KEY (id);
ALTER TABLE kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_status_check CHECK ((status = ANY (ARRAY['aplicada'::text, 'pendente'::text, 'resolvida'::text, 'descartada'::text])));
ALTER TABLE kids_conversoes_import ADD CONSTRAINT uq_kids_conv_import_lote_linha UNIQUE (lote, linha);
ALTER TABLE kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_pkey PRIMARY KEY (codigo);
ALTER TABLE kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_status_check CHECK ((status = ANY (ARRAY['reservado'::text, 'usado'::text, 'descartado'::text])));
ALTER TABLE kids_pco_presencas ADD CONSTRAINT kids_pco_presencas_crianca_id_data_key UNIQUE (crianca_id, data);
ALTER TABLE kids_pco_presencas ADD CONSTRAINT kids_pco_presencas_pkey PRIMARY KEY (id);
ALTER TABLE kids_totem_config ADD CONSTRAINT kids_totem_config_id_check CHECK (id);
ALTER TABLE kids_totem_config ADD CONSTRAINT kids_totem_config_pkey PRIMARY KEY (id);
ALTER TABLE totem_estacao_tokens ADD CONSTRAINT totem_estacao_tokens_pkey PRIMARY KEY (id);
ALTER TABLE totem_estacao_tokens ADD CONSTRAINT totem_estacao_tokens_tipo_check CHECK ((tipo = ANY (ARRAY['pareamento'::text, 'dispositivo'::text, 'agente'::text])));
ALTER TABLE totem_estacao_tokens ADD CONSTRAINT totem_estacao_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE kids_salas ADD CONSTRAINT kids_salas_capacidade_check CHECK ((capacidade > 0));
ALTER TABLE kids_salas ADD CONSTRAINT kids_salas_check CHECK ((faixa_etaria_min_meses <= faixa_etaria_max_meses));
ALTER TABLE kids_salas ADD CONSTRAINT kids_salas_nome_key UNIQUE (nome);
ALTER TABLE kids_salas ADD CONSTRAINT kids_salas_pkey PRIMARY KEY (id);
ALTER TABLE kids_estacoes ADD CONSTRAINT kids_estacoes_nome_key UNIQUE (nome);
ALTER TABLE kids_estacoes ADD CONSTRAINT kids_estacoes_pkey PRIMARY KEY (id);
ALTER TABLE kids_estacoes ADD CONSTRAINT kids_estacoes_tipo_check CHECK ((tipo = ANY (ARRAY['manned'::text, 'self'::text, 'roster'::text, 'display'::text, 'display_foyer'::text])));
ALTER TABLE kids_sessoes ADD CONSTRAINT kids_sessoes_culto_id_key UNIQUE (culto_id);
ALTER TABLE kids_sessoes ADD CONSTRAINT kids_sessoes_pkey PRIMARY KEY (id);
ALTER TABLE kids_sessoes ADD CONSTRAINT kids_sessoes_status_check CHECK ((status = ANY (ARRAY['agendada'::text, 'aberta'::text, 'encerrada'::text, 'cancelada'::text])));
ALTER TABLE kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_pkey PRIMARY KEY (id);
ALTER TABLE kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_status_check CHECK ((status = ANY (ARRAY['enviada'::text, 'sucesso'::text, 'falha'::text])));
ALTER TABLE kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_tipo_check CHECK ((tipo = ANY (ARRAY['crianca'::text, 'responsavel'::text, 'extra_responsavel'::text, 'teste'::text])));
ALTER TABLE kids_chamadas ADD CONSTRAINT kids_chamadas_pkey PRIMARY KEY (id);
ALTER TABLE kids_pagers ADD CONSTRAINT kids_pagers_cor_check CHECK ((cor ~ '^[RBGYOPW]{1,3}$'::text));
ALTER TABLE kids_pagers ADD CONSTRAINT kids_pagers_pkey PRIMARY KEY (id);
ALTER TABLE kids_pre_checkins ADD CONSTRAINT kids_pre_checkins_codigo_key UNIQUE (codigo);
ALTER TABLE kids_pre_checkins ADD CONSTRAINT kids_pre_checkins_pkey PRIMARY KEY (id);
ALTER TABLE kids_pre_checkins ADD CONSTRAINT kids_pre_checkins_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'usado'::text, 'expirado'::text, 'cancelado'::text])));
ALTER TABLE kids_criancas ADD CONSTRAINT kids_criancas_pkey PRIMARY KEY (id);
ALTER TABLE kids_criancas ADD CONSTRAINT kids_criancas_sexo_check CHECK ((sexo = ANY (ARRAY['M'::text, 'F'::text, 'outro'::text])));
ALTER TABLE kids_criancas ADD CONSTRAINT kids_criancas_visitante_relacao_check CHECK (((visitante_relacao IS NULL) OR (visitante_relacao = ANY (ARRAY['amigo'::text, 'primo'::text, 'vizinho'::text, 'irmao'::text, 'outros'::text]))));
ALTER TABLE kids_sala_voluntarios ADD CONSTRAINT kids_sala_voluntarios_pkey PRIMARY KEY (id);
ALTER TABLE kids_atendimentos ADD CONSTRAINT kids_atendimentos_pkey PRIMARY KEY (id);
ALTER TABLE kids_estoque ADD CONSTRAINT kids_estoque_pkey PRIMARY KEY (id);
ALTER TABLE totem_estacoes ADD CONSTRAINT totem_estacoes_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE totem_estacoes ADD CONSTRAINT totem_estacoes_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id) ON DELETE SET NULL;
ALTER TABLE kids_portao_scans ADD CONSTRAINT kids_portao_scans_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES kids_checkins(id) ON DELETE SET NULL;
ALTER TABLE kids_responsaveis ADD CONSTRAINT kids_responsaveis_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES kids_criancas(id) ON DELETE CASCADE;
ALTER TABLE kids_responsaveis ADD CONSTRAINT kids_responsaveis_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE RESTRICT;
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES kids_criancas(id) ON DELETE RESTRICT;
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_estacao_checkin_id_fkey FOREIGN KEY (estacao_checkin_id) REFERENCES kids_estacoes(id);
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_pager_id_fkey FOREIGN KEY (pager_id) REFERENCES kids_pagers(id) ON DELETE SET NULL;
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_responsavel_checkin_id_fkey FOREIGN KEY (responsavel_checkin_id) REFERENCES mem_membros(id);
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_responsavel_checkout_id_fkey FOREIGN KEY (responsavel_checkout_id) REFERENCES mem_membros(id);
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES kids_salas(id);
ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES kids_sessoes(id) ON DELETE CASCADE;
ALTER TABLE kids_pager_envios ADD CONSTRAINT kids_pager_envios_chamada_id_fkey FOREIGN KEY (chamada_id) REFERENCES kids_chamadas(id) ON DELETE CASCADE;
ALTER TABLE kids_pager_envios ADD CONSTRAINT kids_pager_envios_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES kids_checkins(id) ON DELETE SET NULL;
ALTER TABLE kids_pager_envios ADD CONSTRAINT kids_pager_envios_pager_id_fkey FOREIGN KEY (pager_id) REFERENCES kids_pagers(id) ON DELETE SET NULL;
ALTER TABLE kids_vinculo_solicitacoes ADD CONSTRAINT kids_vinculo_solicitacoes_crianca_criada_id_fkey FOREIGN KEY (crianca_criada_id) REFERENCES kids_criancas(id) ON DELETE SET NULL;
ALTER TABLE kids_vinculo_solicitacoes ADD CONSTRAINT kids_vinculo_solicitacoes_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES kids_criancas(id) ON DELETE SET NULL;
ALTER TABLE kids_vinculo_solicitacoes ADD CONSTRAINT kids_vinculo_solicitacoes_solicitante_membro_id_fkey FOREIGN KEY (solicitante_membro_id) REFERENCES mem_membros(id) ON DELETE CASCADE;
ALTER TABLE kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES kids_criancas(id) ON DELETE SET NULL;
ALTER TABLE kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES cultos(id) ON DELETE SET NULL;
ALTER TABLE kids_conversoes_import ADD CONSTRAINT kids_conversoes_import_decisao_id_fkey FOREIGN KEY (decisao_id) REFERENCES cultos_decisoes_pessoas(id) ON DELETE SET NULL;
ALTER TABLE kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES kids_checkins(id) ON DELETE SET NULL;
ALTER TABLE kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_estacao_id_fkey FOREIGN KEY (estacao_id) REFERENCES kids_estacoes(id) ON DELETE SET NULL;
ALTER TABLE kids_codigos_reservados ADD CONSTRAINT kids_codigos_reservados_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES kids_sessoes(id) ON DELETE CASCADE;
ALTER TABLE kids_pco_presencas ADD CONSTRAINT kids_pco_presencas_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES kids_criancas(id) ON DELETE CASCADE;
ALTER TABLE kids_pco_presencas ADD CONSTRAINT kids_pco_presencas_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES cultos(id) ON DELETE SET NULL;
ALTER TABLE totem_estacao_tokens ADD CONSTRAINT totem_estacao_tokens_estacao_id_fkey FOREIGN KEY (estacao_id) REFERENCES totem_estacoes(id) ON DELETE CASCADE;
ALTER TABLE kids_salas ADD CONSTRAINT kids_salas_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id);
ALTER TABLE kids_estacoes ADD CONSTRAINT kids_estacoes_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES kids_salas(id);
ALTER TABLE kids_sessoes ADD CONSTRAINT kids_sessoes_culto_id_fkey FOREIGN KEY (culto_id) REFERENCES cultos(id) ON DELETE SET NULL;
ALTER TABLE kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES kids_checkins(id) ON DELETE CASCADE;
ALTER TABLE kids_etiquetas_log ADD CONSTRAINT kids_etiquetas_log_estacao_id_fkey FOREIGN KEY (estacao_id) REFERENCES kids_estacoes(id);
ALTER TABLE kids_chamadas ADD CONSTRAINT kids_chamadas_checkin_id_fkey FOREIGN KEY (checkin_id) REFERENCES kids_checkins(id) ON DELETE CASCADE;
ALTER TABLE kids_chamadas ADD CONSTRAINT kids_chamadas_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES kids_criancas(id) ON DELETE CASCADE;
ALTER TABLE kids_chamadas ADD CONSTRAINT kids_chamadas_estacao_origem_id_fkey FOREIGN KEY (estacao_origem_id) REFERENCES kids_estacoes(id);
ALTER TABLE kids_chamadas ADD CONSTRAINT kids_chamadas_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES kids_salas(id);
ALTER TABLE kids_chamadas ADD CONSTRAINT kids_chamadas_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES kids_sessoes(id) ON DELETE CASCADE;
ALTER TABLE kids_pagers ADD CONSTRAINT kids_pagers_igreja_id_fkey FOREIGN KEY (igreja_id) REFERENCES igrejas(id);
ALTER TABLE kids_pagers ADD CONSTRAINT kids_pagers_responsavel_padrao_id_fkey FOREIGN KEY (responsavel_padrao_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE kids_pre_checkins ADD CONSTRAINT kids_pre_checkins_responsavel_membro_id_fkey FOREIGN KEY (responsavel_membro_id) REFERENCES mem_membros(id) ON DELETE CASCADE;
ALTER TABLE kids_sala_voluntarios ADD CONSTRAINT kids_sala_voluntarios_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE kids_sala_voluntarios ADD CONSTRAINT kids_sala_voluntarios_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES kids_salas(id) ON DELETE CASCADE;
ALTER TABLE kids_sala_voluntarios ADD CONSTRAINT kids_sala_voluntarios_vol_profile_id_fkey FOREIGN KEY (vol_profile_id) REFERENCES vol_profiles(id) ON DELETE SET NULL;
ALTER TABLE kids_atendimentos ADD CONSTRAINT kids_atendimentos_crianca_id_fkey FOREIGN KEY (crianca_id) REFERENCES kids_criancas(id) ON DELETE CASCADE;
ALTER TABLE kids_estoque ADD CONSTRAINT kids_estoque_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES kids_salas(id) ON DELETE CASCADE;
CREATE INDEX idx_kids_atendimentos_crianca ON public.kids_atendimentos USING btree (crianca_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kids_chamadas_sala_ativas ON public.kids_chamadas USING btree (sala_id, chamada_em DESC) WHERE (atendida_em IS NULL);
CREATE INDEX idx_kids_chamadas_sessao ON public.kids_chamadas USING btree (sessao_id);
CREATE INDEX idx_kids_chamadas_checkin ON public.kids_chamadas USING btree (checkin_id);
CREATE UNIQUE INDEX uq_kids_chamadas_ativa_por_crianca ON public.kids_chamadas USING btree (crianca_id, sessao_id) WHERE (atendida_em IS NULL);
CREATE INDEX idx_kids_checkins_sessao ON public.kids_checkins USING btree (sessao_id);
CREATE INDEX idx_kids_checkins_abertos ON public.kids_checkins USING btree (sessao_id, sala_id) WHERE (checkout_at IS NULL);
CREATE INDEX idx_kids_checkins_codigo ON public.kids_checkins USING btree (codigo_seguranca) WHERE (checkout_at IS NULL);
CREATE INDEX idx_kids_checkins_crianca ON public.kids_checkins USING btree (crianca_id, checkin_at DESC);
CREATE INDEX idx_kids_checkins_active ON public.kids_checkins USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kids_checkins_pager ON public.kids_checkins USING btree (pager_id) WHERE ((pager_id IS NOT NULL) AND (checkout_at IS NULL));
CREATE INDEX idx_kids_checkins_grupo ON public.kids_checkins USING btree (checkin_grupo_id) WHERE (checkin_grupo_id IS NOT NULL);
CREATE UNIQUE INDEX uq_kids_checkins_aberto ON public.kids_checkins USING btree (sessao_id, crianca_id) WHERE (checkout_at IS NULL);
CREATE INDEX idx_kids_checkins_codigo_ativo ON public.kids_checkins USING btree (codigo_seguranca) WHERE ((checkout_at IS NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_kids_checkins_pager_numero ON public.kids_checkins USING btree (pager_numero) WHERE ((pager_numero IS NOT NULL) AND (checkout_at IS NULL) AND (deleted_at IS NULL));
CREATE INDEX idx_kids_cod_reserv_saque ON public.kids_codigos_reservados USING btree (estacao_ref, sessao_id) WHERE (status = 'reservado'::text);
CREATE INDEX idx_kids_cod_reserv_sessao ON public.kids_codigos_reservados USING btree (sessao_id);
CREATE INDEX idx_kids_conv_import_ativo ON public.kids_conversoes_import USING btree (status, data_decisao) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kids_conv_import_crianca ON public.kids_conversoes_import USING btree (crianca_id) WHERE ((deleted_at IS NULL) AND (crianca_id IS NOT NULL));
CREATE INDEX idx_kids_criancas_familia ON public.kids_criancas USING btree (familia_id) WHERE (familia_id IS NOT NULL);
CREATE INDEX idx_kids_criancas_nome_trgm ON public.kids_criancas USING gin (nome gin_trgm_ops);
CREATE INDEX idx_kids_criancas_ativo ON public.kids_criancas USING btree (ativo) WHERE (ativo = true);
CREATE INDEX idx_kids_criancas_active ON public.kids_criancas USING btree (id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_kids_criancas_pco_id ON public.kids_criancas USING btree (planning_center_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kids_criancas_nome_norm ON public.kids_criancas USING btree (nome_norm text_pattern_ops);
CREATE UNIQUE INDEX idx_kids_estacoes_token ON public.kids_estacoes USING btree (token_pareamento);
CREATE INDEX idx_kids_estoque_sala ON public.kids_estoque USING btree (sala_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kids_etiquetas_log_checkin ON public.kids_etiquetas_log USING btree (checkin_id);
CREATE INDEX idx_kids_etiquetas_log_data ON public.kids_etiquetas_log USING btree (impressa_at DESC);
CREATE INDEX idx_kids_pager_envios_pendentes ON public.kids_pager_envios USING btree (created_at) WHERE (status = 'pendente'::text);
CREATE INDEX idx_kids_pager_envios_checkin ON public.kids_pager_envios USING btree (checkin_id);
CREATE UNIQUE INDEX uq_kids_pagers_numero ON public.kids_pagers USING btree (igreja_id, numero) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kids_pagers_ativos ON public.kids_pagers USING btree (id) WHERE ((deleted_at IS NULL) AND (ativo = true));
CREATE INDEX idx_kids_pco_presencas_data ON public.kids_pco_presencas USING btree (data);
CREATE INDEX idx_kids_pco_presencas_crianca ON public.kids_pco_presencas USING btree (crianca_id);
CREATE INDEX idx_kids_portao_scans_created ON public.kids_portao_scans USING btree (created_at DESC);
CREATE INDEX idx_kids_portao_scans_checkin ON public.kids_portao_scans USING btree (checkin_id);
CREATE INDEX idx_kids_pre_checkins_codigo ON public.kids_pre_checkins USING btree (codigo) WHERE (status = 'pendente'::text);
CREATE INDEX idx_kids_pre_checkins_responsavel ON public.kids_pre_checkins USING btree (responsavel_membro_id, criado_em DESC);
CREATE INDEX idx_kids_responsaveis_membro ON public.kids_responsaveis USING btree (membro_id);
CREATE INDEX idx_kids_sala_vol_sala ON public.kids_sala_voluntarios USING btree (sala_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX uq_kids_sala_vol ON public.kids_sala_voluntarios USING btree (sala_id, vol_profile_id) WHERE ((deleted_at IS NULL) AND (vol_profile_id IS NOT NULL));
CREATE INDEX idx_kids_salas_ativo ON public.kids_salas USING btree (ativo, ordem) WHERE (ativo = true);
CREATE INDEX idx_kids_salas_pat_loc ON public.kids_salas USING btree (pat_localizacao_id) WHERE (pat_localizacao_id IS NOT NULL);
CREATE INDEX idx_kids_sessoes_status ON public.kids_sessoes USING btree (status, abrir_em DESC);
CREATE INDEX idx_kids_vinc_active ON public.kids_vinculo_solicitacoes USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_kids_vinc_solicitante ON public.kids_vinculo_solicitacoes USING btree (solicitante_membro_id, created_at DESC);
CREATE INDEX idx_kids_vinc_pendente ON public.kids_vinculo_solicitacoes USING btree (status, created_at DESC) WHERE (status = 'pendente'::text);
CREATE INDEX totem_estacao_tokens_vivos_idx ON public.totem_estacao_tokens USING btree (estacao_id, tipo) WHERE (revogado_em IS NULL);
CREATE INDEX totem_estacao_tokens_linhagem_idx ON public.totem_estacao_tokens USING btree (linhagem);
CREATE INDEX totem_estacoes_ativas_idx ON public.totem_estacoes USING btree (codigo) WHERE (ativo AND (revogada_em IS NULL));
CREATE UNIQUE INDEX totem_estacoes_conta_uk ON public.totem_estacoes USING btree (conta_id) WHERE (conta_id IS NOT NULL);
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
REVOKE ALL ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_reservar_codigos(text, uuid, integer, uuid) TO service_role;
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
      WHERE sessao_id = NEW.id
        AND deleted_at IS NULL;

    UPDATE public.cultos
      SET presencial_kids = v_total,
          decisoes_kids   = v_decisoes,
          updated_at      = now()
      WHERE id = NEW.culto_id;
  END IF;
  RETURN NEW;
END $function$
;
REVOKE ALL ON FUNCTION public.fn_kids_sessao_consolida_culto() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_sessao_consolida_culto() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_sessao_consolida_culto() TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_kids_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$ BEGIN NEW.updated_at := now(); RETURN NEW; END $function$
;
REVOKE ALL ON FUNCTION public.fn_kids_set_updated_at() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_set_updated_at() TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_forcado_pendentes()
 RETURNS TABLE(checkins_fechados integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
  DECLARE v_count int;
  BEGIN
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
REVOKE ALL ON FUNCTION public.fn_kids_checkout_forcado_pendentes() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_checkout_forcado_pendentes() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_checkout_forcado_pendentes() TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_kids_decisao_para_culto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
  DECLARE v_culto_id uuid; v_crianca_nome text; v_cpf_resp text;
  BEGIN
    IF NEW.fez_decisao_jesus = true AND (OLD.fez_decisao_jesus IS DISTINCT FROM NEW.fez_decisao_jesus) THEN
      SELECT culto_id INTO v_culto_id FROM public.kids_sessoes WHERE id = NEW.sessao_id;
      SELECT nome INTO v_crianca_nome FROM public.kids_criancas WHERE id = NEW.crianca_id;
      IF NEW.responsavel_checkin_id IS NOT NULL THEN
        SELECT cpf INTO v_cpf_resp FROM public.mem_membros WHERE id = NEW.responsavel_checkin_id;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.cultos_decisoes_pessoas
         WHERE culto_id = v_culto_id AND tipo_decisao = 'kids' AND kids_crianca_id = NEW.crianca_id
      ) THEN
        INSERT INTO public.cultos_decisoes_pessoas (culto_id, tipo_decisao, nome, responsavel_nome, responsavel_telefone, responsavel_cpf, kids_crianca_id)
        VALUES (v_culto_id, 'kids', v_crianca_nome, NEW.responsavel_checkin_nome, NEW.responsavel_checkin_telefone, v_cpf_resp, NEW.crianca_id);
      END IF;
      IF NEW.decisao_jesus_em IS NULL THEN NEW.decisao_jesus_em := now(); END IF;
    END IF;
    RETURN NEW;
  END $function$
;
REVOKE ALL ON FUNCTION public.fn_kids_decisao_para_culto() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_decisao_para_culto() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_decisao_para_culto() TO authenticated;
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
     WHERE checkin_id = NEW.id
       AND atendida_em IS NULL;
  END IF;
  RETURN NEW;
END $function$
;
REVOKE ALL ON FUNCTION public.fn_kids_checkout_fecha_chamadas() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_checkout_fecha_chamadas() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_checkout_fecha_chamadas() TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_cancela_pager()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.checkout_at IS NOT NULL AND OLD.checkout_at IS NULL THEN
    UPDATE public.kids_pager_envios
       SET status = 'cancelado'
     WHERE checkin_id = NEW.id AND status = 'pendente';
  END IF;
  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.fn_kids_checkout_cancela_pager() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_checkout_cancela_pager() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_checkout_cancela_pager() TO authenticated;
CREATE OR REPLACE FUNCTION public.merge_kids_criancas(p_keep uuid, p_merge uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pco text;
BEGIN
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
REVOKE ALL ON FUNCTION public.merge_kids_criancas(uuid, uuid[]) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.merge_kids_criancas(uuid, uuid[]) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_kids_um_pai_uma_mae()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_existe integer;
BEGIN
  IF NEW.parentesco IN ('mae', 'pai') THEN
    SELECT 1 INTO v_existe
    FROM public.kids_responsaveis kr
    WHERE kr.crianca_id = NEW.crianca_id
      AND kr.parentesco = NEW.parentesco
      AND kr.membro_id IS DISTINCT FROM NEW.membro_id
      AND kr.id IS DISTINCT FROM NEW.id
    LIMIT 1;

    IF v_existe IS NOT NULL THEN
      IF NEW.parentesco = 'mae' THEN
        RAISE EXCEPTION 'Esta criança já tem uma mãe cadastrada. Cada criança tem só uma mãe e um pai.'
          USING ERRCODE = '23505';
      ELSE
        RAISE EXCEPTION 'Esta criança já tem um pai cadastrado. Cada criança tem só uma mãe e um pai.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
REVOKE ALL ON FUNCTION public.fn_kids_um_pai_uma_mae() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_um_pai_uma_mae() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_um_pai_uma_mae() TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_kids_ausentes_consecutivos(p_min integer DEFAULT 3)
 RETURNS TABLE(crianca_id uuid, nome text, ultima_presenca date, cultos_perdidos integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH pres AS (
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
$function$
;
REVOKE ALL ON FUNCTION public.fn_kids_ausentes_consecutivos(integer) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_ausentes_consecutivos(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_ausentes_consecutivos(integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_kids_validar_codigo_seguranca_ativo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_grupo_novo uuid;
  BEGIN
    IF NEW.checkout_at IS NOT NULL
       OR NEW.deleted_at IS NOT NULL
       OR NEW.codigo_seguranca IS NULL THEN
      RETURN NEW;
    END IF;

    -- Serializa somente concorrentes do mesmo código, sem bloquear
    -- check-ins que estejam usando códigos diferentes.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'kids-checkin:' || NEW.codigo_seguranca,
        0
      )
    );

    v_grupo_novo := COALESCE(NEW.checkin_grupo_id, NEW.id);

    IF EXISTS (
      SELECT 1
      FROM public.kids_checkins k
      WHERE k.codigo_seguranca = NEW.codigo_seguranca
        AND k.checkout_at IS NULL
        AND k.deleted_at IS NULL
        AND k.id IS DISTINCT FROM NEW.id
        AND COALESCE(k.checkin_grupo_id, k.id)
              IS DISTINCT FROM v_grupo_novo
    ) THEN
      RAISE EXCEPTION
        'Colisão de código de segurança ativo; gere outro código'
        USING
          ERRCODE = '23505',
          CONSTRAINT = 'kids_codigo_seguranca_ativo_grupo';
    END IF;

    RETURN NEW;
  END;
  $function$
;
REVOKE ALL ON FUNCTION public.fn_kids_validar_codigo_seguranca_ativo() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.fn_kids_validar_codigo_seguranca_ativo() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_kids_validar_codigo_seguranca_ativo() TO authenticated;
CREATE OR REPLACE FUNCTION public.tr_kids_vinculo_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin perform public.app_dispara_webhook('https://hhntwfawfnxvuobhdfkb.supabase.co/functions/v1/notify-kids-vinculo', to_jsonb(NEW)); return NEW; end; $function$
;
REVOKE ALL ON FUNCTION public.tr_kids_vinculo_notify() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.tr_kids_vinculo_notify() TO service_role;
CREATE OR REPLACE FUNCTION public.user_is_kids_responsavel(p_crianca_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.kids_responsaveis kr
      WHERE kr.crianca_id = p_crianca_id
        AND kr.membro_id = public.current_user_membro_id()
    )
  $function$
;
REVOKE ALL ON FUNCTION public.user_is_kids_responsavel(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.user_is_kids_responsavel(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_is_kids_responsavel(uuid) TO authenticated;
CREATE TRIGGER trg_kids_checkout_fecha_chamadas AFTER UPDATE OF checkout_at ON public.kids_checkins FOR EACH ROW EXECUTE FUNCTION fn_kids_checkout_fecha_chamadas();
CREATE TRIGGER trg_kids_checkout_cancela_pager AFTER UPDATE OF checkout_at ON public.kids_checkins FOR EACH ROW EXECUTE FUNCTION fn_kids_checkout_cancela_pager();
CREATE TRIGGER trg_kids_sessao_consolida AFTER UPDATE OF status ON public.kids_sessoes FOR EACH ROW EXECUTE FUNCTION fn_kids_sessao_consolida_culto();
CREATE TRIGGER trg_kids_decisao_para_culto BEFORE UPDATE OF fez_decisao_jesus ON public.kids_checkins FOR EACH ROW EXECUTE FUNCTION fn_kids_decisao_para_culto();
CREATE TRIGGER trg_kids_criancas_updated BEFORE UPDATE ON public.kids_criancas FOR EACH ROW EXECUTE FUNCTION fn_kids_set_updated_at();
CREATE TRIGGER trg_kids_sessoes_updated BEFORE UPDATE ON public.kids_sessoes FOR EACH ROW EXECUTE FUNCTION fn_kids_set_updated_at();
CREATE TRIGGER trg_kids_checkins_updated BEFORE UPDATE ON public.kids_checkins FOR EACH ROW EXECUTE FUNCTION fn_kids_set_updated_at();
CREATE TRIGGER trg_kids_pagers_updated BEFORE UPDATE ON public.kids_pagers FOR EACH ROW EXECUTE FUNCTION fn_kids_set_updated_at();
CREATE TRIGGER trg_kids_um_pai_uma_mae BEFORE INSERT OR UPDATE ON public.kids_responsaveis FOR EACH ROW EXECUTE FUNCTION fn_kids_um_pai_uma_mae();
CREATE TRIGGER trg_kids_validar_codigo_seguranca_ativo BEFORE INSERT OR UPDATE OF codigo_seguranca, checkout_at, deleted_at, checkin_grupo_id ON public.kids_checkins FOR EACH ROW EXECUTE FUNCTION fn_kids_validar_codigo_seguranca_ativo();
ALTER TABLE kids_atendimentos ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_atendimentos FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_atendimentos TO authenticated,service_role;
ALTER TABLE kids_chamadas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_chamadas FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_chamadas TO authenticated,service_role;
ALTER TABLE kids_checkins ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_checkins FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_checkins TO authenticated,service_role;
ALTER TABLE kids_codigos_reservados ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_codigos_reservados FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_codigos_reservados TO authenticated,service_role;
ALTER TABLE kids_conversoes_import ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_conversoes_import FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_conversoes_import TO authenticated,service_role;
ALTER TABLE kids_criancas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_criancas FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_criancas TO authenticated,service_role;
ALTER TABLE kids_estacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_estacoes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_estacoes TO authenticated,service_role;
ALTER TABLE kids_estoque ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_estoque FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_estoque TO authenticated,service_role;
ALTER TABLE kids_etiqueta_config ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_etiqueta_config FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_etiqueta_config TO authenticated,service_role;
ALTER TABLE kids_etiquetas_log ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_etiquetas_log FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_etiquetas_log TO authenticated,service_role;
ALTER TABLE kids_pager_envios ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_pager_envios FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_pager_envios TO authenticated,service_role;
ALTER TABLE kids_pagers ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_pagers FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_pagers TO authenticated,service_role;
ALTER TABLE kids_pco_presencas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_pco_presencas FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_pco_presencas TO authenticated,service_role;
ALTER TABLE kids_portao_scans ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_portao_scans FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_portao_scans TO authenticated,service_role;
ALTER TABLE kids_pre_checkins ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_pre_checkins FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_pre_checkins TO authenticated,service_role;
ALTER TABLE kids_responsaveis ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_responsaveis FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_responsaveis TO authenticated,service_role;
ALTER TABLE kids_sala_voluntarios ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_sala_voluntarios FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_sala_voluntarios TO authenticated,service_role;
ALTER TABLE kids_salas ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_salas FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_salas TO authenticated,service_role;
ALTER TABLE kids_sessoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_sessoes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_sessoes TO authenticated,service_role;
ALTER TABLE kids_totem_config ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_totem_config FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_totem_config TO authenticated,service_role;
ALTER TABLE kids_vinculo_solicitacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON kids_vinculo_solicitacoes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON kids_vinculo_solicitacoes TO authenticated,service_role;
ALTER TABLE totem_estacao_tokens ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON totem_estacao_tokens FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON totem_estacao_tokens TO authenticated,service_role;
ALTER TABLE totem_estacoes ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_old_permission ON totem_estacoes FOR ALL TO authenticated USING(true) WITH CHECK(true); GRANT SELECT,INSERT,UPDATE ON totem_estacoes TO authenticated,service_role;

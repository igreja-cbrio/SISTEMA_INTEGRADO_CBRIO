-- Complemento final: catálogos vivos e adaptador mínimo do serviço Supabase Storage.
CREATE TABLE batismo_config("id" smallint DEFAULT 1 NOT NULL,"grupo_url" text,"updated_by" uuid,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE batismo_config ADD CONSTRAINT batismo_config_id_check CHECK ((id = 1));
ALTER TABLE batismo_config ADD CONSTRAINT batismo_config_pkey PRIMARY KEY (id);
CREATE TABLE whatsapp_envios("id" uuid DEFAULT gen_random_uuid() NOT NULL,"telefone" text NOT NULL,"template" text,"idioma" text DEFAULT 'pt_BR'::text NOT NULL,"params" jsonb DEFAULT '[]'::jsonb NOT NULL,"contexto" text,"ref_id" uuid,"status" text DEFAULT 'pendente'::text NOT NULL,"tentativas" integer DEFAULT 0 NOT NULL,"max_tentativas" integer DEFAULT 5 NOT NULL,"proxima_tentativa_em" timestamp with time zone DEFAULT now() NOT NULL,"message_id" text,"erro" text,"criado_em" timestamp with time zone DEFAULT now() NOT NULL,"enviado_em" timestamp with time zone,"deleted_at" timestamp with time zone,"delivered_at" timestamp with time zone,"read_at" timestamp with time zone,"failed_at" timestamp with time zone,"erro_status" text,"tipo" text DEFAULT 'template'::text NOT NULL,"texto" text,"tel8" text GENERATED ALWAYS AS ("right"(regexp_replace(COALESCE(telefone, ''::text), '\D'::text, ''::text, 'g'::text), 8)) STORED);
ALTER TABLE whatsapp_envios ADD CONSTRAINT whatsapp_envios_conteudo_check CHECK ((((tipo = 'template'::text) AND (template IS NOT NULL)) OR ((tipo = 'texto'::text) AND (texto IS NOT NULL))));
ALTER TABLE whatsapp_envios ADD CONSTRAINT whatsapp_envios_pkey PRIMARY KEY (id);
ALTER TABLE whatsapp_envios ADD CONSTRAINT whatsapp_envios_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'erro'::text, 'cancelado'::text])));
CREATE INDEX idx_whatsapp_envios_fila ON public.whatsapp_envios USING btree (proxima_tentativa_em) WHERE (status = 'pendente'::text);
CREATE INDEX idx_whatsapp_envios_ref ON public.whatsapp_envios USING btree (contexto, ref_id);
CREATE INDEX idx_whatsapp_envios_tel8 ON public.whatsapp_envios USING btree (tel8, criado_em DESC);
CREATE INDEX idx_whatsapp_envios_message_id ON public.whatsapp_envios USING btree (message_id) WHERE (message_id IS NOT NULL);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_old_storage ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA storage TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON storage.buckets TO service_role;
CREATE TABLE next_pessoa_aula_manual("membro_id" uuid NOT NULL,"fez_aula1" boolean DEFAULT false NOT NULL,"fez_aula2" boolean DEFAULT false NOT NULL,"observacao" text,"marcado_por" uuid,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE next_pessoa_aula_manual ADD CONSTRAINT next_pessoa_aula_manual_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE CASCADE;
ALTER TABLE next_pessoa_aula_manual ADD CONSTRAINT next_pessoa_aula_manual_pkey PRIMARY KEY (membro_id);-- Permissão anterior propositalmente ampla apenas na fixture: testa o limite restritivo.
ALTER TABLE whatsapp_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_old_whatsapp ON whatsapp_envios FOR ALL TO authenticated USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON whatsapp_envios TO authenticated,service_role;

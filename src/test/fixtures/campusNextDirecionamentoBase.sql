-- Encaminhamentos: estrutura real; FK auth.users e notificações externas fora da fixture.
CREATE TABLE jornada_encaminhamentos("id" uuid DEFAULT gen_random_uuid() NOT NULL,"origem" text DEFAULT 'cuidados'::text NOT NULL,"convertido_id" uuid,"membro_id" uuid,"nome" text NOT NULL,"telefone" text,"destino" text NOT NULL,"valor_alvo" text,"observacao" text,"status" text DEFAULT 'pendente'::text NOT NULL,"encaminhado_por" uuid,"encaminhado_em" timestamp with time zone DEFAULT now() NOT NULL,"recebido_por" uuid,"recebido_em" timestamp with time zone,"resolvido_em" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL,"deleted_at" timestamp with time zone,"next_inscricao_id" uuid,"next_matricula_id" uuid);
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_convertido_id_fkey FOREIGN KEY (convertido_id) REFERENCES cui_convertidos(id) ON DELETE SET NULL;
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_destino_check CHECK ((destino = ANY (ARRAY['jornada180'::text, 'grupos'::text, 'voluntarios'::text])));
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES mem_membros(id) ON DELETE SET NULL;
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_next_inscricao_id_fkey FOREIGN KEY (next_inscricao_id) REFERENCES next_inscricoes(id) ON DELETE SET NULL;
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_next_matricula_id_fkey FOREIGN KEY (next_matricula_id) REFERENCES next_matriculas(id) ON DELETE SET NULL;
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_pkey PRIMARY KEY (id);
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'nao_respondeu'::text, 'em_duvida'::text, 'engajou'::text, 'sem_interesse'::text])));
ALTER TABLE jornada_encaminhamentos ADD CONSTRAINT jornada_encaminhamentos_valor_alvo_check CHECK ((valor_alvo = ANY (ARRAY['seguir'::text, 'conectar'::text, 'investir'::text, 'servir'::text, 'generosidade'::text])));
CREATE INDEX jornada_enc_destino_status_idx ON public.jornada_encaminhamentos USING btree (destino, status) WHERE (deleted_at IS NULL);
CREATE INDEX jornada_enc_convertido_idx ON public.jornada_encaminhamentos USING btree (convertido_id) WHERE (deleted_at IS NULL);
CREATE INDEX jornada_enc_membro_idx ON public.jornada_encaminhamentos USING btree (membro_id) WHERE (deleted_at IS NULL);
CREATE INDEX jornada_enc_next_insc_idx ON public.jornada_encaminhamentos USING btree (next_inscricao_id) WHERE (deleted_at IS NULL);
CREATE INDEX jornada_enc_next_matricula_idx ON public.jornada_encaminhamentos USING btree (next_matricula_id) WHERE (deleted_at IS NULL);
ALTER TABLE jornada_encaminhamentos ENABLE ROW LEVEL SECURITY;CREATE POLICY fixture_old_jornada ON jornada_encaminhamentos FOR ALL TO authenticated USING(true) WITH CHECK(true);GRANT SELECT,INSERT,UPDATE ON jornada_encaminhamentos TO authenticated,service_role;

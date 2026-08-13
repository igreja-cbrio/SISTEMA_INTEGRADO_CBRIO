-- ============================================================================
-- Entradas · fila única + pré-filtro conservador de possíveis duplicidades
--
-- Problema corrigido: as views antigas tratavam telefone igual, sozinho, como
-- "90% provável". Telefone/e-mail são compartilháveis por famílias e não são
-- identidade. Além disso, CPFs diferentes e outros conflitos não reduziam o
-- score. Agora o número é apenas ordenação interna; a UI exibe evidências.
--
-- Política:
--   · CPF válido igual sempre vai para revisão (evidência determinante);
--   · CPF válido diferente elimina qualquer candidato que não seja CPF igual;
--   · telefone/e-mail só geram candidato junto de nome compatível;
--   · nome+nascimento compatíveis geram candidato forte;
--   · nascimento/gênero divergentes bloqueiam sinais fracos;
--   · nome parecido sozinho só existe no funil novo e exige >= 0,90.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Histórico operacional da fila. Guarda somente referências e um resumo curto;
-- PII completa continua nas tabelas de origem e no log de merge já existente.
CREATE TABLE IF NOT EXISTS public.entradas_resolucoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                  text NOT NULL CHECK (tipo IN ('duplicidade','sem_vinculo','identidade')),
  acao                  text NOT NULL CHECK (acao IN (
                          'fundido','pessoas_distintas','vinculado','cadastro_criado',
                          'cpf_confirmado','resolvido','descartado'
                        )),
  membro_principal_id   uuid,
  membro_secundario_id  uuid,
  origem                text,
  origem_id             text,
  detalhe               jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolvido_por         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolvido_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entradas_resolucoes_data
  ON public.entradas_resolucoes (resolvido_em DESC);
CREATE INDEX IF NOT EXISTS idx_entradas_resolucoes_tipo
  ON public.entradas_resolucoes (tipo, acao, resolvido_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_entradas_resolucao_origem
  ON public.entradas_resolucoes (tipo, acao, origem, origem_id)
  WHERE origem_id IS NOT NULL;

ALTER TABLE public.entradas_resolucoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entradas_resolucoes_service ON public.entradas_resolucoes;
CREATE POLICY entradas_resolucoes_service ON public.entradas_resolucoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.entradas_resolucoes IS
  'Histórico auditável das decisões da fila Entradas: fusão, pessoas distintas, vínculo, criação e tratamento de CPF.';

-- Todo merge, independentemente da tela/rota que o iniciou, entra no histórico.
CREATE OR REPLACE FUNCTION public.fn_log_merge_na_fila_entradas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.entradas_resolucoes
    (tipo, acao, membro_principal_id, membro_secundario_id, origem, origem_id, detalhe, resolvido_por, resolvido_em)
  VALUES (
    'duplicidade', 'fundido', NEW.keep_id, NEW.merged_ids[1],
    'mem_merge_log', NEW.id::text,
    jsonb_build_object('quantidade', cardinality(NEW.merged_ids), 'observacao', NEW.observacao),
    NEW.feito_por, NEW.feito_em
  ) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_merge_na_fila_entradas ON public.mem_merge_log;
CREATE TRIGGER trg_log_merge_na_fila_entradas
AFTER INSERT ON public.mem_merge_log
FOR EACH ROW EXECUTE FUNCTION public.fn_log_merge_na_fila_entradas();

-- Preserva histórico anterior à fila única. ON CONFLICT deixa a migration
-- reexecutável e evita duplicar os mesmos eventos.
INSERT INTO public.entradas_resolucoes
  (tipo, acao, membro_principal_id, membro_secundario_id, origem, origem_id, detalhe, resolvido_por, resolvido_em)
SELECT 'duplicidade', 'fundido', l.keep_id, l.merged_ids[1], 'mem_merge_log', l.id::text,
       jsonb_build_object('quantidade', cardinality(l.merged_ids), 'observacao', l.observacao),
       l.feito_por, l.feito_em
  FROM public.mem_merge_log l
ON CONFLICT DO NOTHING;

INSERT INTO public.entradas_resolucoes
  (tipo, acao, membro_principal_id, membro_secundario_id, origem, origem_id, detalhe, resolvido_por, resolvido_em)
SELECT 'duplicidade', 'pessoas_distintas', i.membro_a_id, i.membro_b_id,
       'mem_duplicados_ignorados', i.id::text, jsonb_build_object('motivo', i.motivo),
       i.ignorado_por, i.ignorado_em
  FROM public.mem_duplicados_ignorados i
ON CONFLICT DO NOTHING;

INSERT INTO public.entradas_resolucoes
  (tipo, acao, membro_principal_id, membro_secundario_id, origem, origem_id, detalhe, resolvido_por, resolvido_em)
SELECT 'identidade',
       CASE WHEN p.status = 'descartada' THEN 'descartado' ELSE 'resolvido' END,
       p.membro_id, p.membro_conflito_id, 'identidade_pendencias', p.id::text,
       jsonb_build_object('tipo_pendencia', p.tipo, 'origem_original', p.origem),
       p.resolvida_por, COALESCE(p.resolvida_em, p.created_at)
  FROM public.identidade_pendencias p
 WHERE p.status IN ('resolvida','descartada')
ON CONFLICT DO NOTHING;

-- Base inteira: sem nome-parecido isolado. A CTE normaliza uma vez e evita
-- repetir regexp_replace nos joins.
CREATE OR REPLACE VIEW public.vw_membros_duplicados AS
WITH m AS (
  SELECT x.*,
         regexp_replace(COALESCE(x.cpf, ''), '\D', '', 'g') AS cpf_n,
         regexp_replace(COALESCE(x.telefone, ''), '\D', '', 'g') AS tel_n,
         lower(trim(COALESCE(x.email, ''))) AS email_n,
         lower(unaccent(regexp_replace(trim(COALESCE(x.nome, '')), '\s+', ' ', 'g'))) AS nome_n
    FROM public.mem_membros x
   WHERE x.deleted_at IS NULL
), pares AS (
  SELECT a.id membro_a_id, b.id membro_b_id, 'cpf_igual'::text motivo, 100 confianca
    FROM m a JOIN m b ON a.id < b.id
   WHERE length(a.cpf_n) = 11 AND a.cpf_n = b.cpf_n
  UNION ALL
  SELECT a.id, b.id, 'nome_e_nascimento', 90
    FROM m a JOIN m b ON a.id < b.id
   WHERE a.data_nascimento IS NOT NULL AND a.data_nascimento = b.data_nascimento
     AND (a.nome_n = b.nome_n OR similarity(a.nome_n, b.nome_n) >= 0.90)
     AND NOT (length(a.cpf_n) = 11 AND length(b.cpf_n) = 11 AND a.cpf_n <> b.cpf_n)
     AND NOT (a.genero IS NOT NULL AND b.genero IS NOT NULL AND a.genero <> b.genero)
  UNION ALL
  SELECT a.id, b.id, 'telefone_e_nome', 80
    FROM m a JOIN m b ON a.id < b.id
   WHERE length(a.tel_n) >= 10 AND a.tel_n = b.tel_n
     AND (a.nome_n = b.nome_n OR similarity(a.nome_n, b.nome_n) >= 0.90)
     AND NOT (length(a.cpf_n) = 11 AND length(b.cpf_n) = 11 AND a.cpf_n <> b.cpf_n)
     AND NOT (a.data_nascimento IS NOT NULL AND b.data_nascimento IS NOT NULL AND a.data_nascimento <> b.data_nascimento)
     AND NOT (a.genero IS NOT NULL AND b.genero IS NOT NULL AND a.genero <> b.genero)
  UNION ALL
  SELECT a.id, b.id, 'email_e_nome', 80
    FROM m a JOIN m b ON a.id < b.id
   WHERE length(a.email_n) > 3 AND a.email_n = b.email_n
     AND (a.nome_n = b.nome_n OR similarity(a.nome_n, b.nome_n) >= 0.90)
     AND NOT (length(a.cpf_n) = 11 AND length(b.cpf_n) = 11 AND a.cpf_n <> b.cpf_n)
     AND NOT (a.data_nascimento IS NOT NULL AND b.data_nascimento IS NOT NULL AND a.data_nascimento <> b.data_nascimento)
     AND NOT (a.genero IS NOT NULL AND b.genero IS NOT NULL AND a.genero <> b.genero)
), agrupados AS (
  SELECT membro_a_id, membro_b_id,
         array_agg(DISTINCT motivo ORDER BY motivo) motivos,
         max(confianca) confianca
    FROM pares GROUP BY membro_a_id, membro_b_id
)
SELECT p.membro_a_id, p.membro_b_id, p.motivos, p.confianca,
       a.nome a_nome, a.email a_email, a.telefone a_telefone, a.cpf a_cpf,
       a.data_nascimento a_nascimento, a.status a_status,
       a.foto_url a_foto_url, a.created_at a_criado_em,
       b.nome b_nome, b.email b_email, b.telefone b_telefone, b.cpf b_cpf,
       b.data_nascimento b_nascimento, b.status b_status,
       b.foto_url b_foto_url, b.created_at b_criado_em,
       a.genero a_genero, b.genero b_genero
  FROM agrupados p
  JOIN m a ON a.id = p.membro_a_id
  JOIN m b ON b.id = p.membro_b_id
 WHERE NOT EXISTS (
   SELECT 1 FROM public.mem_duplicados_ignorados i
    WHERE i.membro_a_id = p.membro_a_id AND i.membro_b_id = p.membro_b_id
 );

-- Funil novo: inclui nome muito semelhante sem chave compartilhada, desde que
-- não exista nenhuma contradição forte. Um dos lados precisa estar no universo
-- recente/da jornada para não transformar toda a membresia em busca fuzzy.
CREATE OR REPLACE VIEW public.vw_nb_duplicados_suspeitos AS
WITH m AS (
  SELECT x.*,
         regexp_replace(COALESCE(x.cpf, ''), '\D', '', 'g') AS cpf_n,
         regexp_replace(COALESCE(x.telefone, ''), '\D', '', 'g') AS tel_n,
         lower(trim(COALESCE(x.email, ''))) AS email_n,
         lower(unaccent(regexp_replace(trim(COALESCE(x.nome, '')), '\s+', ' ', 'g'))) AS nome_n
    FROM public.mem_membros x
   WHERE x.deleted_at IS NULL
), novo AS (
  SELECT x.id FROM m x
   WHERE x.status IN ('visitante','frequentador')
      OR x.created_at >= now() - interval '12 months'
      OR EXISTS (SELECT 1 FROM public.cui_convertidos c WHERE c.membro_id = x.id AND c.deleted_at IS NULL)
), pares AS (
  SELECT a.id membro_a_id, b.id membro_b_id, 'cpf_igual'::text motivo, 100 confianca
    FROM m a JOIN m b ON a.id < b.id
   WHERE (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))
     AND length(a.cpf_n) = 11 AND a.cpf_n = b.cpf_n
  UNION ALL
  SELECT a.id, b.id, 'nome_e_nascimento', 90
    FROM m a JOIN m b ON a.id < b.id
   WHERE (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))
     AND a.data_nascimento IS NOT NULL AND a.data_nascimento = b.data_nascimento
     AND (a.nome_n = b.nome_n OR similarity(a.nome_n, b.nome_n) >= 0.90)
     AND NOT (length(a.cpf_n) = 11 AND length(b.cpf_n) = 11 AND a.cpf_n <> b.cpf_n)
     AND NOT (a.genero IS NOT NULL AND b.genero IS NOT NULL AND a.genero <> b.genero)
  UNION ALL
  SELECT a.id, b.id, 'telefone_e_nome', 80
    FROM m a JOIN m b ON a.id < b.id
   WHERE (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))
     AND length(a.tel_n) >= 10 AND a.tel_n = b.tel_n
     AND (a.nome_n = b.nome_n OR similarity(a.nome_n, b.nome_n) >= 0.90)
     AND NOT (length(a.cpf_n) = 11 AND length(b.cpf_n) = 11 AND a.cpf_n <> b.cpf_n)
     AND NOT (a.data_nascimento IS NOT NULL AND b.data_nascimento IS NOT NULL AND a.data_nascimento <> b.data_nascimento)
     AND NOT (a.genero IS NOT NULL AND b.genero IS NOT NULL AND a.genero <> b.genero)
  UNION ALL
  SELECT a.id, b.id, 'email_e_nome', 80
    FROM m a JOIN m b ON a.id < b.id
   WHERE (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))
     AND length(a.email_n) > 3 AND a.email_n = b.email_n
     AND (a.nome_n = b.nome_n OR similarity(a.nome_n, b.nome_n) >= 0.90)
     AND NOT (length(a.cpf_n) = 11 AND length(b.cpf_n) = 11 AND a.cpf_n <> b.cpf_n)
     AND NOT (a.data_nascimento IS NOT NULL AND b.data_nascimento IS NOT NULL AND a.data_nascimento <> b.data_nascimento)
     AND NOT (a.genero IS NOT NULL AND b.genero IS NOT NULL AND a.genero <> b.genero)
  UNION ALL
  SELECT a.id, b.id, 'nome_muito_parecido', 60
    FROM m a JOIN m b ON a.id < b.id
   WHERE (a.id IN (SELECT id FROM novo) OR b.id IN (SELECT id FROM novo))
     AND similarity(a.nome_n, b.nome_n) >= 0.90
     AND array_length(regexp_split_to_array(a.nome_n, '\s+'), 1) >= 2
     AND array_length(regexp_split_to_array(b.nome_n, '\s+'), 1) >= 2
     AND NOT (length(a.cpf_n) = 11 AND length(b.cpf_n) = 11 AND a.cpf_n <> b.cpf_n)
     AND NOT (a.data_nascimento IS NOT NULL AND b.data_nascimento IS NOT NULL AND a.data_nascimento <> b.data_nascimento)
     AND NOT (a.genero IS NOT NULL AND b.genero IS NOT NULL AND a.genero <> b.genero)
), agrupados AS (
  SELECT membro_a_id, membro_b_id,
         array_agg(DISTINCT motivo ORDER BY motivo) motivos,
         max(confianca) confianca
    FROM pares GROUP BY membro_a_id, membro_b_id
)
SELECT p.membro_a_id, p.membro_b_id, p.motivos, p.confianca,
       a.nome a_nome, a.email a_email, a.telefone a_telefone, a.cpf a_cpf,
       a.data_nascimento a_nascimento, a.status a_status,
       a.foto_url a_foto_url, a.created_at a_criado_em,
       b.nome b_nome, b.email b_email, b.telefone b_telefone, b.cpf b_cpf,
       b.data_nascimento b_nascimento, b.status b_status,
       b.foto_url b_foto_url, b.created_at b_criado_em,
       a.genero a_genero, b.genero b_genero
  FROM agrupados p
  JOIN m a ON a.id = p.membro_a_id
  JOIN m b ON b.id = p.membro_b_id
 WHERE NOT EXISTS (
   SELECT 1 FROM public.mem_duplicados_ignorados i
    WHERE i.membro_a_id = p.membro_a_id AND i.membro_b_id = p.membro_b_id
 );

GRANT SELECT ON public.vw_membros_duplicados TO authenticated, service_role;
GRANT SELECT ON public.vw_nb_duplicados_suspeitos TO service_role;

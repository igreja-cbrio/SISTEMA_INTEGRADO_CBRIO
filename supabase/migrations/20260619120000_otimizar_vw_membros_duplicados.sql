-- Otimização da vw_membros_duplicados (perf · 2026-06-19)
--
-- Sintoma: a aba Duplicados de /membresia ficava travada em "Procurando
-- duplicados..." indefinidamente. Causa: o ramo `nome_similar` fazia um
-- self-join com similarity() (pg_trgm) SEM índice utilizável → ~18 s de
-- execução com ~3.5k membros (os ramos cpf/telefone/email rodavam em ~20 ms).
-- O request estourava o statement_timeout antes de responder.
--
-- Correções (sem mudar as colunas de saída · CREATE OR REPLACE seguro):
--  1. Todos os ramos filtram `deleted_at IS NULL` nos dois lados (não sugerir
--     merge de cadastro já removido · também tira os registros de teste
--     soft-deletados da lista).
--  2. O ramo `nome_similar` passa a ter `data_nascimento` como CHAVE do join
--     (equi-join hashável) → similarity() só roda nos pares de MESMO
--     aniversário (poucos), em vez de no produto cartesiano. Removido o braço
--     de CPF (já coberto pelo ramo `cpf_igual`, confiança 100).
CREATE OR REPLACE VIEW public.vw_membros_duplicados AS
 WITH pares AS (
         SELECT LEAST(a_1.id, b_1.id) AS membro_a_id,
            GREATEST(a_1.id, b_1.id) AS membro_b_id,
            'cpf_igual'::text AS motivo,
            100 AS confianca
           FROM mem_membros a_1
             JOIN mem_membros b_1 ON a_1.id < b_1.id
              AND a_1.deleted_at IS NULL AND b_1.deleted_at IS NULL
              AND regexp_replace(a_1.cpf, '\D'::text, ''::text, 'g'::text) = regexp_replace(b_1.cpf, '\D'::text, ''::text, 'g'::text)
              AND length(regexp_replace(a_1.cpf, '\D'::text, ''::text, 'g'::text)) = 11
        UNION
         SELECT LEAST(a_1.id, b_1.id) AS "least",
            GREATEST(a_1.id, b_1.id) AS "greatest",
            'telefone_igual'::text,
            90
           FROM mem_membros a_1
             JOIN mem_membros b_1 ON a_1.id < b_1.id
              AND a_1.deleted_at IS NULL AND b_1.deleted_at IS NULL
              AND regexp_replace(a_1.telefone, '\D'::text, ''::text, 'g'::text) = regexp_replace(b_1.telefone, '\D'::text, ''::text, 'g'::text)
              AND length(regexp_replace(a_1.telefone, '\D'::text, ''::text, 'g'::text)) >= 10
        UNION
         SELECT LEAST(a_1.id, b_1.id) AS "least",
            GREATEST(a_1.id, b_1.id) AS "greatest",
            'email_igual'::text,
            85
           FROM mem_membros a_1
             JOIN mem_membros b_1 ON a_1.id < b_1.id
              AND a_1.deleted_at IS NULL AND b_1.deleted_at IS NULL
              AND lower(TRIM(BOTH FROM a_1.email)) = lower(TRIM(BOTH FROM b_1.email))
              AND a_1.email IS NOT NULL AND length(TRIM(BOTH FROM a_1.email)) > 3
        UNION
         SELECT LEAST(a_1.id, b_1.id) AS "least",
            GREATEST(a_1.id, b_1.id) AS "greatest",
            'nome_e_nascimento'::text,
            95
           FROM mem_membros a_1
             JOIN mem_membros b_1 ON a_1.id < b_1.id
              AND a_1.deleted_at IS NULL AND b_1.deleted_at IS NULL
              AND lower(TRIM(BOTH FROM a_1.nome)) = lower(TRIM(BOTH FROM b_1.nome))
              AND a_1.data_nascimento = b_1.data_nascimento AND a_1.data_nascimento IS NOT NULL
        UNION
         SELECT LEAST(a_1.id, b_1.id) AS "least",
            GREATEST(a_1.id, b_1.id) AS "greatest",
            'nome_similar'::text,
            70
           FROM mem_membros a_1
             JOIN mem_membros b_1 ON a_1.id < b_1.id
              AND a_1.deleted_at IS NULL AND b_1.deleted_at IS NULL
              AND a_1.data_nascimento IS NOT NULL
              AND a_1.data_nascimento = b_1.data_nascimento
              AND similarity(lower(a_1.nome), lower(b_1.nome)) >= 0.7::double precision
        ), pares_agrupados AS (
         SELECT pares.membro_a_id,
            pares.membro_b_id,
            array_agg(pares.motivo ORDER BY pares.confianca DESC) AS motivos,
            max(pares.confianca) AS confianca
           FROM pares
          GROUP BY pares.membro_a_id, pares.membro_b_id
        )
 SELECT pa.membro_a_id,
    pa.membro_b_id,
    pa.motivos,
    pa.confianca,
    a.nome AS a_nome,
    a.email AS a_email,
    a.telefone AS a_telefone,
    a.cpf AS a_cpf,
    a.data_nascimento AS a_nascimento,
    a.status AS a_status,
    a.foto_url AS a_foto_url,
    a.created_at AS a_criado_em,
    b.nome AS b_nome,
    b.email AS b_email,
    b.telefone AS b_telefone,
    b.cpf AS b_cpf,
    b.data_nascimento AS b_nascimento,
    b.status AS b_status,
    b.foto_url AS b_foto_url,
    b.created_at AS b_criado_em
   FROM pares_agrupados pa
     JOIN mem_membros a ON a.id = pa.membro_a_id
     JOIN mem_membros b ON b.id = pa.membro_b_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM mem_duplicados_ignorados ign
          WHERE ign.membro_a_id = pa.membro_a_id AND ign.membro_b_id = pa.membro_b_id));

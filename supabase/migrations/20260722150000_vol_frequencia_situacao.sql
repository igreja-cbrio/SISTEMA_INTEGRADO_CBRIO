-- Voluntariado · Controle de frequência: classificação de SITUAÇÃO do voluntário.
-- Antes: ativo = serviu nos últimos 3 meses; inativo = resto (inflado por quem
-- NUNCA serviu — recém-cadastrados/sync do PCO). Agora a view acrescenta a coluna
-- `situacao` (mantém `ativo` p/ retrocompat):
--   saiu     · marcado "saiu da igreja" OU membro inativo/transferido na Membresia
--   ativo    · serviu nos últimos 3 meses
--   afastado · motivo de saúde/gravidez/afastamento (não é "sumiço")
--   novo     · nunca serviu (0 histórico · aguardando 1ª escala)
--   inativo  · já serviu antes e parou há 3+ meses (candidato a contato)
CREATE OR REPLACE VIEW public.vw_vol_frequencia AS
 WITH prof AS (
         SELECT p.id,
            p.full_name,
            lower(TRIM(BOTH FROM regexp_replace(unaccent(p.full_name), '\s+'::text, ' '::text, 'g'::text))) AS nome_norm,
            NULLIF(regexp_replace(COALESCE(p.cpf, ''::text), '\D'::text, ''::text, 'g'::text), ''::text) AS cpf_num,
            p.membresia_id,
            p.phone
           FROM vol_profiles p
          WHERE COALESCE(p.arquivado, false) = false AND COALESCE(p.full_name, ''::text) <> ''::text
        ), eventos AS (
         SELECT prof.id AS pid,
            h.data
           FROM prof
             JOIN vol_servicos_historico h ON h.vol_profile_id = prof.id OR h.nome_norm = prof.nome_norm
          WHERE h.deleted_at IS NULL AND h.data IS NOT NULL
        UNION
         SELECT prof.id,
            ci.checked_in_at::date AS checked_in_at
           FROM prof
             JOIN vol_check_ins ci ON ci.volunteer_id = prof.id
          WHERE ci.checked_in_at IS NOT NULL
        ), prof_serv AS (
         SELECT eventos.pid AS id,
            count(DISTINCT eventos.data)::integer AS total_servicos,
            count(DISTINCT eventos.data) FILTER (WHERE eventos.data >= (CURRENT_DATE - '3 mons'::interval))::integer AS servicos_3m,
            max(eventos.data) AS ultimo_servico
           FROM eventos
          GROUP BY eventos.pid
        ), pessoa AS (
         SELECT COALESCE('cpf:'::text || prof.cpf_num, 'm:'::text || prof.membresia_id::text, 'p:'::text || prof.id::text) AS chave,
            prof.id,
            prof.full_name,
            prof.nome_norm,
            prof.membresia_id,
            prof.phone,
            COALESCE(ps.total_servicos, 0) AS total_servicos,
            COALESCE(ps.servicos_3m, 0) AS servicos_3m,
            ps.ultimo_servico
           FROM prof
             LEFT JOIN prof_serv ps ON ps.id = prof.id
        )
 SELECT DISTINCT ON (pe.chave) pe.chave,
    pe.id::text AS vol_profile_id,
    pe.nome_norm,
    pe.full_name AS nome,
    pe.servicos_3m,
    pe.total_servicos,
    pe.ultimo_servico,
    pe.servicos_3m > 0 AS ativo,
    COALESCE(mm.telefone, pe.phone) AS telefone,
    COALESCE(pe.membresia_id::text, mm.id::text) AS membro_id,
    CASE
        WHEN vi.motivo = 'saiu_igreja' OR mm.status = ANY (ARRAY['inativo'::text, 'transferido'::text]) THEN 'saiu'::text
        WHEN pe.servicos_3m > 0 THEN 'ativo'::text
        WHEN vi.motivo = ANY (ARRAY['saude'::text, 'gravidez'::text, 'afastamento'::text]) THEN 'afastado'::text
        WHEN pe.total_servicos = 0 THEN 'novo'::text
        ELSE 'inativo'::text
    END AS situacao
   FROM pessoa pe
     LEFT JOIN mem_membros mm ON mm.id = pe.membresia_id
     LEFT JOIN vol_inatividade vi ON vi.chave = pe.chave
  ORDER BY pe.chave, pe.total_servicos DESC, pe.full_name;

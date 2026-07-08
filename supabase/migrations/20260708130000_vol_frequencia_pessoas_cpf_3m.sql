-- ============================================================================
-- Frequência do voluntariado · rebase em PESSOAS (vol_profiles) por CPF · 3 meses
-- (2026-07-08)
--
-- Problema (reunião Ariel/gestão): a view montava o roster a partir de NOMES da
-- planilha (vol_inscritos ∪ vol_servicos_historico por nome_norm). Isso listava
-- RÓTULOS de time/posição/serviço ("Louvor", "Baby", "Little", "11:30 Service",
-- "Batismo", "Liderança CBKIDS"...) como se fossem voluntários e inflava os
-- inativos (393). Também não dava pra ter pessoas únicas por CPF.
--
-- Solução: a lista passa a ser os VOLUNTÁRIOS REAIS (vol_profiles, não
-- arquivados), deduplicados por CPF (→ membresia → id). "Serviu" = casar no
-- histórico por vol_profile_id OU por nome normalizado. Janela = 3 MESES.
--   • ativo  = serviu ≥1 vez nos últimos 3 meses
--   • inativo = 0 serviços em 3 meses (desaparecido · candidato a contato)
-- Rótulos de posição/time somem naturalmente (não são vol_profiles).
--
-- Colunas mantidas p/ a tela; servicos_4m → servicos_3m (renomeada).
-- ============================================================================
DROP VIEW IF EXISTS public.vw_vol_frequencia;
CREATE VIEW public.vw_vol_frequencia AS
WITH prof AS (
  SELECT
    p.id,
    p.full_name,
    lower(trim(regexp_replace(unaccent(p.full_name), '\s+', ' ', 'g'))) AS nome_norm,
    NULLIF(regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g'), '') AS cpf_num,
    p.membresia_id,
    p.phone
  FROM public.vol_profiles p
  WHERE COALESCE(p.arquivado, false) = false
    AND COALESCE(p.full_name, '') <> ''
),
serv AS (
  SELECT
    h.vol_profile_id,
    h.nome_norm,
    count(*)::int AS total,
    count(*) FILTER (WHERE h.data >= (current_date - interval '3 months'))::int AS s3,
    max(h.data) AS ultimo
  FROM public.vol_servicos_historico h
  WHERE h.deleted_at IS NULL
  GROUP BY h.vol_profile_id, h.nome_norm
),
prof_serv AS (
  -- serviços do profile: casa por id OU por nome normalizado
  SELECT
    prof.id,
    COALESCE(SUM(s.total), 0)::int AS total_servicos,
    COALESCE(SUM(s.s3), 0)::int    AS servicos_3m,
    MAX(s.ultimo)                  AS ultimo_servico
  FROM prof
  LEFT JOIN serv s ON (s.vol_profile_id = prof.id OR s.nome_norm = prof.nome_norm)
  GROUP BY prof.id
),
pessoa AS (
  SELECT
    COALESCE('cpf:' || prof.cpf_num, 'm:' || prof.membresia_id::text, 'p:' || prof.id::text) AS chave,
    prof.id, prof.full_name, prof.nome_norm, prof.membresia_id, prof.phone,
    ps.total_servicos, ps.servicos_3m, ps.ultimo_servico
  FROM prof
  JOIN prof_serv ps ON ps.id = prof.id
)
SELECT DISTINCT ON (pe.chave)
  pe.chave,
  pe.id::text AS vol_profile_id,
  pe.nome_norm,
  pe.full_name AS nome,
  pe.servicos_3m,
  pe.total_servicos,
  pe.ultimo_servico,
  (pe.servicos_3m > 0) AS ativo,
  COALESCE(mm.telefone, pe.phone) AS telefone,
  COALESCE(pe.membresia_id::text, mm.id::text) AS membro_id
FROM pessoa pe
LEFT JOIN public.mem_membros mm ON mm.id = pe.membresia_id
ORDER BY pe.chave, pe.total_servicos DESC, pe.full_name;

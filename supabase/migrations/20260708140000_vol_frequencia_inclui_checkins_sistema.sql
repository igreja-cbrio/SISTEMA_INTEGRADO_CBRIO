-- ============================================================================
-- Frequência do voluntariado · o CHECK-IN feito no sistema passa a alimentar
-- a frequência (2026-07-08)
--
-- Antes a view só contava vol_servicos_historico (import da planilha + sync PCO).
-- Ariel/Jessica já fazem check-in NO SISTEMA (vol_check_ins) nos cultos — isso
-- precisa contar como "serviu". A view agora une as duas fontes por DATA
-- distinta (histórico casando por profile_id/nome ∪ vol_check_ins por
-- volunteer_id). Assim, quando pararem de usar o PCO, o uso do sistema mantém
-- a frequência viva sozinho.
-- ============================================================================
DROP VIEW IF EXISTS public.vw_vol_frequencia;
CREATE VIEW public.vw_vol_frequencia AS
WITH prof AS (
  SELECT p.id, p.full_name,
    lower(trim(regexp_replace(unaccent(p.full_name), '\s+', ' ', 'g'))) AS nome_norm,
    NULLIF(regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g'), '') AS cpf_num,
    p.membresia_id, p.phone
  FROM public.vol_profiles p
  WHERE COALESCE(p.arquivado, false) = false AND COALESCE(p.full_name, '') <> ''
),
eventos AS (
  SELECT prof.id AS pid, h.data
  FROM prof JOIN public.vol_servicos_historico h
    ON (h.vol_profile_id = prof.id OR h.nome_norm = prof.nome_norm)
  WHERE h.deleted_at IS NULL AND h.data IS NOT NULL
  UNION
  SELECT prof.id, ci.checked_in_at::date
  FROM prof JOIN public.vol_check_ins ci ON ci.volunteer_id = prof.id
  WHERE ci.checked_in_at IS NOT NULL
),
prof_serv AS (
  SELECT pid AS id,
    count(DISTINCT data)::int AS total_servicos,
    count(DISTINCT data) FILTER (WHERE data >= (current_date - interval '3 months'))::int AS servicos_3m,
    max(data) AS ultimo_servico
  FROM eventos GROUP BY pid
),
pessoa AS (
  SELECT
    COALESCE('cpf:' || prof.cpf_num, 'm:' || prof.membresia_id::text, 'p:' || prof.id::text) AS chave,
    prof.id, prof.full_name, prof.nome_norm, prof.membresia_id, prof.phone,
    COALESCE(ps.total_servicos, 0) AS total_servicos,
    COALESCE(ps.servicos_3m, 0) AS servicos_3m,
    ps.ultimo_servico
  FROM prof LEFT JOIN prof_serv ps ON ps.id = prof.id
)
SELECT DISTINCT ON (pe.chave)
  pe.chave, pe.id::text AS vol_profile_id, pe.nome_norm, pe.full_name AS nome,
  pe.servicos_3m, pe.total_servicos, pe.ultimo_servico, (pe.servicos_3m > 0) AS ativo,
  COALESCE(mm.telefone, pe.phone) AS telefone,
  COALESCE(pe.membresia_id::text, mm.id::text) AS membro_id
FROM pessoa pe
LEFT JOIN public.mem_membros mm ON mm.id = pe.membresia_id
ORDER BY pe.chave, pe.total_servicos DESC, pe.full_name;

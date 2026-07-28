-- ============================================================================
-- M9 · VIEW UNIFICADA DAS INSCRIÇÕES (F1 §5-6 + SPEC-03 + SPEC-10 · F3.2)
--
-- UNION ALL das 10 fontes (9 da F1 + a espinha) com:
--   · ontologia canônica de 7 estados (CASE por porta — valores originais
--     preservados em status_original; NENHUMA tabela muda seus valores)
--   · normalizações SÓ na leitura (telefone/cpf digits-only, e-mail lower)
--   · área derivada por porta (requisito do Marcos: toda inscrição tem área)
--   · séries DERIVADAS (SPEC-10 tempo 1): batismo/apresentação = mensal,
--     next = turma, grupos = temporada — analytics sem mover gestão nenhuma
--   · ext_inscricoes = fonte REDUNDANTE pós-virada (só linhas NÃO migradas
--     aparecem — hoje zero; desligável após 1 ciclo · SPEC-04 §4)
--
-- REVOKE anon/authenticated: acesso SÓ via backend (service_role).
-- Aditiva/idempotente (CREATE OR REPLACE) · 1 colagem · sem lock relevante.
-- ============================================================================
SET lock_timeout = '10s';

-- Área de exibição a partir dos slugs usados nas tabelas (area_kpi etc.)
CREATE OR REPLACE FUNCTION public.fn_insc_area_display(slug TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(slug, ''))
    WHEN 'sede' THEN 'Sede'
    WHEN 'ami' THEN 'AMI'
    WHEN 'bridge' THEN 'Bridge'
    WHEN 'online' THEN 'Online'
    WHEN 'kids' THEN 'KIDS'
    WHEN '' THEN NULL
    ELSE initcap(slug)
  END
$$;

CREATE OR REPLACE VIEW public.vw_inscricoes_unificadas AS
-- ── 1. ESPINHA (inscricoes × insc_eventos × insc_series) ──
SELECT
  'inscricoes'::text AS porta,
  i.id AS ref_id,
  '/inscricoes/evento/' || e.id AS rota_detalhe,
  i.membro_id,
  i.nome_completo AS nome_display,
  NULLIF(regexp_replace(coalesce(i.telefone, ''), '\D', '', 'g'), '') AS telefone_norm,
  NULLIF(regexp_replace(coalesce(i.cpf, ''), '\D', '', 'g'), '') AS cpf_norm,
  NULLIF(lower(trim(coalesce(i.email, ''))), '') AS email_norm,
  i.data_nascimento AS nascimento,
  i.created_at AS criado_em,
  i.status AS status_original,
  i.status AS status_canonico,            -- espinha já fala o vocabulário canônico
  coalesce(i.origem, 'formulario_publico') AS origem_norm,
  e.area AS area_display,
  e.nome AS evento_rotulo,
  s.slug_base AS serie_chave,
  e.edicao_rotulo,
  e.id::text AS evento_ref,
  e.data AS evento_data,
  CASE WHEN e.checkin_ativo THEN EXISTS (
    SELECT 1 FROM public.insc_checkins ck WHERE ck.inscricao_id = i.id
  ) ELSE NULL END AS compareceu
FROM public.inscricoes i
JOIN public.insc_eventos e ON e.id = i.evento_id
LEFT JOIN public.insc_series s ON s.id = e.serie_id
WHERE i.deleted_at IS NULL

UNION ALL
-- ── 2. EVENTOS EXTERNOS (redundante pós-virada · só linhas NÃO migradas) ──
SELECT
  'eventos_externos', x.id, '/inscricoes', x.membro_id,
  x.nome,
  NULLIF(regexp_replace(coalesce(x.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(x.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(x.email, ''))), ''),
  x.data_nascimento, x.created_at,
  x.status,
  CASE x.status WHEN 'cancelada' THEN 'cancelada' ELSE 'confirmada' END,
  coalesce(x.origem, 'formulario_publico'),
  'Sede', ee.nome, NULL, NULL, ee.id::text, ee.data, NULL::boolean
FROM public.ext_inscricoes x
JOIN public.ext_eventos ee ON ee.id = x.evento_id
WHERE x.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inscricoes i2
    WHERE i2.legado_fonte = 'ext_inscricoes' AND i2.legado_ref = x.id
  )

UNION ALL
-- ── 3. BATISMO (série derivada mensal · edição = mês do batismo) ──
SELECT
  'batismo', b.id, '/ministerial/integracao?tab=batismos', b.membro_id,
  trim(b.nome || ' ' || coalesce(b.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(b.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(b.email, ''))), ''),
  b.data_nascimento, b.created_at,
  b.status,
  CASE b.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'confirmado' THEN 'confirmada'
    WHEN 'realizado' THEN 'concluida'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  coalesce(b.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(b.area_kpi), 'Sede'),
  'Batismo · ' || coalesce(to_char(b.data_batismo, 'DD/MM/YYYY'), 'a agendar'),
  'batismo-mensal', to_char(b.data_batismo, 'YYYY-MM'), NULL, b.data_batismo,
  CASE WHEN b.status IN ('realizado', 'confirmado') THEN (b.checkin_em IS NOT NULL OR b.status = 'realizado') ELSE NULL END
FROM public.batismo_inscricoes b
WHERE b.deleted_at IS NULL

UNION ALL
-- ── 4. APRESENTAÇÃO DE CRIANÇAS (form público · série derivada mensal) ──
SELECT
  'apresentacao_criancas', a.id, '/kids', a.responsavel_membro_id,
  a.crianca_nome,
  NULLIF(regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(a.cpf_responsavel, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(a.email, ''))), ''),
  a.crianca_data_nascimento, a.created_at,
  a.status,
  CASE a.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'confirmado' THEN 'confirmada'
    WHEN 'realizado' THEN 'concluida'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  CASE coalesce(a.origem, '') WHEN 'publico' THEN 'formulario_publico' WHEN '' THEN 'formulario_publico' ELSE a.origem END,
  'KIDS',
  'Apresentação · ' || coalesce(to_char(a.data_apresentacao, 'DD/MM/YYYY'), 'a agendar'),
  'apresentacao-mensal', to_char(a.data_apresentacao, 'YYYY-MM'), NULL, a.data_apresentacao,
  CASE WHEN a.status = 'realizado' THEN true ELSE NULL END
FROM public.apresentacao_criancas a
WHERE a.deleted_at IS NULL

UNION ALL
-- ── 5. APRESENTAÇÃO DE BEBÊS (porta viva do totem · mesma série derivada) ──
SELECT
  'apresentacao_bebes', ab.id, '/kids', ab.responsavel_membro_id,
  ab.bebe_nome,
  NULLIF(regexp_replace(coalesce(ab.responsavel_telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(ab.responsavel_email, ''))), ''),
  ab.bebe_data_nascimento, ab.created_at,
  ab.status,
  CASE ab.status
    WHEN 'agendada' THEN 'confirmada'
    WHEN 'confirmada' THEN 'confirmada'
    WHEN 'realizada' THEN 'concluida'
    WHEN 'cancelada' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  'formulario_publico',
  'KIDS',
  'Apresentação (bebê) · ' || coalesce(to_char(ab.data_apresentacao, 'DD/MM/YYYY'), 'a agendar'),
  'apresentacao-mensal', to_char(ab.data_apresentacao, 'YYYY-MM'), NULL, ab.data_apresentacao,
  CASE WHEN ab.status = 'realizada' THEN true ELSE NULL END
FROM public.apresentacao_bebes ab
WHERE ab.deleted_at IS NULL

UNION ALL
-- ── 6. GRUPOS (pedidos · série derivada = temporada do grupo) ──
SELECT
  'grupos', p.id, '/grupos?tab=entrada', p.membro_id,
  p.nome,
  NULLIF(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(p.email, ''))), ''),
  NULL::date, p.created_at,
  p.status,
  CASE p.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'devolvido' THEN 'em_tratamento'
    WHEN 'encaminhado' THEN 'em_tratamento'
    WHEN 'aprovado' THEN 'concluida'
    WHEN 'rejeitado' THEN 'recusada'
    WHEN 'cancelado' THEN 'cancelada'
    ELSE 'recebida'
  END,
  coalesce(p.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(g.area), 'Grupos'),
  'Grupo ' || coalesce(g.nome, '—'),
  'grupos-temporadas', g.temporada, g.id::text, NULL::date, NULL::boolean
FROM public.mem_grupo_pedidos p
LEFT JOIN public.mem_grupos g ON g.id = p.grupo_id
WHERE p.deleted_at IS NULL

UNION ALL
-- ── 7. LÍDERES E ANFITRIÕES ──
SELECT
  'grupos_lider', l.id, '/grupos?tab=entrada', l.membro_id,
  l.nome,
  NULLIF(regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g'), ''),
  NULL,
  NULLIF(lower(trim(coalesce(l.email, ''))), ''),
  NULL::date, l.created_at,
  l.status,
  CASE l.status
    WHEN 'pendente' THEN 'recebida'
    WHEN 'aceito' THEN 'em_tratamento'
    WHEN 'vinculado' THEN 'concluida'
    WHEN 'recusado' THEN 'recusada'
    ELSE 'recebida'
  END,
  coalesce(l.origem, 'formulario_publico'),
  'Grupos', 'Líderes e anfitriões', NULL, NULL, NULL, NULL::date, NULL::boolean
FROM public.mem_lider_inscricoes l
WHERE l.deleted_at IS NULL

UNION ALL
-- ── 8. NEXT · matrículas (série derivada = turma) ──
SELECT
  'next', m.id, '/ministerial/integracao?tab=next', m.membro_id,
  trim(m.nome || ' ' || coalesce(m.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(m.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(m.email, ''))), ''),
  m.data_nascimento, m.created_at,
  m.status,
  CASE
    WHEN m.status = 'matriculado' AND m.turma_id IS NULL THEN 'recebida'
    WHEN m.status = 'matriculado' THEN 'confirmada'
    WHEN m.status = 'formado' THEN 'concluida'
    WHEN m.status = 'incompleto' THEN 'nao_concluida'
    WHEN m.status = 'desistiu' THEN 'cancelada'
    ELSE 'confirmada'
  END,
  coalesce(m.origem, 'formulario_publico'),
  'Next',
  'Next · ' || coalesce(t.nome, 'sem turma'),
  'next-turmas', coalesce(t.origem_mes, t.nome), t.id::text, NULL::date,
  (m.check_in_at IS NOT NULL)
FROM public.next_matriculas m
LEFT JOIN public.next_turmas t ON t.id = m.turma_id
WHERE m.deleted_at IS NULL

UNION ALL
-- ── 9. NEXT · inscrições legadas (pré-turmas · ainda recebe origem='app') ──
SELECT
  'next_legado', n.id, '/ministerial/integracao?tab=next', n.membro_id,
  trim(n.nome || ' ' || coalesce(n.sobrenome, '')),
  NULLIF(regexp_replace(coalesce(n.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(n.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(n.email, ''))), ''),
  n.data_nascimento, n.created_at,
  'legado',
  'confirmada',
  coalesce(n.origem, 'formulario_publico'),
  'Next', 'Next (legado)', NULL, NULL, NULL, NULL::date, (n.check_in_at IS NOT NULL)
FROM public.next_inscricoes n

UNION ALL
-- ── 10. VOLUNTARIADO ──
SELECT
  'voluntariado', v.id, '/ministerial/voluntariado/inscricoes', v.membro_id,
  coalesce(NULLIF(trim(coalesce(v.nome_completo, '')), ''), trim(coalesce(v.nome, '') || ' ' || coalesce(v.sobrenome, ''))),
  NULLIF(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g'), ''),
  NULLIF(regexp_replace(coalesce(v.cpf, ''), '\D', '', 'g'), ''),
  NULLIF(lower(trim(coalesce(v.email, ''))), ''),
  v.data_nascimento, v.created_at,
  v.status,
  CASE v.status
    WHEN 'inscrito' THEN 'recebida'
    WHEN 'enviado_ministerio' THEN 'em_tratamento'
    WHEN 'kids' THEN 'em_tratamento'
    WHEN 'integrado' THEN 'concluida'
    WHEN 'nao_responde' THEN 'nao_concluida'
    WHEN 'nao_pode_ou_duplicata' THEN 'recusada'
    ELSE 'recebida'
  END,
  coalesce(v.origem, 'formulario_publico'),
  coalesce(public.fn_insc_area_display(v.area), 'Voluntariado'),
  'Voluntariado', NULL, NULL, NULL, NULL::date, NULL::boolean
FROM public.vol_inscricoes v
WHERE v.deleted_at IS NULL;

-- Acesso SÓ via backend (F1 M9): a view concentra PII de todas as portas.
REVOKE ALL ON public.vw_inscricoes_unificadas FROM anon, authenticated;

COMMENT ON VIEW public.vw_inscricoes_unificadas IS
  'Leitura unificada das 10 portas de inscrição (F1 §5-6 + SPEC-03/SPEC-10). Status canônico: recebida→em_tratamento→confirmada→concluida|nao_concluida|recusada|cancelada. Séries derivadas (tempo 1 do SPEC-10) só pra analytics. ext_inscricoes = fonte redundante pós-virada (linhas migradas ficam de fora via legado_ref). Acesso exclusivo via backend.';

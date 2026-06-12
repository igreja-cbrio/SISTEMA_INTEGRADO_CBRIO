-- Monitoramento OKR (aba /monitoramento-okr · "cabeça do Juninho")
-- ============================================================================
-- POR QUE ESTA MIGRATION EXISTE
-- O endpoint GET /api/painel/monitoramento-okr era o ÚNICO do /painel que usava
-- o pool pg direto (query() → DATABASE_URL). No serverless do Vercel esse pool
-- não conecta de forma confiável → as 15 queries estouravam, o wrapper uma()
-- engolia cada erro e a aba devolvia `metricas: {}` com HTTP 200 (nunca apareceu
-- dado em produção, só em testes locais que alcançam o Postgres direto).
-- O resto do painel usa o cliente supabase REST (HTTPS) e funciona sempre.
--
-- ESTA FUNÇÃO move as ~15 queries pra dentro do banco e devolve tudo em JSONB.
-- O backend passa a chamar via supabase.rpc('fn_monitoramento_okr_raw') — mesmo
-- canal REST do resto do painel — então funciona no Vercel sem depender do pool.
--
-- Read-only · STABLE · SECURITY DEFINER (bypassa RLS, como o backend já fazia
-- via service_role). Idempotente (CREATE OR REPLACE). Sem mudança de schema.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_monitoramento_okr_raw()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- NSM central · a estrela-guia do Juninho (engajados em ≤60d)
    'nsm', (SELECT to_jsonb(x) FROM (
      SELECT percentual, meta_percentual, status, total_convertidos_periodo,
             engajados_em_60d, janela_inicio, janela_fim, atualizado_em
        FROM vw_nsm_painel WHERE segmento = 'central' LIMIT 1
    ) x),
    -- OKR Batismos · realizados 90d ÷ conversões 90d
    'batRatio', (SELECT to_jsonb(x) FROM (
      WITH b AS (
        SELECT count(*) n FROM batismo_inscricoes
         WHERE status='realizado' AND data_batismo >= CURRENT_DATE - INTERVAL '90 days'
           AND deleted_at IS NULL
      ), c AS (
        SELECT coalesce(sum(decisoes_presenciais + decisoes_online),0) n
          FROM cultos WHERE data >= CURRENT_DATE - INTERVAL '90 days' AND deleted_at IS NULL
      )
      SELECT b.n batismos, c.n conversoes,
             CASE WHEN c.n > 0 THEN round(b.n::numeric / c.n * 100, 1) ELSE NULL END pct
        FROM b, c
    ) x),
    -- Nº batismos mensais · último mês completo + média de 6 meses
    'batMes', (SELECT to_jsonb(x) FROM (
      WITH m AS (
        SELECT date_trunc('month', data_batismo) mes, count(*) n
          FROM batismo_inscricoes
         WHERE status='realizado' AND data_batismo IS NOT NULL AND deleted_at IS NULL
           AND data_batismo >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
           AND data_batismo <  date_trunc('month', CURRENT_DATE)
         GROUP BY 1
      )
      SELECT (SELECT n FROM m ORDER BY mes DESC LIMIT 1) ultimo,
             (SELECT to_char(mes,'MM/YYYY') FROM m ORDER BY mes DESC LIMIT 1) ultimo_label,
             round(avg(n),1) media FROM m
    ) x),
    -- Tempo médio decisão → batismo (dias) · só membros com as duas datas
    'tempoBat', (SELECT to_jsonb(x) FROM (
      SELECT round(avg(b.data_batismo - t.data_conclusao)::numeric, 0) media_dias, count(*) n
        FROM batismo_inscricoes b
        JOIN mem_trilha_valores t
          ON t.membro_id = b.membro_id AND t.etapa = 'conversao'
         AND t.concluida = true AND t.deleted_at IS NULL
       WHERE b.status='realizado' AND b.data_batismo IS NOT NULL AND b.membro_id IS NOT NULL
         AND b.deleted_at IS NULL AND (b.data_batismo - t.data_conclusao) >= 0
    ) x),
    -- Nº decisões online (DS) · soma 90d
    'dsOnline', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(sum(decisoes_online),0) ds_90d
        FROM cultos
       WHERE data >= CURRENT_DATE - INTERVAL '90 days' AND data < CURRENT_DATE
         AND deleted_at IS NULL
    ) x),
    -- % de assentos ocupados · Templo (exclui Bridge) ÷ 1050
    'assentos', (SELECT to_jsonb(x) FROM (
      SELECT round(avg(c.presencial_adulto)::numeric, 0) media_pres, count(*) n,
             round(avg(c.presencial_adulto)::numeric / 1050 * 100, 1) pct
        FROM cultos c JOIN vol_service_types st ON st.id = c.service_type_id
       WHERE c.data >= CURRENT_DATE - INTERVAL '90 days' AND c.presencial_adulto > 0
         AND c.deleted_at IS NULL AND st.name NOT ILIKE '%bridge%'
    ) x),
    -- Rotatividade staff · demissões 12m ÷ ativos
    'rotativ', (SELECT to_jsonb(x) FROM (
      SELECT count(*) FILTER (WHERE data_demissao >= CURRENT_DATE - INTERVAL '12 months') demitidos,
             count(*) FILTER (WHERE status='ativo') ativos
        FROM rh_funcionarios WHERE deleted_at IS NULL
    ) x),
    -- Série mensal de batismos (6 meses completos)
    'batSerie', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.mes), '[]'::jsonb) FROM (
      SELECT to_char(date_trunc('month', data_batismo),'YYYY-MM') mes, count(*)::int valor
        FROM batismo_inscricoes
       WHERE status='realizado' AND data_batismo IS NOT NULL AND deleted_at IS NULL
         AND data_batismo >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
         AND data_batismo <  date_trunc('month', CURRENT_DATE)
       GROUP BY 1
    ) s),
    -- Série mensal de decisões online (6 meses completos)
    'dsSerie', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.mes), '[]'::jsonb) FROM (
      SELECT to_char(date_trunc('month', data),'YYYY-MM') mes, coalesce(sum(decisoes_online),0)::int valor
        FROM cultos
       WHERE data >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
         AND data <  date_trunc('month', CURRENT_DATE) AND deleted_at IS NULL
       GROUP BY 1
    ) s),
    -- Série mensal de % de ocupação do Templo (6 meses completos)
    'assentosSerie', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.mes), '[]'::jsonb) FROM (
      SELECT to_char(date_trunc('month', c.data),'YYYY-MM') mes,
             round(avg(c.presencial_adulto)::numeric / 1050 * 100, 1)::float valor
        FROM cultos c JOIN vol_service_types st ON st.id = c.service_type_id
       WHERE c.data >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
         AND c.data <  date_trunc('month', CURRENT_DATE)
         AND c.presencial_adulto > 0 AND c.deleted_at IS NULL AND st.name NOT ILIKE '%bridge%'
       GROUP BY 1
    ) s),
    -- Base do denominador dos % de engajamento: membros ativos
    'baseMembros', (SELECT to_jsonb(x) FROM (
      SELECT count(*) n FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL
    ) x),
    -- % frequência em grupos
    'freqGrupos', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(round(count(DISTINCT gm.membro_id)::numeric
             / NULLIF((SELECT count(*) FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL),0) * 100, 1), 0) pct,
             count(DISTINCT gm.membro_id) n
        FROM mem_grupo_membros gm WHERE gm.saiu_em IS NULL AND gm.deleted_at IS NULL
    ) x),
    -- % voluntários ativos
    'voluntAtivos', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(round(count(DISTINCT membro_id)::numeric
             / NULLIF((SELECT count(*) FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL),0) * 100, 1), 0) pct,
             count(DISTINCT membro_id) n
        FROM mem_voluntarios WHERE ate IS NULL AND deleted_at IS NULL
    ) x),
    -- % dizimistas regulares (3+ meses em 6m)
    'dizimistas', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(round((SELECT count(*) FROM (
               SELECT membro_id FROM mem_contribuicoes WHERE deleted_at IS NULL AND data >= CURRENT_DATE - INTERVAL '6 months'
               GROUP BY membro_id HAVING count(DISTINCT date_trunc('month', data)) >= 3) t)::numeric
             / NULLIF((SELECT count(*) FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL),0) * 100, 1), 0) pct,
             (SELECT count(*) FROM (
               SELECT membro_id FROM mem_contribuicoes WHERE deleted_at IS NULL AND data >= CURRENT_DATE - INTERVAL '6 months'
               GROUP BY membro_id HAVING count(DISTINCT date_trunc('month', data)) >= 3) t) n
    ) x),
    -- % convertidos atendidos no Acompanhamento (90d)
    'cafeAtend', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(round(count(*) FILTER (WHERE atendido_apos_culto = true)::numeric
             / NULLIF(count(*),0) * 100, 1), 0) pct,
             count(*) FILTER (WHERE atendido_apos_culto = true) atendidos, count(*) total
        FROM cui_convertidos WHERE data_culto >= CURRENT_DATE - INTERVAL '90 days'
    ) x)
  )
$$;

GRANT EXECUTE ON FUNCTION public.fn_monitoramento_okr_raw() TO authenticated, service_role, anon;

COMMENT ON FUNCTION public.fn_monitoramento_okr_raw() IS
  'Monitoramento OKR (aba /monitoramento-okr · cabeça do Juninho). Devolve em JSONB os valores brutos das ~15 métricas. Substitui as 15 queries no pool pg direto (que não conecta no serverless do Vercel) por 1 chamada via supabase.rpc (REST/HTTPS, igual ao resto do painel).';

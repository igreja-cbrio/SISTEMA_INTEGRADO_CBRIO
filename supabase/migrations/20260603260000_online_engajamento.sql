-- Online · Engajamento de conteúdo (KPIs da "cabeça do Juninho")
-- ============================================================================
-- POR QUE ESTA MIGRATION EXISTE
-- O OKR "Engajamento de Conteúdo" do Monitoramento OKR (Pr. Juninho) tem 3
-- táticos que ainda mostravam "—" por falta de fonte:
--   1. Retenção média em vídeos        (alvo ≥40%)
--   2. Taxa de compartilhamento        (alvo ≥5%)
--   3. Cliques em séries no YouTube     (alvo ≥15%)
-- Esses números virão da API/Analytics do YouTube. Marcos pediu pra criar a
-- ESTRUTURA pra receber esses dados no módulo Online (vira KPI específico de lá)
-- e fazer a aba /monitoramento-okr exibir 0 (não "—") até a 1ª coleta.
--
-- Tabela channel-level MENSAL (a planilha do Juninho mede "mensal, média MoM").
-- Não é PII (métricas agregadas do canal) → segue o RLS das outras online_*
-- (service_role FOR ALL + authenticated FOR SELECT). Sem soft-delete (igual
-- online_canal_snapshot). Um futuro coletor da YouTube Analytics faz UPSERT por mês.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.online_engajamento (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes                       date NOT NULL,                  -- 1º dia do mês (ex: 2026-06-01)
  retencao_media_pct        numeric(5,2),                   -- retenção média em vídeos (%)
  taxa_compartilhamento_pct numeric(5,2),                   -- compartilhamentos ÷ alcance (%)
  cliques_series_pct        numeric(5,2),                   -- CTR dos cards/links das séries (%)
  fonte                     text NOT NULL DEFAULT 'manual', -- 'youtube_api' | 'manual'
  observacao                text,
  collected_at              timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mes)
);

COMMENT ON TABLE public.online_engajamento IS
  'Engajamento de conteúdo do canal (mensal): retenção média, taxa de compartilhamento e CTR de séries. Estrutura pra receber dados da API/Analytics do YouTube. Alimenta a aba /monitoramento-okr (OKR Engajamento de Conteúdo · cabeça do Juninho) e o card de Engajamento em /online.';

CREATE INDEX IF NOT EXISTS idx_online_engajamento_mes
  ON public.online_engajamento (mes DESC);

ALTER TABLE public.online_engajamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_online_engajamento" ON public.online_engajamento;
CREATE POLICY "service_role_online_engajamento" ON public.online_engajamento
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_read_online_engajamento" ON public.online_engajamento;
CREATE POLICY "auth_read_online_engajamento" ON public.online_engajamento
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- fn_monitoramento_okr_raw() · CREATE OR REPLACE com a chave 'engajamento' nova.
-- A chave SEMPRE devolve um objeto com os 3 valores (COALESCE 0 via subquery
-- escalar · 1 linha garantida mesmo com a tabela vazia) → a aba mostra 0, não "—".
-- O resto da função é idêntico à 20260603220000 (nenhuma mudança de comportamento).
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
    ) x),
    -- Engajamento de conteúdo (Online · cabeça do Juninho) · mês mais recente.
    -- Subqueries escalares com COALESCE → SEMPRE 1 linha (0 quando a tabela está
    -- vazia) pra a aba mostrar "0", não "—". Alimentado pela API do YouTube depois.
    'engajamento', (SELECT to_jsonb(x) FROM (
      SELECT
        coalesce((SELECT retencao_media_pct        FROM online_engajamento ORDER BY mes DESC LIMIT 1), 0) retencao,
        coalesce((SELECT taxa_compartilhamento_pct FROM online_engajamento ORDER BY mes DESC LIMIT 1), 0) compartilhamento,
        coalesce((SELECT cliques_series_pct        FROM online_engajamento ORDER BY mes DESC LIMIT 1), 0) cliques_series,
        (SELECT to_char(mes,'MM/YYYY')             FROM online_engajamento ORDER BY mes DESC LIMIT 1) mes_label
    ) x)
  )
$$;

GRANT EXECUTE ON FUNCTION public.fn_monitoramento_okr_raw() TO authenticated, service_role, anon;

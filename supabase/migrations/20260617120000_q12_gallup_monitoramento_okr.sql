-- Monitoramento OKR · Nota Q12 (Gallup) = 4,21
-- ============================================================================
-- POR QUE ESTA MIGRATION EXISTE
-- O OKR "Cultura e Saúde do Staff" (bloco Operações · cabeça do Juninho) tem o
-- tático "Nota Q12" que até agora mostrava "—" + "preciso de a nota do Gallup".
-- Marcos rodou a pesquisa e a nota ficou em 4,21. Esta migration:
--   1. Registra 4,21 como dado bruto (tipo 'rh_q12_nota' · area 'rh' · anual).
--   2. CREATE OR REPLACE fn_monitoramento_okr_raw() adicionando a chave 'q12'
--      (lê o último valor de dados_brutos pra esse tipo). O resto da função é
--      idêntico à 20260603260000 (nenhuma mudança de comportamento).
-- A nota é lançada como dado bruto (mesma fonte do /dados-brutos) → quando o RH
-- rodar a próxima pesquisa, basta um novo registro que a aba reflete sozinha.
-- ============================================================================

-- 1. Registro do valor (idempotente por chave única tipo+area+data+contexto)
INSERT INTO public.dados_brutos (tipo_id, area, data, valor, origem, observacao)
VALUES ('rh_q12_nota', 'rh', DATE '2026-06-17', 4.21, 'manual',
        'Pesquisa Q12 (Gallup) · resultado lançado pelo RH')
ON CONFLICT (tipo_id, area, data, contexto)
DO UPDATE SET valor = EXCLUDED.valor,
              observacao = EXCLUDED.observacao,
              updated_at = now();

-- 2. fn_monitoramento_okr_raw() · acrescenta a chave 'q12'
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
    ) x),
    -- Nota Q12 (Gallup) · último valor lançado pelo RH (dados_brutos). Sem
    -- COALESCE: se não houver registro, devolve null e a aba mostra "—".
    'q12', (SELECT to_jsonb(x) FROM (
      SELECT
        (SELECT valor             FROM dados_brutos WHERE tipo_id='rh_q12_nota' ORDER BY data DESC, created_at DESC LIMIT 1) nota,
        (SELECT to_char(data,'MM/YYYY') FROM dados_brutos WHERE tipo_id='rh_q12_nota' ORDER BY data DESC, created_at DESC LIMIT 1) label
    ) x)
  )
$$;

GRANT EXECUTE ON FUNCTION public.fn_monitoramento_okr_raw() TO authenticated, service_role, anon;

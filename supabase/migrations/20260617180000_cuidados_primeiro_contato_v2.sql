-- Cuidados · primeiro contato v2 (pedido do Marcos · 2026-06-17)
-- ============================================================================
-- DUAS MUDANÇAS:
-- 1) Elimina o status "atendido" sozinho → vira "atendido_respondido". O Marcelo
--    no início escrevia só "Atendido" (= conversou com o pastor), que é o mesmo
--    que "Atendido e respondido". Migra os registros existentes.
-- 2) "Primeiro contato FEITO" passa a contar quem NÃO respondeu também: o contato
--    foi feito, a pessoa só não quis. Numerador = respondeu + atendido_respondido +
--    nao_respondeu + nao_compareceu + nao_atendido. NÃO conta "sem_retorno"
--    (o responsável não retornou · fica no denominador) nem "numero_errado"
--    (impossível contatar · sai do denominador).
-- Só o ramo cafeAtend muda na fn_monitoramento_okr_raw (resto = 20260617150000).
-- ============================================================================

-- 1) Migra "atendido" → "atendido_respondido"
UPDATE public.cui_convertidos
   SET primeiro_contato_status = 'atendido_respondido',
       atendido_apos_culto = true
 WHERE primeiro_contato_status = 'atendido';

-- 2) fn_monitoramento_okr_raw() · cafeAtend reescrito
CREATE OR REPLACE FUNCTION public.fn_monitoramento_okr_raw()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'nsm', (SELECT to_jsonb(x) FROM (
      SELECT percentual, meta_percentual, status, total_convertidos_periodo,
             engajados_em_60d, janela_inicio, janela_fim, atualizado_em
        FROM vw_nsm_painel WHERE segmento = 'central' LIMIT 1
    ) x),
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
    'tempoBat', (SELECT to_jsonb(x) FROM (
      SELECT round(avg(b.data_batismo - t.data_conclusao)::numeric, 0) media_dias, count(*) n
        FROM batismo_inscricoes b
        JOIN mem_trilha_valores t
          ON t.membro_id = b.membro_id AND t.etapa = 'conversao'
         AND t.concluida = true AND t.deleted_at IS NULL
       WHERE b.status='realizado' AND b.data_batismo IS NOT NULL AND b.membro_id IS NOT NULL
         AND b.deleted_at IS NULL AND (b.data_batismo - t.data_conclusao) >= 0
    ) x),
    'dsOnline', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(sum(decisoes_online),0) ds_90d
        FROM cultos
       WHERE data >= CURRENT_DATE - INTERVAL '90 days' AND data < CURRENT_DATE
         AND deleted_at IS NULL
    ) x),
    'assentos', (SELECT to_jsonb(x) FROM (
      SELECT round(avg(c.presencial_adulto)::numeric, 0) media_pres, count(*) n,
             round(avg(c.presencial_adulto)::numeric / 1050 * 100, 1) pct
        FROM cultos c JOIN vol_service_types st ON st.id = c.service_type_id
       WHERE c.data >= CURRENT_DATE - INTERVAL '90 days' AND c.presencial_adulto > 0
         AND c.deleted_at IS NULL AND st.name NOT ILIKE '%bridge%'
    ) x),
    'rotativ', (SELECT to_jsonb(x) FROM (
      SELECT count(*) FILTER (WHERE data_demissao >= CURRENT_DATE - INTERVAL '12 months') demitidos,
             count(*) FILTER (WHERE status='ativo') ativos
        FROM rh_funcionarios WHERE deleted_at IS NULL
    ) x),
    'batSerie', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.mes), '[]'::jsonb) FROM (
      SELECT to_char(date_trunc('month', data_batismo),'YYYY-MM') mes, count(*)::int valor
        FROM batismo_inscricoes
       WHERE status='realizado' AND data_batismo IS NOT NULL AND deleted_at IS NULL
         AND data_batismo >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
         AND data_batismo <  date_trunc('month', CURRENT_DATE)
       GROUP BY 1
    ) s),
    'dsSerie', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.mes), '[]'::jsonb) FROM (
      SELECT to_char(date_trunc('month', data),'YYYY-MM') mes, coalesce(sum(decisoes_online),0)::int valor
        FROM cultos
       WHERE data >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
         AND data <  date_trunc('month', CURRENT_DATE) AND deleted_at IS NULL
       GROUP BY 1
    ) s),
    'assentosSerie', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.mes), '[]'::jsonb) FROM (
      SELECT to_char(date_trunc('month', c.data),'YYYY-MM') mes,
             round(avg(c.presencial_adulto)::numeric / 1050 * 100, 1)::float valor
        FROM cultos c JOIN vol_service_types st ON st.id = c.service_type_id
       WHERE c.data >= date_trunc('month', CURRENT_DATE) - INTERVAL '6 months'
         AND c.data <  date_trunc('month', CURRENT_DATE)
         AND c.presencial_adulto > 0 AND c.deleted_at IS NULL AND st.name NOT ILIKE '%bridge%'
       GROUP BY 1
    ) s),
    'baseMembros', (SELECT to_jsonb(x) FROM (
      SELECT count(*) n FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL
    ) x),
    'freqGrupos', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(round(count(DISTINCT gm.membro_id)::numeric
             / NULLIF((SELECT count(*) FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL),0) * 100, 1), 0) pct,
             count(DISTINCT gm.membro_id) n
        FROM mem_grupo_membros gm WHERE gm.saiu_em IS NULL AND gm.deleted_at IS NULL
    ) x),
    'voluntAtivos', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(round(count(DISTINCT membro_id)::numeric
             / NULLIF((SELECT count(*) FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL),0) * 100, 1), 0) pct,
             count(DISTINCT membro_id) n
        FROM mem_voluntarios WHERE ate IS NULL AND deleted_at IS NULL
    ) x),
    'dizimistas', (SELECT to_jsonb(x) FROM (
      SELECT coalesce(round((SELECT count(*) FROM (
               SELECT membro_id FROM mem_contribuicoes WHERE deleted_at IS NULL AND data >= CURRENT_DATE - INTERVAL '6 months'
               GROUP BY membro_id HAVING count(DISTINCT date_trunc('month', data)) >= 3) t)::numeric
             / NULLIF((SELECT count(*) FROM mem_membros WHERE status='membro_ativo' AND deleted_at IS NULL),0) * 100, 1), 0) pct,
             (SELECT count(*) FROM (
               SELECT membro_id FROM mem_contribuicoes WHERE deleted_at IS NULL AND data >= CURRENT_DATE - INTERVAL '6 months'
               GROUP BY membro_id HAVING count(DISTINCT date_trunc('month', data)) >= 3) t) n
    ) x),
    -- % com PRIMEIRO CONTATO FEITO (90d). Feito = o contato foi realizado,
    -- independente da resposta: respondeu + atendido_respondido + nao_respondeu +
    -- nao_compareceu + nao_atendido (+ legado primeiro_contato_em / atendido_apos_culto).
    -- "sem_retorno" NÃO conta como feito mas fica no denominador. "numero_errado"
    -- sai do denominador (impossível contatar). 'atendido' segue na lista por segurança.
    'cafeAtend', (SELECT to_jsonb(x) FROM (
      WITH base AS (
        SELECT primeiro_contato_status AS st, primeiro_contato_em, atendido_apos_culto
          FROM cui_convertidos
         WHERE data_culto >= CURRENT_DATE - INTERVAL '90 days' AND deleted_at IS NULL
      ), feito AS (
        SELECT *, (st IN ('respondeu','atendido','atendido_respondido','nao_respondeu','nao_compareceu','nao_atendido')
                   OR primeiro_contato_em IS NOT NULL
                   OR atendido_apos_culto = true) AS ok
          FROM base
      )
      SELECT coalesce(round(count(*) FILTER (WHERE ok)::numeric
             / NULLIF(count(*) FILTER (WHERE st IS DISTINCT FROM 'numero_errado'), 0) * 100, 1), 0) pct,
             count(*) FILTER (WHERE ok) atendidos,
             count(*) FILTER (WHERE st IS DISTINCT FROM 'numero_errado') total
        FROM feito
    ) x),
    'engajamento', (SELECT to_jsonb(x) FROM (
      SELECT
        coalesce((SELECT retencao_media_pct        FROM online_engajamento ORDER BY mes DESC LIMIT 1), 0) retencao,
        coalesce((SELECT taxa_compartilhamento_pct FROM online_engajamento ORDER BY mes DESC LIMIT 1), 0) compartilhamento,
        coalesce((SELECT cliques_series_pct        FROM online_engajamento ORDER BY mes DESC LIMIT 1), 0) cliques_series,
        (SELECT to_char(mes,'MM/YYYY')             FROM online_engajamento ORDER BY mes DESC LIMIT 1) mes_label
    ) x),
    'q12', (SELECT to_jsonb(x) FROM (
      SELECT
        (SELECT valor             FROM dados_brutos WHERE tipo_id='rh_q12_nota' ORDER BY data DESC, created_at DESC LIMIT 1) nota,
        (SELECT to_char(data,'MM/YYYY') FROM dados_brutos WHERE tipo_id='rh_q12_nota' ORDER BY data DESC, created_at DESC LIMIT 1) label
    ) x)
  )
$$;

GRANT EXECUTE ON FUNCTION public.fn_monitoramento_okr_raw() TO authenticated, service_role, anon;

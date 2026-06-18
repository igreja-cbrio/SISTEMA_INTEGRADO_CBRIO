-- Cuidados · status do PRIMEIRO CONTATO no novo convertido + tático do Monitoramento OKR
-- ============================================================================
-- POR QUE ESTA MIGRATION EXISTE
-- O Marcelo (Cuidados) acompanha o 1º contato de cada novo convertido numa
-- planilha à parte com os status: Respondeu / Atendido / Atendido e respondido /
-- Não respondeu / Não compareceu / Não atendido / Sem retorno do responsável /
-- Número errado. O sistema só tinha `atendido_apos_culto` (booleano) e
-- `primeiro_contato_em` (quando o pastor fez o contato) — não dava pra registrar
-- esse status nativo. Marcos pediu (2026-06-17):
--   1. Trazer todos os dados da planilha pro sistema (script de import à parte).
--   2. O Marcelo passa a preencher esse status DIRETO no Cuidados (sem Excel).
--   3. O tático "Novos Convertidos no Acompanhamento 1º Encontro" do Monitoramento
--      OKR vira o **PRIMEIRO CONTATO** = Respondeu + Atendido + Atendido e respondido
--      (excluindo "Número errado" do denominador).
--
-- Esta migration: (a) adiciona a coluna de status; (b) reescreve o ramo `cafeAtend`
-- da fn_monitoramento_okr_raw pra contar primeiro contato. O resto da função é
-- idêntico à 20260617120000 (Q12) · nenhuma outra mudança de comportamento.
-- ============================================================================

-- 1. Coluna de status do primeiro contato (slugs sem acento · CHECK + NULL)
ALTER TABLE public.cui_convertidos
  ADD COLUMN IF NOT EXISTS primeiro_contato_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cui_convertidos_primeiro_contato_status_check'
  ) THEN
    ALTER TABLE public.cui_convertidos
      ADD CONSTRAINT cui_convertidos_primeiro_contato_status_check
      CHECK (primeiro_contato_status IS NULL OR primeiro_contato_status IN (
        'respondeu',            -- respondeu o 1º contato (mensagem em 24h)
        'atendido',             -- além de responder, conversou com o pastor (status legado pré-abr/2026)
        'atendido_respondido',  -- atendido e respondido
        'nao_respondeu',
        'nao_compareceu',
        'nao_atendido',
        'sem_retorno',          -- sem retorno do responsável (líder da área não devolveu)
        'numero_errado'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.cui_convertidos.primeiro_contato_status IS
  'Status do primeiro contato pastoral (ex-planilha do Marcelo). Primeiro contato feito = respondeu/atendido/atendido_respondido. numero_errado sai do denominador do tático.';

-- 2. fn_monitoramento_okr_raw() · só o ramo cafeAtend muda (resto = 20260617120000)
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
    -- % com PRIMEIRO CONTATO feito (90d) · ex-"convertidos atendidos".
    -- Feito = status respondeu/atendido/atendido_respondido OU (legado) primeiro_contato_em
    -- preenchido OU atendido_apos_culto. Denominador exclui "numero_errado".
    'cafeAtend', (SELECT to_jsonb(x) FROM (
      WITH base AS (
        SELECT primeiro_contato_status AS st, primeiro_contato_em, atendido_apos_culto
          FROM cui_convertidos
         WHERE data_culto >= CURRENT_DATE - INTERVAL '90 days' AND deleted_at IS NULL
      )
      SELECT coalesce(round(
               count(*) FILTER (WHERE st IN ('respondeu','atendido','atendido_respondido')
                                   OR primeiro_contato_em IS NOT NULL
                                   OR atendido_apos_culto = true)::numeric
               / NULLIF(count(*) FILTER (WHERE st IS DISTINCT FROM 'numero_errado'), 0) * 100, 1), 0) pct,
             count(*) FILTER (WHERE st IN ('respondeu','atendido','atendido_respondido')
                                 OR primeiro_contato_em IS NOT NULL
                                 OR atendido_apos_culto = true) atendidos,
             count(*) FILTER (WHERE st IS DISTINCT FROM 'numero_errado') total
        FROM base
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

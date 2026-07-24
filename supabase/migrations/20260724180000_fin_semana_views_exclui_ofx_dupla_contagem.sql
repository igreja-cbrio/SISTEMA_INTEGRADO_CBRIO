-- Guardrail dupla contagem (2026-07-24): o balanço é a fonte de verdade do
-- Dashboard Semanal; o OFX aprovado (mesmo dinheiro) NÃO deve somar junto.
-- Condição p/ manter a linha: (lancamento_bruto_id IS NULL OR codigo_legado IS NOT NULL)
--   mantém balanço (codigo_legado) + manual/NF (sem lancamento_bruto_id);
--   exclui OFX-da-fila (lancamento_bruto_id não-nulo E codigo_legado nulo).
-- Recria 3 views só acrescentando esse filtro no WHERE de fin_transacoes.

CREATE OR REPLACE VIEW public.vw_fin_semana_resumo AS
 WITH cultos_sem AS (
         SELECT (fin_semana_qua_ter(c_1.data)).inicio AS semana_inicio,
            (fin_semana_qua_ter(c_1.data)).fim AS semana_fim,
            (fin_semana_qua_ter(c_1.data)).label AS semana_label,
            sum(COALESCE(c_1.presencial_adulto, 0) + COALESCE(c_1.presencial_kids, 0)) AS total_presencial,
            sum(COALESCE(c_1.online_pico, 0)) AS total_online,
            count(*) AS qtd_cultos
           FROM cultos c_1
          WHERE c_1.deleted_at IS NULL
          GROUP BY ((fin_semana_qua_ter(c_1.data)).inicio), ((fin_semana_qua_ter(c_1.data)).fim), ((fin_semana_qua_ter(c_1.data)).label)
        ), receita_sem AS (
         SELECT (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
            sum(t.valor) AS receita_total
           FROM fin_transacoes t
          WHERE t.tipo = 'receita'::text AND t.status <> 'cancelado'::text
            AND (t.classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text]))
            AND (t.lancamento_bruto_id IS NULL OR t.codigo_legado IS NOT NULL)
          GROUP BY ((fin_semana_qua_ter(t.data_competencia)).inicio)
        )
 SELECT COALESCE(c.semana_inicio, r.semana_inicio) AS semana_inicio,
    c.semana_fim,
    c.semana_label,
    COALESCE(c.qtd_cultos, 0::bigint) AS qtd_cultos,
    COALESCE(c.total_presencial, 0::bigint) AS total_presencial,
    COALESCE(c.total_online, 0::bigint) AS total_online,
    COALESCE(r.receita_total, 0::numeric) AS receita_total,
        CASE
            WHEN COALESCE(c.total_presencial, 0::bigint) > 0 THEN COALESCE(r.receita_total, 0::numeric) / c.total_presencial::numeric
            ELSE 0::numeric
        END AS ticket_medio_presencial
   FROM cultos_sem c
     FULL JOIN receita_sem r ON r.semana_inicio = c.semana_inicio;

CREATE OR REPLACE VIEW public.vw_fin_semana_cultos AS
 SELECT c.id AS culto_id,
    c.data AS culto_data,
    c.service_type_id,
    st.name AS culto_nome,
    st.recurrence_day AS dia_semana,
    st.recurrence_time AS hora_culto,
    st.has_kids,
    st.has_online,
    COALESCE(c.presencial_adulto, 0) AS presencial_adulto,
    COALESCE(c.presencial_kids, 0) AS presencial_kids,
    COALESCE(c.presencial_adulto, 0) + COALESCE(c.presencial_kids, 0) AS total_presencial,
    COALESCE(c.online_pico, 0) AS online_pico,
    ( SELECT COALESCE(sum(t.valor), 0::numeric) AS "coalesce"
           FROM fin_transacoes t
             LEFT JOIN fin_culto_slots cs ON cs.id = t.culto_slot_id
          WHERE t.tipo = 'receita'::text AND t.status <> 'cancelado'::text
            AND (t.classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text]))
            AND (t.lancamento_bruto_id IS NULL OR t.codigo_legado IS NOT NULL)
            AND t.data_competencia = c.data
            AND (cs.service_type_slug IS NOT NULL AND cs.dia_semana = st.recurrence_day OR t.culto_slot_id IS NULL)) AS receita_total,
    (fin_semana_qua_ter(c.data)).inicio AS semana_inicio,
    (fin_semana_qua_ter(c.data)).fim AS semana_fim,
    (fin_semana_qua_ter(c.data)).label AS semana_label
   FROM cultos c
     JOIN vol_service_types st ON st.id = c.service_type_id
  WHERE c.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.vw_fin_top_contribuintes_semana AS
 SELECT (fin_semana_qua_ter(t.data_competencia)).inicio AS semana_inicio,
    (fin_semana_qua_ter(t.data_competencia)).fim AS semana_fim,
    t.membro_id,
    m.nome AS membro_nome,
    count(*) AS qtd_doacoes,
    sum(t.valor) AS total_doado,
    max(t.data_competencia) AS ultima_doacao
   FROM fin_transacoes t
     LEFT JOIN mem_membros m ON m.id = t.membro_id
  WHERE t.tipo = 'receita'::text AND t.status <> 'cancelado'::text
    AND (t.classe_movimento = ANY (ARRAY['ordinaria'::text, 'extraordinaria'::text]))
    AND (t.lancamento_bruto_id IS NULL OR t.codigo_legado IS NOT NULL)
    AND t.membro_id IS NOT NULL
  GROUP BY ((fin_semana_qua_ter(t.data_competencia)).inicio), ((fin_semana_qua_ter(t.data_competencia)).fim), t.membro_id, m.nome;

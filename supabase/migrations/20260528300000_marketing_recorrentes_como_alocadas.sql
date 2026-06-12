-- ============================================================================
-- MIGRATION · Marketing · Recorrentes contam como ALOCADAS (Spec 019)
-- ============================================================================
-- Marcos 2026-05-28: Lorena 0/22 está errado · ela tem 18h de recorrente (social
-- media seg-sab) + 0 cards · deveria aparecer 18/40 (18 alocadas / 40 base).
--
-- Antes: horas_disponiveis subtraia recorrentes da base (Lorena: 40-18=22)
--        horas_alocadas = só cards (Lorena: 0)
--        Display "0/22" · esconde que ela já está ocupada com recorrentes
--
-- Agora: horas_disponiveis = horas_base (Lorena: 40)
--        horas_alocadas = recorrentes + cards (Lorena: 18 + 0 = 18)
--        Display "18/40" · transparente sobre o que ja ocupa a pessoa
--
-- Override continua substituindo horas_disponiveis · ferias = 0 disponiveis.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_marketing_calcular_capacidade_semana(p_data_ref date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  membro_id          uuid,
  profile_id         uuid,
  habilidade         text,
  semana_inicio      date,
  semana_fim         date,
  horas_base         numeric,
  horas_recorrentes  numeric,
  horas_override     numeric,
  horas_disponiveis  numeric,
  horas_alocadas     numeric,
  horas_livres       numeric
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_seg date;
  v_dom date;
BEGIN
  v_seg := public.fn_marketing_segunda_da_semana(p_data_ref);
  v_dom := v_seg + INTERVAL '6 days';

  RETURN QUERY
  WITH base AS (
    SELECT m.id, m.profile_id, m.habilidade, m.horas_semanais
      FROM public.marketing_membros m
     WHERE m.ativo = true AND m.deleted_at IS NULL
  ),
  rec AS (
    SELECT r.membro_id, SUM(r.duracao_h) AS horas_recorrentes
      FROM public.marketing_compromissos_recorrentes r
     WHERE r.ativo = true AND r.deleted_at IS NULL
     GROUP BY r.membro_id
  ),
  ovr AS (
    SELECT o.membro_id, o.horas_disponiveis AS horas_override
      FROM public.marketing_capacidade_override o
     WHERE o.semana_inicio = v_seg AND o.deleted_at IS NULL
  ),
  cards_membro AS (
    SELECT
      c.id, c.atribuido_a, c.estado, c.ordem_fila,
      COALESCE(t.esforco_max_h, 0) AS esforco_h,
      ROW_NUMBER() OVER (
        PARTITION BY c.atribuido_a
        ORDER BY
          CASE WHEN c.estado = 'em_producao' THEN 0 ELSE 1 END,
          c.ordem_fila ASC
      ) AS rn
      FROM public.marketing_kanban_cards c
      LEFT JOIN public.marketing_etiquetas_tipo t ON t.id = c.etiqueta_tipo_id
     WHERE c.deleted_at IS NULL
       AND c.atribuido_a IS NOT NULL
       AND c.estado IN ('fila','em_producao')
  ),
  cards_com_acumulado AS (
    -- Capacidade pra calculo de quantos cards cabem · usa
    -- (base · override) − recorrentes (recorrentes "consomem" capacidade
    -- pra cards mesmo aparecendo como alocadas no display)
    SELECT
      cm.atribuido_a AS membro_id,
      cm.esforco_h,
      cm.estado,
      SUM(cm.esforco_h) OVER (
        PARTITION BY cm.atribuido_a
        ORDER BY cm.rn
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS acum_h,
      GREATEST(0,
        COALESCE(o.horas_override, b.horas_semanais) - COALESCE(r.horas_recorrentes, 0)
      ) AS capacidade_pra_cards
      FROM cards_membro cm
      JOIN base b ON b.id = cm.atribuido_a
      LEFT JOIN rec r ON r.membro_id = cm.atribuido_a
      LEFT JOIN ovr o ON o.membro_id = cm.atribuido_a
  ),
  aloc_cards AS (
    -- Soma so dos cards que cabem na fila desta semana
    SELECT
      membro_id,
      SUM(esforco_h) AS horas_cards
      FROM cards_com_acumulado
     WHERE estado = 'em_producao'
        OR (acum_h - esforco_h) < capacidade_pra_cards
     GROUP BY membro_id
  )
  SELECT
    b.id,
    b.profile_id,
    b.habilidade,
    v_seg,
    v_dom::date,
    b.horas_semanais                                                       AS horas_base,
    COALESCE(r.horas_recorrentes, 0)                                       AS horas_recorrentes,
    o.horas_override                                                       AS horas_override,
    -- disponivel = override OR base (NAO subtrai recorrentes do disponivel)
    COALESCE(o.horas_override, b.horas_semanais)                           AS horas_disponiveis,
    -- alocadas = recorrentes + cards que cabem
    COALESCE(r.horas_recorrentes, 0) + COALESCE(ac.horas_cards, 0)         AS horas_alocadas,
    -- livres = disponiveis − alocadas (pode ser negativo se ultra-lotado)
    COALESCE(o.horas_override, b.horas_semanais)
      - (COALESCE(r.horas_recorrentes, 0) + COALESCE(ac.horas_cards, 0))   AS horas_livres
    FROM base b
    LEFT JOIN rec r ON r.membro_id = b.id
    LEFT JOIN ovr o ON o.membro_id = b.id
    LEFT JOIN aloc_cards ac ON ac.membro_id = b.id
   ORDER BY b.habilidade, b.id;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) IS
  'Capacidade por membro · v3 (Spec 019) · recorrentes contam como alocadas (display 18/40 em vez de 0/22 da Lorena). Disponiveis = base (ou override). Alocadas = recorrentes + cards. Cards continuam usando ordem_fila pra distribuir capacidade.';

GRANT EXECUTE ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) TO authenticated, service_role;

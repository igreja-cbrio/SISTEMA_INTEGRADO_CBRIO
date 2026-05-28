-- ============================================================================
-- MIGRATION · Marketing · Capacidade via fila (Spec 018b)
-- ============================================================================
-- Marcos 2026-05-28: "se eu solicitar algo pro marketing entregar daqui 6
-- meses e eles não tiverem nenhuma tarefa, devem executar hoje independente."
--
-- Problema: fn_marketing_calcular_capacidade_semana hoje aloca horas na
-- SEMANA DO PRAZO. Cards prazo distante = 0 horas alocadas na semana atual
-- = equipe parece ociosa.
--
-- Solucao: alocar capacidade baseada na FILA, nao no prazo:
--   - Cards em estado=em_producao do membro · sempre ocupam capacidade atual
--   - Cards em estado=fila atribuidos ao membro · ordenados por ordem_fila
--     · preenchem capacidade restante ate esgotar a semana
--
-- Resultado: Pedro reordena a fila · calendario reflete imediatamente quem
-- esta ocupado com o que esta semana.
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
  -- ALOCACAO POR FILA (Spec 018b · 2026-05-28)
  -- Em vez de filtrar por prazo, soma o esforco MAX dos cards em_producao
  -- (sempre alocam) + cards na fila (ate esgotar a capacidade do membro).
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
    -- Calcula acumulado de horas e capacidade base do membro
    SELECT
      cm.atribuido_a AS membro_id,
      cm.esforco_h,
      cm.estado,
      SUM(cm.esforco_h) OVER (
        PARTITION BY cm.atribuido_a
        ORDER BY cm.rn
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS acum_h,
      COALESCE(o.horas_override, b.horas_semanais - COALESCE(r.horas_recorrentes, 0)) AS capacidade_semana
      FROM cards_membro cm
      JOIN base b ON b.id = cm.atribuido_a
      LEFT JOIN rec r ON r.membro_id = cm.atribuido_a
      LEFT JOIN ovr o ON o.membro_id = cm.atribuido_a
  ),
  aloc AS (
    -- Inclui cards ate o acumulado anterior ainda caber na capacidade.
    -- Ex: capacidade 30h · cards 8h+10h+15h · acum 8/18/33 · inclui os 3
    -- (porque o acumulado ANTERIOR 18<30) · alocacao total 33h (sinal de overflow)
    SELECT
      membro_id,
      SUM(esforco_h) AS horas_alocadas
      FROM cards_com_acumulado
     WHERE estado = 'em_producao'
        OR (acum_h - esforco_h) < capacidade_semana
     GROUP BY membro_id
  )
  SELECT b.id, b.profile_id, b.habilidade,
         v_seg, v_dom::date,
         b.horas_semanais,
         COALESCE(r.horas_recorrentes, 0),
         o.horas_override,
         COALESCE(o.horas_override, b.horas_semanais - COALESCE(r.horas_recorrentes, 0)),
         COALESCE(a.horas_alocadas, 0),
         COALESCE(o.horas_override, b.horas_semanais - COALESCE(r.horas_recorrentes, 0))
           - COALESCE(a.horas_alocadas, 0)
    FROM base b
    LEFT JOIN rec r ON r.membro_id = b.id
    LEFT JOIN ovr o ON o.membro_id = b.id
    LEFT JOIN aloc a ON a.membro_id = b.id
   ORDER BY b.habilidade, b.id;
END;
$$;

COMMENT ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) IS
  'Capacidade por membro · v2 (Spec 018b) · aloca via FILA em vez de prazo. Cards em_producao sempre contam · cards na fila contam ate esgotar capacidade do membro. Reordenar fila refletir-se imediatamente.';

GRANT EXECUTE ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) TO authenticated, service_role;

-- Backfill defensivo · ordem_fila pode ter ficado com valores muito altos
-- (bigserial nextval) · normaliza pra inteiros sequenciais 1..N
-- por estado · em_producao primeiro · depois fila.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    ORDER BY CASE WHEN estado = 'em_producao' THEN 0 ELSE 1 END, ordem_fila ASC
  ) AS nova_ordem
    FROM public.marketing_kanban_cards
   WHERE estado IN ('fila','em_producao') AND deleted_at IS NULL
)
UPDATE public.marketing_kanban_cards c
   SET ordem_fila = r.nova_ordem
  FROM ranked r
 WHERE c.id = r.id
   AND c.ordem_fila <> r.nova_ordem;

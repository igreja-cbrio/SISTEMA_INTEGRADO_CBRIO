-- ============================================================================
-- MIGRATION · Marketing · Recorrentes N:M · vários participantes (Spec 020)
-- ============================================================================
-- Marcos 2026-05-28: "queria que voce pudesse adicionar tarefas recorrentes
-- que podem mais de uma pessoa · reuniao de todo marketing · reuniao especifica
-- com designer e redes sociais."
--
-- Hoje: marketing_compromissos_recorrentes tem membro_id (1:1) · cada
-- compromisso vinculado a 1 pessoa.
--
-- Agora: junction marketing_recorrentes_participantes (N:M) · 1 compromisso
-- pode ter varios participantes. Cada participante recebe `duracao_h` na
-- alocacao (reuniao 1h com 5 pessoas = cada uma com +1h, nao 0.2h cada).
--
-- Migracao dos 7 recorrentes existentes preserva 1 participante por linha.
-- ============================================================================

-- 1. Junction table
CREATE TABLE IF NOT EXISTS public.marketing_recorrentes_participantes (
  compromisso_id uuid NOT NULL REFERENCES public.marketing_compromissos_recorrentes(id) ON DELETE CASCADE,
  membro_id      uuid NOT NULL REFERENCES public.marketing_membros(id) ON DELETE CASCADE,
  PRIMARY KEY (compromisso_id, membro_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_recorrentes_participantes_membro
  ON public.marketing_recorrentes_participantes (membro_id);

COMMENT ON TABLE public.marketing_recorrentes_participantes IS
  'Junction N:M · compromisso recorrente pode ter varios participantes (Spec 020). Reuniao 1h com 5 pessoas = cada uma recebe 1h na alocacao.';

-- 2. RLS · pattern padrao do modulo
ALTER TABLE public.marketing_recorrentes_participantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_recorrentes_part_select ON public.marketing_recorrentes_participantes;
CREATE POLICY marketing_recorrentes_part_select ON public.marketing_recorrentes_participantes
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 1
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_recorrentes_part_write ON public.marketing_recorrentes_participantes;
CREATE POLICY marketing_recorrentes_part_write ON public.marketing_recorrentes_participantes
  FOR ALL TO authenticated
  USING (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.current_user_module_level('marketing') >= 5
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS marketing_recorrentes_part_service ON public.marketing_recorrentes_participantes;
CREATE POLICY marketing_recorrentes_part_service ON public.marketing_recorrentes_participantes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Migra os 7 recorrentes existentes pra estrutura N:M
INSERT INTO public.marketing_recorrentes_participantes (compromisso_id, membro_id)
SELECT id, membro_id
  FROM public.marketing_compromissos_recorrentes
 WHERE membro_id IS NOT NULL
   AND deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- 4. Drop a coluna membro_id (refator limpo · sem ambiguidade)
ALTER TABLE public.marketing_compromissos_recorrentes
  DROP COLUMN membro_id;

-- 5. Atualiza fn_marketing_calcular_capacidade_semana
-- · soma duracao_h por participante via JOIN com a junction
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
  -- Recorrentes agora vem via junction · cada participante recebe duracao_h
  rec AS (
    SELECT p.membro_id, SUM(r.duracao_h) AS horas_recorrentes
      FROM public.marketing_compromissos_recorrentes r
      JOIN public.marketing_recorrentes_participantes p ON p.compromisso_id = r.id
     WHERE r.ativo = true AND r.deleted_at IS NULL
     GROUP BY p.membro_id
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
    COALESCE(o.horas_override, b.horas_semanais)                           AS horas_disponiveis,
    COALESCE(r.horas_recorrentes, 0) + COALESCE(ac.horas_cards, 0)         AS horas_alocadas,
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
  'Capacidade por membro · v4 (Spec 020) · recorrentes via junction N:M (varios participantes por compromisso).';

GRANT EXECUTE ON FUNCTION public.fn_marketing_calcular_capacidade_semana(date) TO authenticated, service_role;

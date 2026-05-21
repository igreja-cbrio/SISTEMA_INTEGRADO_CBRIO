-- ============================================================================
-- Hotfix cultos · 2026-05-21
-- ============================================================================
-- Achados da varredura fina:
--   1. AMI-05 e AMI-06 puxam dados do Bridge (cross-wiring de migration antiga
--      20260514170000_kpis_seguir_fonte_auto.sql). AMI-01 ja cobre frequencia
--      do AMI · AMI-05 ("crescimento") fica sem fonte ate refatoracao.
--   2. KPIs por area de culto nao tem lider_funcionario_id apontado · painel
--      mostra "Lider: -" sempre, mesmo apos atribuir cargos.
--   3. Lillian Xavier (coord-bridge) nao tem cadastro em rh_funcionarios.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Limpa fonte_auto errada em AMI-05 e AMI-06
-- ────────────────────────────────────────────────────────────────────────────
-- AMI-05 = "% crescimento participantes AMI" · MAS estava com fonte_auto =
-- cultos.bridge_freq (puxava do Bridge!). AMI-01 ja eh frequencia do AMI ·
-- AMI-05 fica sem coletor ate refatorarmos calculo de crescimento ano-ano.
UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = NULL, updated_at = now()
 WHERE id = 'AMI-05'
   AND fonte_auto IN ('cultos.bridge_freq', 'cultos.bridge_conv');

UPDATE public.kpi_indicadores_taticos
   SET fonte_auto = NULL, updated_at = now()
 WHERE id = 'AMI-06'
   AND fonte_auto IN ('cultos.bridge_freq', 'cultos.bridge_conv');

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Cria Lillian Xavier em rh_funcionarios (coordenadora Bridge)
-- ────────────────────────────────────────────────────────────────────────────
-- ID gerado deterministicamente via UUID v5 nao da · usar gen_random_uuid()
-- mas wrappado em DO/INSERT IF NOT EXISTS pra idempotencia.
DO $$
DECLARE
  v_lillian_id uuid;
BEGIN
  SELECT id INTO v_lillian_id
    FROM public.rh_funcionarios
   WHERE email = 'lillian.xavier@cbrio.org'
   LIMIT 1;

  IF v_lillian_id IS NULL THEN
    -- Default tipo_contrato eh 'clt' lowercase mas o CHECK exige uppercase
    -- ('CLT','PJ','PJ+','PREBENDA') · passar explicito pra evitar violation
    INSERT INTO public.rh_funcionarios (nome, email, status, cargo, data_admissao, tipo_contrato)
    VALUES ('Lillian Xavier', 'lillian.xavier@cbrio.org', 'ativo', 'Coordenadora Bridge', CURRENT_DATE, 'CLT')
    RETURNING id INTO v_lillian_id;
  END IF;

  -- Atribui Lillian como lider de TODOS os KPIs ativos da area bridge
  UPDATE public.kpi_indicadores_taticos
     SET lider_funcionario_id = v_lillian_id, updated_at = now()
   WHERE area = 'bridge'
     AND ativo = true
     AND (lider_funcionario_id IS NULL OR lider_funcionario_id <> v_lillian_id);
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Conecta lideres aos KPIs de cada area
-- ────────────────────────────────────────────────────────────────────────────
-- IDs confirmados via consulta no Supabase:
--   Mariane Gaia      · 323db85c-a46f-485a-b6a4-23d3ad51f5b8  (Kids)
--   Arthur Cecconi    · 92186f0c-85e8-4fc8-a973-3e5fcaffd966  (AMI)
--   Renata Martins    · b28e8b30-f7f2-4e2a-96ac-dc4d3ccff631  (Online · coord)
-- Lillian Xavier ja foi tratada no bloco anterior (criada se nao existir).

UPDATE public.kpi_indicadores_taticos
   SET lider_funcionario_id = '323db85c-a46f-485a-b6a4-23d3ad51f5b8',
       updated_at = now()
 WHERE area = 'kids'
   AND ativo = true
   AND (lider_funcionario_id IS NULL
        OR lider_funcionario_id <> '323db85c-a46f-485a-b6a4-23d3ad51f5b8');

UPDATE public.kpi_indicadores_taticos
   SET lider_funcionario_id = '92186f0c-85e8-4fc8-a973-3e5fcaffd966',
       updated_at = now()
 WHERE area = 'ami'
   AND ativo = true
   AND (lider_funcionario_id IS NULL
        OR lider_funcionario_id <> '92186f0c-85e8-4fc8-a973-3e5fcaffd966');

UPDATE public.kpi_indicadores_taticos
   SET lider_funcionario_id = 'b28e8b30-f7f2-4e2a-96ac-dc4d3ccff631',
       updated_at = now()
 WHERE area = 'online'
   AND ativo = true
   AND (lider_funcionario_id IS NULL
        OR lider_funcionario_id <> 'b28e8b30-f7f2-4e2a-96ac-dc4d3ccff631');

-- ────────────────────────────────────────────────────────────────────────────
-- Conferencia:
--   SELECT area, COUNT(*) FILTER (WHERE lider_funcionario_id IS NOT NULL) AS com_lider,
--                COUNT(*) AS total
--     FROM kpi_indicadores_taticos
--    WHERE area IN ('kids','ami','bridge','online') AND ativo = true
--    GROUP BY area;
-- Esperado: com_lider == total nas 4 areas
-- ============================================================================

-- ============================================================================
-- NSM · aba "Sem dados" volta a cobrir TODA a janela da NSM (remove o cutoff)
--
-- Marcos (2026-06-09): "as pessoas que não foram cadastradas por nome devem
-- sim impactar a NSM; o problema é que ao clicar em Sem dados deveria mostrar
-- o gap inteiro [da janela da NSM] e não 44 como mostra lá".
--
-- Contexto: o denominador da NSM (recalcular_nsm · janela MÓVEL de 90 dias)
-- soma as decisões agregadas dos cultos — hoje 240 desde 2026-03-10. Mas a
-- vw_nsm_sem_dados tinha cutoff fixo `data >= 2026-05-18` ("de hoje pra cá",
-- decisão de 18/05, ANTERIOR à NSM passar a contar fantasmas em 15/05+).
-- Resultado: o card NSM mostrava 240 decisões e a aba Sem dados só enxergava
-- 44 de gap (cultos de 18/05 em diante).
--
-- Esta migration recria a view SEM o cutoff. O recorte de período passa a ser
-- 100% responsabilidade de quem consome (o endpoint /painel/nsm/sem-dados já
-- filtra por ?dias e a página filtra pela janela selecionada). No resto, a
-- view fica idêntica à versão de 20260518150000 (kids em colunas separadas ·
-- só presencial/online entram no gap principal).
--
-- CREATE OR REPLACE (mesma lista de colunas) · idempotente · sem DROP.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_nsm_sem_dados AS
SELECT
  c.id              AS culto_id,
  c.data            AS data_culto,
  c.nome            AS culto_nome,
  c.service_type_id,
  vst.name          AS service_type_name,
  vst.color         AS service_type_color,
  c.decisoes_presenciais,
  c.decisoes_online,
  c.decisoes_kids,
  (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) AS total_decisoes,
  -- Só conta presencial/online em total_registradas · kids fica em coluna própria
  COALESCE(p.total_registradas, 0) AS total_registradas,
  COALESCE(p.com_membro_vinculado, 0) AS com_membro_vinculado,
  COALESCE(p.total_kids_registrados, 0) AS kids_registrados,
  (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0))
    - COALESCE(p.total_registradas, 0) AS sem_dados,
  -- Kids tem seu próprio gap (independente do principal)
  COALESCE(c.decisoes_kids, 0) - COALESCE(p.total_kids_registrados, 0) AS kids_sem_dados,
  CASE
    WHEN (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) = 0 THEN 'sem_decisoes'
    WHEN COALESCE(p.total_registradas, 0) = 0 THEN 'nenhuma_registrada'
    WHEN COALESCE(p.total_registradas, 0) < (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) THEN 'parcial'
    ELSE 'completo'
  END AS gap_status
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON vst.id = c.service_type_id
LEFT JOIN (
  SELECT
    culto_id,
    -- Só conta presencial/online no agregado principal
    COUNT(*) FILTER (WHERE tipo_decisao IN ('presencial','online')) AS total_registradas,
    COUNT(membro_id) FILTER (WHERE tipo_decisao IN ('presencial','online')) AS com_membro_vinculado,
    -- Kids fica em coluna separada
    COUNT(*) FILTER (WHERE tipo_decisao = 'kids') AS total_kids_registrados
  FROM public.cultos_decisoes_pessoas
  GROUP BY culto_id
) p ON p.culto_id = c.id
WHERE c.data <= current_date
  AND (
    (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) > 0
    OR COALESCE(c.decisoes_kids, 0) > 0
  );

GRANT SELECT ON public.vw_nsm_sem_dados TO authenticated, service_role;

COMMENT ON VIEW public.vw_nsm_sem_dados IS
  'Cultos com decisões a registrar · SEM cutoff de data (2026-06-09: a aba Sem dados precisa reconciliar com o denominador da NSM, janela móvel de 90d · o recorte de período é do consumidor). Kids em coluna separada (decisoes_kids, kids_registrados, kids_sem_dados) · não entra no gap_status nem no NSM.';

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT count(*), sum(sem_dados) FROM vw_nsm_sem_dados
--    WHERE data_culto >= current_date - 90;
--   -- sum(sem_dados) deve bater com (denominador NSM − registradas) ≈ 219
-- ----------------------------------------------------------------------------

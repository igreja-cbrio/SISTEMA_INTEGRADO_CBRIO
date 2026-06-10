-- ============================================================================
-- NSM · aba "Sem dados" ganha filtro de origem (presencial / online)
--
-- Marcos (2026-06-10): "na área de sem dados, vale colocar o filtro de online
-- e presencial também, fica interessante saber".
--
-- A view só tinha o agregado conjunto (total_registradas soma presencial +
-- online), então não dava pra calcular o gap POR ORIGEM. Esta migration
-- acrescenta 4 colunas NO FINAL da view (CREATE OR REPLACE permite acrescentar
-- ao fim sem DROP · colunas existentes ficam idênticas em nome/ordem/tipo):
--   - registradas_presencial · pessoas com tipo_decisao='presencial'
--   - registradas_online     · pessoas com tipo_decisao='online'
--   - sem_dados_presencial   · decisoes_presenciais − registradas_presencial
--   - sem_dados_online       · decisoes_online − registradas_online
--
-- O frontend (/painel/nsm/pessoas · aba Sem dados) projeta cards, lista e
-- gap_status pela origem selecionada. Idempotente.
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
  END AS gap_status,
  -- Split por origem (2026-06-10 · colunas novas no final)
  COALESCE(p.registradas_presencial, 0) AS registradas_presencial,
  COALESCE(p.registradas_online, 0) AS registradas_online,
  c.decisoes_presenciais - COALESCE(p.registradas_presencial, 0) AS sem_dados_presencial,
  COALESCE(c.decisoes_online, 0) - COALESCE(p.registradas_online, 0) AS sem_dados_online
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON vst.id = c.service_type_id
LEFT JOIN (
  SELECT
    culto_id,
    -- Só conta presencial/online no agregado principal
    COUNT(*) FILTER (WHERE tipo_decisao IN ('presencial','online')) AS total_registradas,
    COUNT(membro_id) FILTER (WHERE tipo_decisao IN ('presencial','online')) AS com_membro_vinculado,
    -- Kids fica em coluna separada
    COUNT(*) FILTER (WHERE tipo_decisao = 'kids') AS total_kids_registrados,
    -- Split por origem
    COUNT(*) FILTER (WHERE tipo_decisao = 'presencial') AS registradas_presencial,
    COUNT(*) FILTER (WHERE tipo_decisao = 'online') AS registradas_online
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
  'Cultos com decisões a registrar · SEM cutoff de data (recorte de período é do consumidor) · split por origem em registradas_presencial/online + sem_dados_presencial/online (2026-06-10). Kids em coluna separada (decisoes_kids, kids_registrados, kids_sem_dados) · não entra no gap_status nem no NSM.';

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT sum(sem_dados), sum(sem_dados_presencial), sum(sem_dados_online)
--     FROM vw_nsm_sem_dados WHERE data_culto >= current_date - 90;
--   -- sem_dados = sem_dados_presencial + sem_dados_online (linha a linha)
-- ----------------------------------------------------------------------------

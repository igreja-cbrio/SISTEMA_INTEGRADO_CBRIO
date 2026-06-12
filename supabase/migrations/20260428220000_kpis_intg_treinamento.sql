-- ============================================================================
-- Mapeia INTG-05 (% Voluntarios em treinamentos) para fonte automatica
--
-- Calculo:
--   % = (voluntarios da equipe Integracao com check-in de treinamento no mes)
--       / (total de voluntarios ativos da equipe Integracao) * 100
--
-- Tabelas usadas:
--   - vol_teams         (encontra equipe com name ~ 'integ')
--   - vol_team_members  (denominador: ativos na equipe)
--   - vol_training_checkins (numerador: check-ins do periodo com team_name ~ 'integ')
-- ============================================================================

UPDATE kpi_indicadores_taticos
SET fonte_auto = 'integracao.treinamento',
    updated_at = now()
WHERE id = 'INTG-05';

-- Verificacao:
-- SELECT id, indicador, fonte_auto FROM kpi_indicadores_taticos WHERE id = 'INTG-05';

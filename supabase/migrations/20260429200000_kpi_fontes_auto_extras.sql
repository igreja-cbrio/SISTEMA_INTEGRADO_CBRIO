-- Registrar fonte_auto para coletores novos (Ondas 2 e 3)

-- CUID-06: membros em 2+ valores (Jornada)
UPDATE kpi_indicadores_taticos SET fonte_auto = 'cuidados.membros_2mais_valores'
WHERE id = 'CUID-06' AND fonte_auto IS NULL;

-- Voluntariado extras
UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.ativos_semanal'
WHERE id = 'VOLT-01' AND fonte_auto IS NULL;

UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.ativos_trimestral'
WHERE id = 'VOLT-03' AND fonte_auto IS NULL;

UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.integrados'
WHERE id = 'VOLT-05' AND fonte_auto IS NULL;

UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.desaparecidos'
WHERE id = 'VOLT-07' AND fonte_auto IS NULL;

UPDATE kpi_indicadores_taticos SET fonte_auto = 'voluntariado.interessados_integrados'
WHERE id = 'VOLT-08' AND fonte_auto IS NULL;

-- Generosidade
UPDATE kpi_indicadores_taticos SET fonte_auto = 'generosidade.recorrencia'
WHERE id = 'GEN-02' AND fonte_auto IS NULL;

UPDATE kpi_indicadores_taticos SET fonte_auto = 'generosidade.next_doadores'
WHERE id = 'GEN-04' AND fonte_auto IS NULL;

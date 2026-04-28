-- ============================================================================
-- KPIs V2 - Consolidacao 55 -> 35 indicadores taticos
--
-- Estrategia: soft-delete (ativo=false) dos consolidados/removidos.
-- Historico de registros e preservado mas nao aparece na view por filtro.
-- IDs renomeados ganham nome novo + meta atualizada.
-- ============================================================================

-- ============================================================================
-- AMI (9 -> 4)
-- ============================================================================
-- Mantem: AMI-01 (Freq AMI+Bridge), AMI-02 (Conv AMI+Bridge),
--         AMI-03 (Engajamento discipulado), AMI-09 (Batismos)
-- Desativa: AMI-04 (NEXT), AMI-05/06 (Bridge sep), AMI-07 (grupo pais), AMI-08 (grupos)

UPDATE kpi_indicadores_taticos SET
  indicador = 'Frequencia AMI + Bridge',
  meta_descricao = '+15% em 6m, +30% em 12m (base 200)',
  apuracao = 'Soma da contagem presencial em cultos AMI e Bridge',
  updated_at = now()
WHERE id = 'AMI-01';

UPDATE kpi_indicadores_taticos SET
  indicador = 'Conversoes AMI + Bridge',
  meta_descricao = 'Monitorar',
  apuracao = 'Soma de cards de decisao em cultos AMI e Bridge',
  updated_at = now()
WHERE id = 'AMI-02';

UPDATE kpi_indicadores_taticos SET
  indicador = 'Engajamento em discipulado (Escola + NEXT)',
  meta_descricao = '+50% em 6m (base 70/sem)',
  meta_valor = 50,
  apuracao = 'Soma de presentes na Escola de Discipulos + inscritos NEXT',
  updated_at = now()
WHERE id = 'AMI-03';

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id IN ('AMI-04', 'AMI-05', 'AMI-06', 'AMI-07', 'AMI-08');

-- ============================================================================
-- Generosidade (5 -> 3)
-- ============================================================================
-- Mantem: GEN-01 (Crescimento), GEN-02 (Recorrentes), GEN-04 (NEXT->doadores)
-- Desativa: GEN-03 (Grupo C->B), GEN-05 (Valor arrecadado)

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id IN ('GEN-03', 'GEN-05');

-- ============================================================================
-- CBKids (5 -> 4)
-- ============================================================================
-- Mantem: KID-01 (Frequencia), KID-02 (Aceitacoes+Batismos), KID-04 (Familias), KID-05 (Saidas)
-- Desativa: KID-03 (Batismos sep, consolidado em KID-02)

UPDATE kpi_indicadores_taticos SET
  indicador = 'Aceitacoes + Batismos criancas',
  meta_descricao = 'A definir (consolidado: aceitacoes 5+ e batismos 7+)',
  apuracao = 'Registro consolidado de aceitacoes e batismos do CBKids',
  updated_at = now()
WHERE id = 'KID-02';

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id = 'KID-03';

-- ============================================================================
-- Cuidados (7 -> 4)
-- ============================================================================
-- Mantem: CUID-01 (Convertidos pos-culto), CUID-05 (Engajados em valor),
--         CUID-07 (Jornada 180), CUID-10 (Atendimentos pastorais consolidado)
-- Desativa: CUID-06 (duplica NSM), CUID-12 (Papo), CUID-14 (Aconselhamentos)

UPDATE kpi_indicadores_taticos SET
  indicador = 'Atendimentos pastorais (capelania + staff + aconselhamento)',
  meta_descricao = '40% capelania, 50% staff, 30% aconselhamento (consolidado)',
  meta_valor = 40,
  apuracao = 'Soma de atendimentos: capelania (enfermos/hosp) + papo com pastor (staff) + aconselhamentos',
  updated_at = now()
WHERE id = 'CUID-10';

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id IN ('CUID-06', 'CUID-12', 'CUID-14');

-- ============================================================================
-- Grupos (5 -> 4)
-- ============================================================================
-- Mantem: GRUP-01, GRUP-02, GRUP-04, GRUP-05
-- Desativa: GRUP-03 (lideres acompanhados, vira auxiliar de GRUP-02)

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id = 'GRUP-03';

-- ============================================================================
-- Integracao (5 -> 4)
-- ============================================================================
-- Mantem: INTG-01 (Conv+Visitantes consolidado), INTG-04, INTG-05, INTG-06
-- Desativa: INTG-02 (consolidado em INTG-01)

UPDATE kpi_indicadores_taticos SET
  indicador = 'Conversoes + Visitantes',
  meta_descricao = 'Monitorar',
  apuracao = 'Soma de cards de decisao + cartoes de visitante por culto',
  updated_at = now()
WHERE id = 'INTG-01';

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id = 'INTG-02';

-- ============================================================================
-- Voluntariado (9 -> 4)
-- ============================================================================
-- Mantem: VOL-02 (Ativos consolidado), VOL-04 (Funil consolidado),
--         VOL-06 (Services), VOL-09 (Satisfacao)
-- Desativa: VOL-01 (semanal), VOL-03 (trimestral), VOL-05 (Integrados),
--           VOL-07 (Desaparecidos), VOL-08 (Interessados)

UPDATE kpi_indicadores_taticos SET
  indicador = 'No voluntarios ativos',
  meta_descricao = '30% igreja (6m), 40% (12m)',
  meta_valor = 30,
  apuracao = 'Voluntarios servindo no mes (Planning Center Services + base membros)',
  updated_at = now()
WHERE id = 'VOL-02';

UPDATE kpi_indicadores_taticos SET
  indicador = 'Funil de entrada (interessado -> integrado -> entrante)',
  meta_descricao = '90% dos interessados integrados; entrantes monitorados',
  meta_valor = 90,
  apuracao = 'Cruzamento: interessados -> integracao concluida -> registrados como voluntarios',
  sort_order = 4,
  updated_at = now()
WHERE id = 'VOL-04';

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id IN ('VOL-01', 'VOL-03', 'VOL-05', 'VOL-07', 'VOL-08');

-- ============================================================================
-- CBA (6 -> 4)
-- ============================================================================
-- Mantem: CBA-01 (Crescimento), CBA-02 (Cultura), CBA-03 (Retencao), CBA-06 (NPS)
-- Desativa: CBA-04 (Make a Difference valor), CBA-05 (Make a Difference participacao)

UPDATE kpi_indicadores_taticos SET ativo = false, updated_at = now()
WHERE id IN ('CBA-04', 'CBA-05');

-- ============================================================================
-- Verificacao final (deve retornar 35)
-- ============================================================================
-- SELECT count(*) FROM kpi_indicadores_taticos WHERE ativo = true;
-- SELECT area, count(*) FROM kpi_indicadores_taticos WHERE ativo = true GROUP BY area ORDER BY area;

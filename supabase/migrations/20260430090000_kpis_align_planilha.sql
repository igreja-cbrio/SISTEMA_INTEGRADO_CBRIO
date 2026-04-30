-- ============================================================================
-- KPIs V2 - Alinhamento com a planilha "Metas e Indicadores 2026"
--
-- Antes desta migration o banco e a planilha/frontend estavam desalinhados:
--
--   Bug A: kpi_indicadores_taticos.id usa 'VOL-XX' enquanto frontend usa 'VOLT-XX'.
--          A migration 20260429200000_kpi_fontes_auto_extras tentou UPDATE WHERE
--          id='VOLT-01..08' mas o banco tinha 'VOL-01..08' -> os UPDATEs eram
--          no-ops silenciosos. VOLT-01/03/05/07/08 estao sem fonte_auto no banco.
--
--   Bug B: processos.indicador_ids referenciam 'VOLT-01..09' e 'CBA-01..12'
--          (sentido planilha), mas o banco so tem 'VOL-01..09' e 'CBA-01..06'
--          (sentido convencao igrejas parceiras). Os processos seedados apontam
--          para IDs inexistentes ou semanticamente diferentes.
--
--   Bug C: A consolidacao em 20260428160000 reduziu 60 KPIs para 35 (soft-delete).
--          A planilha (fonte de verdade) tem 60 vigentes -> divergencia continua.
--
-- O que esta migration faz:
--
--   1. Acrescenta ON UPDATE CASCADE no FK kpi_registros.indicador_id, para que
--      futuras renomeacoes de PK propagem automaticamente para o historico.
--
--   2. Remapeia CBA-01..06 -> CBA-07..12 no banco (sentido convencao parceiras).
--      Os PKs CBA-01..06 ficam livres para receber os KPIs de batismo da
--      planilha. Reativa CBA-10 e CBA-11 (Make a Difference) que estavam
--      soft-deletados como CBA-04 e CBA-05.
--
--   3. Insere CBA-01..06 (sentido planilha: % Batismos, Sucesso Interessados,
--      Conversao Next, Contato 5 dias, Questionarios, Satisfacao).
--
--   4. Renomeia VOL-01..09 -> VOLT-01..09 (alinha com planilha/frontend).
--      Reativa VOLT-01/03/05/07/08 que tinham sido consolidados.
--
--   5. Desfaz a consolidacao do banco para alinhar com a planilha:
--      - Reativa AMI-04..08, KID-03, CUID-06/12/14, GRUP-03, INTG-02, GEN-03/05
--      - Restaura nomes/metas originais de AMI-01..03, KID-02, CUID-10,
--        INTG-01, VOLT-02, VOLT-04 (que tinham sido alterados para refletir
--        consolidacao).
--
-- O que NAO esta nesta migration (follow-up):
--   - Refatoracao do kpiAutoCollector.js para coletar AMI e Bridge separados
--     (hoje AMI-01 fonte_auto = 'cultos.amibridge_freq' soma os dois).
--     Sera tratado em PR proprio com mudancas de codigo.
--   - fonte_auto para os novos CBA-01..06 (batismo) - exigem coletor novo.
--
-- Tabela esperada apos a migration:
--   - kpi_indicadores_taticos: 60 vigentes (ativo=true)
--   - kpi_indicadores_taticos: 6 desativados (CUID-02/03/04/08/09/11/13 nao
--     existem no banco; INTG-03 nao existe no banco; GEN-01 fica ativo no
--     banco mas nao aparece na planilha - questao separada)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. FK com ON UPDATE CASCADE para permitir rename de PK
-- ----------------------------------------------------------------------------

ALTER TABLE kpi_registros
  DROP CONSTRAINT IF EXISTS kpi_registros_indicador_id_fkey;

ALTER TABLE kpi_registros
  ADD CONSTRAINT kpi_registros_indicador_id_fkey
  FOREIGN KEY (indicador_id) REFERENCES kpi_indicadores_taticos(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- 2. Remapear banco CBA-01..06 -> CBA-07..12 (sentido convencao parceiras)
-- ----------------------------------------------------------------------------
-- Ordem reversa (CBA-06 -> CBA-12 primeiro) para nao colidir caso o banco
-- ja tenha algum CBA-07..12 (nao deveria ter, mas e mais seguro).

UPDATE kpi_indicadores_taticos SET id = 'CBA-12', updated_at = now() WHERE id = 'CBA-06';
UPDATE kpi_indicadores_taticos SET id = 'CBA-11', updated_at = now() WHERE id = 'CBA-05';
UPDATE kpi_indicadores_taticos SET id = 'CBA-10', updated_at = now() WHERE id = 'CBA-04';
UPDATE kpi_indicadores_taticos SET id = 'CBA-09', updated_at = now() WHERE id = 'CBA-03';
UPDATE kpi_indicadores_taticos SET id = 'CBA-08', updated_at = now() WHERE id = 'CBA-02';
UPDATE kpi_indicadores_taticos SET id = 'CBA-07', updated_at = now() WHERE id = 'CBA-01';

-- Atualizar periodicidade de anual -> mensal (planilha = 'Mensal')
-- e nomes/metas para baterem 100% com a planilha.
UPDATE kpi_indicadores_taticos SET
  indicador     = 'Crescimento no de igrejas na CBA',
  periodicidade = 'mensal',
  meta_descricao = '+20% vs 2025',
  meta_valor    = 20,
  unidade       = '%',
  apuracao      = 'Comparativo de inscritas vs 2025',
  updated_at    = now()
WHERE id = 'CBA-07';

UPDATE kpi_indicadores_taticos SET
  indicador     = '% Igrejas com implementacao cultural registrada',
  periodicidade = 'mensal',
  meta_descricao = '30% ao final do ciclo',
  meta_valor    = 30,
  unidade       = '%',
  apuracao      = 'Relatorio de implementacao por igreja',
  updated_at    = now()
WHERE id = 'CBA-08';

UPDATE kpi_indicadores_taticos SET
  indicador     = '% Igrejas re-inscritas/continuando na CBA',
  periodicidade = 'mensal',
  meta_descricao = '60% do ciclo anterior',
  meta_valor    = 60,
  unidade       = '%',
  apuracao      = 'Comparativo de inscricoes ciclo anterior x atual',
  updated_at    = now()
WHERE id = 'CBA-09';

UPDATE kpi_indicadores_taticos SET
  indicador     = 'Valor arrecadado Make a Difference',
  periodicidade = 'mensal',
  meta_descricao = 'Base para 2027',
  meta_valor    = NULL,
  unidade       = 'R$',
  apuracao      = 'Relatorio financeiro Make a Difference',
  ativo         = true,  -- estava desativado como CBA-04
  updated_at    = now()
WHERE id = 'CBA-10';

UPDATE kpi_indicadores_taticos SET
  indicador     = '% Igrejas inscritas participando ativamente',
  periodicidade = 'mensal',
  meta_descricao = '40% do ciclo',
  meta_valor    = 40,
  unidade       = '%',
  apuracao      = 'Relatorio de participacao Make a Difference',
  ativo         = true,  -- estava desativado como CBA-05
  updated_at    = now()
WHERE id = 'CBA-11';

UPDATE kpi_indicadores_taticos SET
  indicador     = 'NPS do ciclo CBA',
  periodicidade = 'mensal',
  meta_descricao = '>=70 ou 4,0',
  meta_valor    = 70,
  unidade       = 'nota',
  apuracao      = 'Pesquisa qualitativa do ciclo',
  updated_at    = now()
WHERE id = 'CBA-12';

-- ----------------------------------------------------------------------------
-- 3. Inserir novos CBA-01..06 (sentido planilha: fluxo batismo)
-- ----------------------------------------------------------------------------
-- Ligados a estrategicos existentes (MIN-BATISMOS / MIN-CAFE) por afinidade
-- tematica, ja que sao KPIs de batismo/conversao internos da igreja.

INSERT INTO kpi_indicadores_taticos
  (id, kpi_estrategico_id, area, indicador, periodicidade, meta_descricao,
   meta_valor, unidade, apuracao, responsavel_area, sort_order, ativo)
VALUES
  ('CBA-01', 'MIN-BATISMOS', 'cba',
    '% Batismos / Conversoes',
    'mensal', '20% (6m), 50% (12m)', 20, '%',
    'Cruzamento decisao x batismo realizado', 'Coord CBA', 1, true),
  ('CBA-02', 'MIN-CAFE', 'cba',
    '% Sucesso Interessados Iniciais',
    'mensal', '>=90%', 90, '%',
    'Funil interessado inicial -> proxima etapa', 'Coord CBA', 2, true),
  ('CBA-03', 'MIN-BATISMOS', 'cba',
    '% Conversao Next nao batizados',
    'mensal', '>=80%', 80, '%',
    'Cruzamento Next nao batizado x batizando ciclo seguinte', 'Coord CBA', 3, true),
  ('CBA-04', 'MIN-CAFE', 'cba',
    '% Contato em menos de 5 dias',
    'mensal', '>=95%', 95, '%',
    'Tempo entre decisao e primeiro contato pastoral', 'Coord CBA', 4, true),
  ('CBA-05', 'MIN-CAFE', 'cba',
    '% Resposta Questionarios pos-batismo',
    'mensal', '>=80%', 80, '%',
    'Taxa de resposta no questionario pos-batismo', 'Coord CBA', 5, true),
  ('CBA-06', 'MIN-CAFE', 'cba',
    '% Satisfacao processo de batismo',
    'trimestral', '>=90%', 90, '%',
    'Pesquisa de satisfacao apos o batismo', 'Coord CBA', 6, true)
ON CONFLICT (id) DO UPDATE SET
  kpi_estrategico_id = EXCLUDED.kpi_estrategico_id,
  area               = EXCLUDED.area,
  indicador          = EXCLUDED.indicador,
  periodicidade      = EXCLUDED.periodicidade,
  meta_descricao     = EXCLUDED.meta_descricao,
  meta_valor         = EXCLUDED.meta_valor,
  unidade            = EXCLUDED.unidade,
  apuracao           = EXCLUDED.apuracao,
  responsavel_area   = EXCLUDED.responsavel_area,
  sort_order         = EXCLUDED.sort_order,
  ativo              = EXCLUDED.ativo,
  updated_at         = now();

-- ----------------------------------------------------------------------------
-- 4. Renomear VOL-XX -> VOLT-XX
-- ----------------------------------------------------------------------------
-- Ordem reversa pra ser consistente com o passo 2.

UPDATE kpi_indicadores_taticos SET id = 'VOLT-09', updated_at = now() WHERE id = 'VOL-09';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-08', updated_at = now() WHERE id = 'VOL-08';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-07', updated_at = now() WHERE id = 'VOL-07';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-06', updated_at = now() WHERE id = 'VOL-06';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-05', updated_at = now() WHERE id = 'VOL-05';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-04', updated_at = now() WHERE id = 'VOL-04';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-03', updated_at = now() WHERE id = 'VOL-03';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-02', updated_at = now() WHERE id = 'VOL-02';
UPDATE kpi_indicadores_taticos SET id = 'VOLT-01', updated_at = now() WHERE id = 'VOL-01';

-- ----------------------------------------------------------------------------
-- 5. Reativar todos os KPIs que a planilha mantem mas o banco soft-deletou
-- ----------------------------------------------------------------------------

UPDATE kpi_indicadores_taticos SET
  ativo = true, updated_at = now()
WHERE id IN (
  -- AMI: planilha mantem todos os 9
  'AMI-04', 'AMI-05', 'AMI-06', 'AMI-07', 'AMI-08',
  -- CBKids: planilha mantem KID-03 (Batismos)
  'KID-03',
  -- Cuidados: planilha mantem CUID-06, CUID-12, CUID-14
  'CUID-06', 'CUID-12', 'CUID-14',
  -- Grupos: planilha mantem GRUP-03
  'GRUP-03',
  -- Integracao: planilha mantem INTG-02
  'INTG-02',
  -- Voluntariado: ja fizemos rename, agora reativa os que estavam ativo=false
  'VOLT-01', 'VOLT-03', 'VOLT-05', 'VOLT-07', 'VOLT-08',
  -- Generosidade: planilha mantem GEN-03 e GEN-05
  'GEN-03', 'GEN-05'
);

-- ----------------------------------------------------------------------------
-- 6. Reverter consolidacoes (nomes/metas) para baterem com a planilha
-- ----------------------------------------------------------------------------

-- AMI-01: era "Frequencia AMI + Bridge", volta a ser so AMI
UPDATE kpi_indicadores_taticos SET
  indicador      = 'Frequencia AMI (presentes no culto)',
  meta_descricao = 'Aumento 30% com base de 200',
  meta_valor     = 30,
  apuracao       = 'Contagem presencial nos cultos AMI',
  updated_at     = now()
WHERE id = 'AMI-01';

-- AMI-02: era "Conversoes AMI + Bridge", volta a ser so AMI
UPDATE kpi_indicadores_taticos SET
  indicador      = 'Conversoes AMI',
  meta_descricao = '1% do publico alvo presenca',
  meta_valor     = 1,
  apuracao       = 'Cards de decisao recolhidos no culto AMI',
  updated_at     = now()
WHERE id = 'AMI-02';

-- AMI-03: era "Engajamento em discipulado (Escola + NEXT)", volta a Escola so
UPDATE kpi_indicadores_taticos SET
  indicador      = 'Presenca Escola de Discipulos',
  meta_descricao = '+50% em 6m (base 70/sem)',
  meta_valor     = 50,
  apuracao       = 'Lista de presenca semanal da Escola',
  updated_at     = now()
WHERE id = 'AMI-03';

-- KID-02: era "Aceitacoes + Batismos criancas", volta a ser so Aceitacoes
UPDATE kpi_indicadores_taticos SET
  indicador      = 'Aceitacoes (criancas 5+)',
  meta_descricao = '1% do publico presente',
  meta_valor     = 1,
  apuracao       = 'Registro por servo Kids',
  updated_at     = now()
WHERE id = 'KID-02';

-- CUID-10: era "Atendimentos pastorais (capelania + staff + aconselhamento)"
--          volta a ser so Capelania. Staff vira CUID-12, Aconselhamento CUID-14.
UPDATE kpi_indicadores_taticos SET
  indicador      = 'Atendimentos Capelania (enfermos/hosp)',
  meta_descricao = '+40%',
  meta_valor     = 40,
  apuracao       = 'Registro de visitas/atendimentos de capelania',
  updated_at     = now()
WHERE id = 'CUID-10';

-- INTG-01: era "Conversoes + Visitantes", volta a ser so conversoes
UPDATE kpi_indicadores_taticos SET
  indicador      = 'No conversoes',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Cards de decisao por culto',
  updated_at     = now()
WHERE id = 'INTG-01';

-- VOLT-02: era "No voluntarios ativos" (consolidado), volta a "ativos (mensal)"
UPDATE kpi_indicadores_taticos SET
  indicador      = 'No voluntarios ativos (mensal)',
  meta_descricao = '30% igreja (6m), 40% (12m)',
  meta_valor     = 30,
  apuracao       = 'Voluntarios servindo no mes',
  updated_at     = now()
WHERE id = 'VOLT-02';

-- VOLT-04: era "Funil de entrada (interessado -> integrado -> entrante)",
--          volta a ser so "Novos voluntarios (entrantes)"
UPDATE kpi_indicadores_taticos SET
  indicador      = 'Novos voluntarios (entrantes)',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Registro de novos voluntarios',
  sort_order     = 4,
  updated_at     = now()
WHERE id = 'VOLT-04';

-- ----------------------------------------------------------------------------
-- 7. Sincronizar nomes/metas dos KPIs reativados com a planilha
-- ----------------------------------------------------------------------------
-- Estes ja existiam no banco (com nomes originais) mas estavam ativo=false.
-- Confirmar que os nomes batem com a planilha.

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Presenca NEXT',
  meta_descricao = 'Dobrar inscritos + 1 encontro/mes',
  apuracao       = 'Lista de inscritos e presenca NEXT',
  updated_at     = now()
WHERE id = 'AMI-04';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Frequencia Bridge',
  meta_descricao = 'Alcancar media de 100 presentes',
  meta_valor     = 100,
  apuracao       = 'Contagem presencial Bridge',
  updated_at     = now()
WHERE id = 'AMI-05';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Conversoes Bridge',
  meta_descricao = '1% do publico alvo presenca',
  meta_valor     = 1,
  apuracao       = 'Cards de decisao Bridge',
  updated_at     = now()
WHERE id = 'AMI-06';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Presenca grupo de pais Bridge',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Lista de presenca grupo de pais',
  updated_at     = now()
WHERE id = 'AMI-07';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'No grupos AMI / inscritos / lideres',
  meta_descricao = '50% jovens em grupos (6m), 70% (12m)',
  meta_valor     = 50,
  apuracao       = 'Relatorio mensal supervisores',
  updated_at     = now()
WHERE id = 'AMI-08';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Batismos criancas (7+)',
  meta_descricao = 'A definir',
  meta_valor     = NULL,
  apuracao       = 'Registro de batismos Kids 7+',
  updated_at     = now()
WHERE id = 'KID-03';

UPDATE kpi_indicadores_taticos SET
  indicador      = '% de membros envolvidos em 2 ou + valores',
  meta_descricao = '75%',
  meta_valor     = 75,
  apuracao       = 'Cruzamento de membros em multiplas areas',
  updated_at     = now()
WHERE id = 'CUID-06';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Papo com Pastor - staff atendido',
  meta_descricao = '+50%',
  meta_valor     = 50,
  apuracao       = 'Lista de atendimentos staff',
  updated_at     = now()
WHERE id = 'CUID-12';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Aconselhamentos',
  meta_descricao = '+30%',
  meta_valor     = 30,
  apuracao       = 'Registro mensal de sessoes',
  updated_at     = now()
WHERE id = 'CUID-14';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'No lideres acompanhados',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Acompanhamento de supervisores',
  updated_at     = now()
WHERE id = 'GRUP-03';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'No visitantes',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Cartao de visitante na recepcao',
  updated_at     = now()
WHERE id = 'INTG-02';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'No voluntarios ativos (semanal)',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Check-in de voluntarios',
  updated_at     = now()
WHERE id = 'VOLT-01';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'No voluntarios ativos (trimestral)',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Voluntarios ativos no trimestre',
  updated_at     = now()
WHERE id = 'VOLT-03';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Voluntarios integrados',
  meta_descricao = 'Monitorar',
  meta_valor     = NULL,
  apuracao       = 'Voluntarios apos integracao',
  updated_at     = now()
WHERE id = 'VOLT-05';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Voluntarios desaparecidos',
  meta_descricao = 'Recuperar 60%',
  meta_valor     = 60,
  apuracao       = 'Voluntarios sem escala 3+ meses',
  updated_at     = now()
WHERE id = 'VOLT-07';

UPDATE kpi_indicadores_taticos SET
  indicador      = '% Interessados integrados',
  meta_descricao = '90%',
  meta_valor     = 90,
  apuracao       = 'Funil de interesse a integracao',
  updated_at     = now()
WHERE id = 'VOLT-08';

UPDATE kpi_indicadores_taticos SET
  indicador      = '% Doadores Grupo C avancando para Grupo B',
  meta_descricao = '30%',
  meta_valor     = 30,
  apuracao       = 'Migracao entre grupos de doadores',
  updated_at     = now()
WHERE id = 'GEN-03';

UPDATE kpi_indicadores_taticos SET
  indicador      = 'Valor total arrecadado no ciclo',
  meta_descricao = 'Base para 2027',
  meta_valor     = NULL,
  apuracao       = 'Relatorio financeiro mensal',
  updated_at     = now()
WHERE id = 'GEN-05';

-- GEN-01 nao aparece na planilha (aba Generosidade tem so 4 KPIs:
-- GEN-02/03/04/05). O processo correspondente ja foi removido em
-- 20260429180000_processos_cleanup. Deixar ativo=false aqui.
UPDATE kpi_indicadores_taticos SET
  ativo = false, updated_at = now()
WHERE id = 'GEN-01';

-- ----------------------------------------------------------------------------
-- 8. Validacoes (rodar apos a migration para confirmar consistencia)
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM kpi_indicadores_taticos WHERE ativo = true;
--   -- esperado: 60
-- SELECT area, count(*) FROM kpi_indicadores_taticos WHERE ativo = true
--   GROUP BY area ORDER BY area;
--   -- esperado:
--   -- ami=9, cba=12, cuidados=7, generosidade=4, grupos=5, integracao=5,
--   -- kids=5, next=4, voluntariado=9
-- SELECT id FROM kpi_indicadores_taticos WHERE id LIKE 'VOL-%';
--   -- esperado: nenhum (todos viraram VOLT-)
-- SELECT processos.id, processos.nome, ids.id as missing
-- FROM processos, unnest(processos.indicador_ids) AS ids(id)
-- LEFT JOIN kpi_indicadores_taticos t ON t.id = ids.id
-- WHERE t.id IS NULL;
--   -- esperado: nenhum (todos os indicador_ids referenciam KPIs existentes)

COMMIT;

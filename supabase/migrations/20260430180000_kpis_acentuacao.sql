-- ============================================================================
-- KPIs: corrigir nomes/metas/pilares com acentos corretos
--
-- Quando alinhei o banco com a planilha (20260430090000), usei strings
-- ASCII sem acento ('Crescimento no de igrejas' em vez de 'Nº de igrejas').
-- Como o frontend agora le do banco (em vez de indicadores.js), os nomes
-- aparecem feios na UI. Esta migration sincroniza com indicadores.js.
-- ============================================================================

BEGIN;

-- AMI
UPDATE kpi_indicadores_taticos SET indicador = 'Frequência AMI (presentes no culto)' WHERE id = 'AMI-01';
UPDATE kpi_indicadores_taticos SET indicador = 'Conversões AMI', meta_descricao = '1% do público alvo presença' WHERE id = 'AMI-02';
UPDATE kpi_indicadores_taticos SET indicador = 'Presença Escola de Discípulos' WHERE id = 'AMI-03';
UPDATE kpi_indicadores_taticos SET indicador = 'Presença NEXT' WHERE id = 'AMI-04';
UPDATE kpi_indicadores_taticos SET indicador = 'Frequência Bridge', meta_descricao = 'Alcançar média de 100 presentes' WHERE id = 'AMI-05';
UPDATE kpi_indicadores_taticos SET indicador = 'Conversões Bridge', meta_descricao = '1% do público alvo presença' WHERE id = 'AMI-06';
UPDATE kpi_indicadores_taticos SET indicador = 'Presença grupo de pais Bridge' WHERE id = 'AMI-07';
UPDATE kpi_indicadores_taticos SET indicador = 'Nº grupos AMI / inscritos / líderes' WHERE id = 'AMI-08';
UPDATE kpi_indicadores_taticos SET indicador = 'Batismos AMI', meta_descricao = '3/mês (1º sem) e 5/mês (2º sem)' WHERE id = 'AMI-09';

-- CBA (12)
UPDATE kpi_indicadores_taticos SET indicador = '% Batismos / Conversões' WHERE id = 'CBA-01';
UPDATE kpi_indicadores_taticos SET indicador = '% Sucesso Interessados Iniciais' WHERE id = 'CBA-02';
UPDATE kpi_indicadores_taticos SET indicador = '% Conversão Next não batizados', meta_descricao = '≥80%' WHERE id = 'CBA-03';
UPDATE kpi_indicadores_taticos SET indicador = '% Contato em menos de 5 dias', meta_descricao = '≥95%' WHERE id = 'CBA-04';
UPDATE kpi_indicadores_taticos SET indicador = '% Resposta Questionários pós-batismo', meta_descricao = '≥80%' WHERE id = 'CBA-05';
UPDATE kpi_indicadores_taticos SET indicador = '% Satisfação processo de batismo', meta_descricao = '≥90%' WHERE id = 'CBA-06';
UPDATE kpi_indicadores_taticos SET indicador = 'Crescimento nº de igrejas na CBA' WHERE id = 'CBA-07';
UPDATE kpi_indicadores_taticos SET indicador = '% Igrejas com implementação cultural registrada' WHERE id = 'CBA-08';
UPDATE kpi_indicadores_taticos SET indicador = '% Igrejas re-inscritas/continuando na CBA' WHERE id = 'CBA-09';
UPDATE kpi_indicadores_taticos SET indicador = '% Igrejas inscritas participando ativamente' WHERE id = 'CBA-11';
UPDATE kpi_indicadores_taticos SET indicador = 'NPS do ciclo CBA', meta_descricao = '≥70 ou 4,0' WHERE id = 'CBA-12';

-- CBKids
UPDATE kpi_indicadores_taticos SET indicador = 'Frequência crianças', unidade = 'crianças' WHERE id = 'KID-01';
UPDATE kpi_indicadores_taticos SET indicador = 'Aceitações (crianças 5+)', unidade = 'crianças' WHERE id = 'KID-02';
UPDATE kpi_indicadores_taticos SET indicador = 'Batismos crianças (7+)' WHERE id = 'KID-03';
UPDATE kpi_indicadores_taticos SET indicador = 'Famílias fazendo devocionais', unidade = 'famílias', meta_descricao = '50 famílias (6-12m)' WHERE id = 'KID-04';
UPDATE kpi_indicadores_taticos SET indicador = 'Saída de voluntários', unidade = 'voluntários', meta_descricao = '≤5 voluntários' WHERE id = 'KID-05';

-- Cuidados
UPDATE kpi_indicadores_taticos SET indicador = 'Novos convertidos atendidos pós-culto' WHERE id = 'CUID-01';
UPDATE kpi_indicadores_taticos SET indicador = 'Novos convertidos engajados em ao menos um valor' WHERE id = 'CUID-05';
UPDATE kpi_indicadores_taticos SET indicador = '% de membros envolvidos em 2 ou + valores' WHERE id = 'CUID-06';
UPDATE kpi_indicadores_taticos SET indicador = 'Encontros Jornada 180' WHERE id = 'CUID-07';
UPDATE kpi_indicadores_taticos SET indicador = 'Atendimentos Capelania (enfermos/hosp)' WHERE id = 'CUID-10';
UPDATE kpi_indicadores_taticos SET indicador = 'Papo com Pastor - staff atendido' WHERE id = 'CUID-12';
UPDATE kpi_indicadores_taticos SET indicador = 'Aconselhamentos' WHERE id = 'CUID-14';

-- Grupos
UPDATE kpi_indicadores_taticos SET indicador = 'Nº participantes em grupos', meta_descricao = '60% da frequência média' WHERE id = 'GRUP-01';
UPDATE kpi_indicadores_taticos SET indicador = 'Nº líderes em treinamento', unidade = 'líderes' WHERE id = 'GRUP-02';
UPDATE kpi_indicadores_taticos SET indicador = 'Nº líderes acompanhados', unidade = 'líderes' WHERE id = 'GRUP-03';
UPDATE kpi_indicadores_taticos SET indicador = 'Nº de grupos / inscritos' WHERE id = 'GRUP-04';
UPDATE kpi_indicadores_taticos SET indicador = '% Aprovação líderes / Satisfação' WHERE id = 'GRUP-05';

-- Integração
UPDATE kpi_indicadores_taticos SET indicador = 'Nº conversões' WHERE id = 'INTG-01';
UPDATE kpi_indicadores_taticos SET indicador = 'Nº visitantes' WHERE id = 'INTG-02';
UPDATE kpi_indicadores_taticos SET indicador = '% Voluntários com 1x1 mensal' WHERE id = 'INTG-04';
UPDATE kpi_indicadores_taticos SET indicador = '% Voluntários em treinamentos' WHERE id = 'INTG-05';
UPDATE kpi_indicadores_taticos SET indicador = '% Acerto questionário trimestral' WHERE id = 'INTG-06';

-- Voluntariado
UPDATE kpi_indicadores_taticos SET indicador = 'Nº voluntários ativos (semanal)', unidade = 'voluntários' WHERE id = 'VOLT-01';
UPDATE kpi_indicadores_taticos SET indicador = 'Nº voluntários ativos (mensal)', unidade = 'voluntários', meta_descricao = '60% da frequência média' WHERE id = 'VOLT-02';
UPDATE kpi_indicadores_taticos SET indicador = 'Nº voluntários ativos (trimestral)', unidade = 'voluntários' WHERE id = 'VOLT-03';
UPDATE kpi_indicadores_taticos SET indicador = 'Novos voluntários (entrantes)', unidade = 'voluntários' WHERE id = 'VOLT-04';
UPDATE kpi_indicadores_taticos SET indicador = 'Voluntários integrados', unidade = 'voluntários' WHERE id = 'VOLT-05';
UPDATE kpi_indicadores_taticos SET indicador = 'Voluntários no Services' WHERE id = 'VOLT-06';
UPDATE kpi_indicadores_taticos SET indicador = 'Voluntários ''desaparecidos''', unidade = 'voluntários' WHERE id = 'VOLT-07';
UPDATE kpi_indicadores_taticos SET indicador = '% Interessados integrados' WHERE id = 'VOLT-08';
UPDATE kpi_indicadores_taticos SET indicador = 'Satisfação voluntários' WHERE id = 'VOLT-09';

-- NEXT
UPDATE kpi_indicadores_taticos SET indicador = '% Inscritos não batizados convertidos em batizandos pós-NEXT' WHERE id = 'NEXT-01';
UPDATE kpi_indicadores_taticos SET indicador = '% Inscritos não voluntários convertidos em voluntários pós-NEXT' WHERE id = 'NEXT-02';
UPDATE kpi_indicadores_taticos SET indicador = '% Inscritos com registro de oferta/dízimo pós-NEXT' WHERE id = 'NEXT-03';
UPDATE kpi_indicadores_taticos SET meta_descricao = '≥70 ou 4,0' WHERE id = 'NEXT-04';

-- Generosidade
UPDATE kpi_indicadores_taticos SET indicador = '% Doadores ativos com recorrência ≥3 meses' WHERE id = 'GEN-02';
UPDATE kpi_indicadores_taticos SET indicador = '% Doadores Grupo C avançando para Grupo B' WHERE id = 'GEN-03';
UPDATE kpi_indicadores_taticos SET indicador = '% Participantes Next convertidos em doadores' WHERE id = 'GEN-04';

-- Pilares com acento
UPDATE kpi_indicadores_taticos SET pilar = 'Serviço'   WHERE pilar = 'Servico';
UPDATE kpi_indicadores_taticos SET pilar = 'Comunhão'  WHERE pilar = 'Comunhao';
UPDATE kpi_indicadores_taticos SET pilar = 'Retenção'  WHERE pilar = 'Retencao';
UPDATE kpi_indicadores_taticos SET pilar = 'Pós-Next'  WHERE pilar = 'Pos-Next';

-- Atualiza updated_at em todas as linhas modificadas (boa pratica)
UPDATE kpi_indicadores_taticos SET updated_at = now()
WHERE id LIKE ANY (ARRAY['AMI-%','CBA-%','KID-%','CUID-%','GRUP-%','INTG-%','VOLT-%','NEXT-%','GEN-%']);

COMMIT;

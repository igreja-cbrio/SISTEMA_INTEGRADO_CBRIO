-- Seed: 69 processos genericos, um para cada KPI da planilha
-- Cada processo tem nome curto + descricao do que medir

-- AMI (Geracional)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Frequência AMI', 'Contar presentes no culto AMI semanalmente', 'AMI', 'Geracional', '{"AMI-01"}', 'ativo'),
  ('Conversão AMI', 'Registrar conversões nos cultos AMI', 'AMI', 'Geracional', '{"AMI-02"}', 'ativo'),
  ('Presença Escola de Discípulos', 'Contar presentes na Escola de Discípulos AMI', 'AMI', 'Geracional', '{"AMI-03"}', 'ativo'),
  ('Presença NEXT AMI', 'Contar presentes nos encontros NEXT da AMI', 'AMI', 'Geracional', '{"AMI-04"}', 'ativo'),
  ('Frequência Bridge', 'Contar presentes nos cultos Bridge', 'AMI', 'Geracional', '{"AMI-05"}', 'ativo'),
  ('Conversão Bridge', 'Registrar conversões nos cultos Bridge', 'AMI', 'Geracional', '{"AMI-06"}', 'ativo'),
  ('Grupo de pais Bridge', 'Contar presentes no grupo de pais do Bridge', 'AMI', 'Geracional', '{"AMI-07"}', 'ativo'),
  ('Grupos AMI', 'Levantar quantidade de grupos, inscritos e líderes AMI', 'AMI', 'Geracional', '{"AMI-08"}', 'ativo'),
  ('Batismos AMI', 'Registrar batismos realizados na AMI', 'AMI', 'Geracional', '{"AMI-09"}', 'ativo');

-- CBA (Ministerial)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Taxa batismo/conversão', 'Calcular percentual de batismos sobre conversões', 'CBA', 'Ministerial', '{"CBA-01"}', 'ativo'),
  ('Sucesso interessados iniciais', 'Medir taxa de sucesso dos interessados iniciais no CBA', 'CBA', 'Ministerial', '{"CBA-02"}', 'ativo'),
  ('Conversão Next não batizados', 'Medir conversão de participantes do Next em batizandos', 'CBA', 'Ministerial', '{"CBA-03"}', 'ativo'),
  ('Contato em 5 dias', 'Garantir contato com interessados em até 5 dias', 'CBA', 'Ministerial', '{"CBA-04"}', 'ativo'),
  ('Questionários pós-batismo', 'Coletar respostas dos questionários pós-batismo', 'CBA', 'Ministerial', '{"CBA-05"}', 'ativo'),
  ('Satisfação batismo', 'Medir satisfação no processo de batismo', 'CBA', 'Ministerial', '{"CBA-06"}', 'ativo'),
  ('Crescimento igrejas CBA', 'Acompanhar crescimento do número de igrejas na CBA', 'CBA', 'Ministerial', '{"CBA-07"}', 'ativo'),
  ('Implementação cultural igrejas', 'Medir igrejas com implementação cultural registrada', 'CBA', 'Ministerial', '{"CBA-08"}', 'ativo'),
  ('Retenção igrejas CBA', 'Medir taxa de igrejas re-inscritas na CBA', 'CBA', 'Ministerial', '{"CBA-09"}', 'ativo'),
  ('Make a Difference', 'Acompanhar valor arrecadado no Make a Difference', 'CBA', 'Ministerial', '{"CBA-10"}', 'ativo'),
  ('Participação ativa igrejas', 'Medir igrejas inscritas participando ativamente', 'CBA', 'Ministerial', '{"CBA-11"}', 'ativo'),
  ('NPS ciclo CBA', 'Coletar e calcular NPS do ciclo CBA', 'CBA', 'Ministerial', '{"CBA-12"}', 'ativo');

-- CBKids (Geracional)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Frequência crianças', 'Contar crianças presentes semanalmente', 'CBKids', 'Geracional', '{"KID-01"}', 'ativo'),
  ('Aceitações crianças', 'Registrar aceitações de crianças 5+', 'CBKids', 'Geracional', '{"KID-02"}', 'ativo'),
  ('Batismos crianças', 'Registrar batismos de crianças 7+', 'CBKids', 'Geracional', '{"KID-03"}', 'ativo'),
  ('Devocionais em família', 'Acompanhar famílias fazendo devocionais', 'CBKids', 'Geracional', '{"KID-04"}', 'ativo'),
  ('Retenção voluntários Kids', 'Monitorar saída de voluntários do CBKids', 'CBKids', 'Geracional', '{"KID-05"}', 'ativo');

-- Cuidados (Ministerial)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Atendimento pós-culto', 'Atender novos convertidos após cada culto', 'Cuidados', 'Ministerial', '{"CUID-01"}', 'ativo'),
  ('Contato dia seguinte', 'Contactar novos convertidos no dia seguinte ao culto', 'Cuidados', 'Ministerial', '{"CUID-02"}', 'ativo'),
  ('Recrutamento voluntários Cuidados', 'Recrutar novos voluntários para a área de Cuidados', 'Cuidados', 'Ministerial', '{"CUID-03"}', 'ativo'),
  ('Treinamento voluntários Cuidados', 'Treinar e capacitar voluntários de Cuidados', 'Cuidados', 'Ministerial', '{"CUID-04"}', 'ativo'),
  ('Jornada espiritual novos', 'Acompanhar jornada espiritual de novos membros', 'Cuidados', 'Ministerial', '{"CUID-05"}', 'ativo'),
  ('Jornada espiritual antigos', 'Acompanhar jornada espiritual de membros antigos', 'Cuidados', 'Ministerial', '{"CUID-06"}', 'ativo'),
  ('Encontros Jornada 180', 'Realizar encontros semanais da Jornada 180', 'Cuidados', 'Ministerial', '{"CUID-07"}', 'ativo'),
  ('Devocionais Jornada 180', 'Enviar devocionais diários da Jornada 180', 'Cuidados', 'Ministerial', '{"CUID-08"}', 'ativo'),
  ('Atendimentos Jornada 180', 'Realizar atendimentos individuais da Jornada 180', 'Cuidados', 'Ministerial', '{"CUID-09"}', 'ativo'),
  ('Capelania hospitalar', 'Realizar atendimentos de capelania a enfermos', 'Cuidados', 'Ministerial', '{"CUID-10"}', 'ativo'),
  ('Voluntários Capelania', 'Recrutar e acompanhar voluntários de Capelania', 'Cuidados', 'Ministerial', '{"CUID-11"}', 'ativo'),
  ('Papo com Pastor', 'Atender staff no Papo com Pastor mensal', 'Cuidados', 'Ministerial', '{"CUID-12"}', 'ativo'),
  ('Feedback RH pastoral', 'Enviar feedbacks ao RH sobre Papo com Pastor', 'Cuidados', 'Ministerial', '{"CUID-13"}', 'ativo'),
  ('Aconselhamentos', 'Realizar sessões de aconselhamento', 'Cuidados', 'Ministerial', '{"CUID-14"}', 'ativo');

-- Grupos (Ministerial)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Participantes em grupos', 'Contar participantes ativos nos grupos de conexão', 'Grupos', 'Ministerial', '{"GRUP-01"}', 'ativo'),
  ('Treinamento de líderes', 'Acompanhar líderes em treinamento', 'Grupos', 'Ministerial', '{"GRUP-02"}', 'ativo'),
  ('Acompanhamento de líderes', 'Monitorar líderes acompanhados ativamente', 'Grupos', 'Ministerial', '{"GRUP-03"}', 'ativo'),
  ('Censo de grupos', 'Levantar número de grupos e inscritos semestralmente', 'Grupos', 'Ministerial', '{"GRUP-04"}', 'ativo'),
  ('Satisfação líderes', 'Medir aprovação e satisfação dos líderes de grupo', 'Grupos', 'Ministerial', '{"GRUP-05"}', 'ativo');

-- Integração (Ministerial)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Registro de conversões', 'Registrar conversões semanais nos cultos', 'Integracao', 'Ministerial', '{"INTG-01"}', 'ativo'),
  ('Registro de visitantes', 'Registrar visitantes semanais nos cultos', 'Integracao', 'Ministerial', '{"INTG-02"}', 'ativo'),
  ('Contagem de presentes', 'Contar presentes semanais nos cultos', 'Integracao', 'Ministerial', '{"INTG-03"}', 'ativo'),
  ('1x1 mensal voluntários', 'Garantir reunião 1x1 mensal com voluntários', 'Integracao', 'Ministerial', '{"INTG-04"}', 'ativo'),
  ('Treinamento voluntários Integração', 'Capacitar voluntários da Integração', 'Integracao', 'Ministerial', '{"INTG-05"}', 'ativo'),
  ('Questionário trimestral', 'Aplicar e medir acerto no questionário trimestral', 'Integracao', 'Ministerial', '{"INTG-06"}', 'ativo');

-- Voluntariado (Ministerial)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Voluntários ativos semanal', 'Contar voluntários ativos por semana', 'Voluntariado', 'Ministerial', '{"VOLT-01"}', 'ativo'),
  ('Voluntários ativos mensal', 'Contar voluntários ativos por mês', 'Voluntariado', 'Ministerial', '{"VOLT-02"}', 'ativo'),
  ('Voluntários ativos trimestral', 'Contar voluntários ativos por trimestre', 'Voluntariado', 'Ministerial', '{"VOLT-03"}', 'ativo'),
  ('Novos voluntários', 'Registrar novos voluntários entrantes', 'Voluntariado', 'Ministerial', '{"VOLT-04"}', 'ativo'),
  ('Integração de voluntários', 'Acompanhar integração de novos voluntários', 'Voluntariado', 'Ministerial', '{"VOLT-05"}', 'ativo'),
  ('Voluntários no Services', 'Medir voluntários escalados via Services', 'Voluntariado', 'Ministerial', '{"VOLT-06"}', 'ativo'),
  ('Recuperação de voluntários', 'Buscar e recuperar voluntários desaparecidos', 'Voluntariado', 'Ministerial', '{"VOLT-07"}', 'ativo'),
  ('Integração de interessados', 'Medir integração de interessados em voluntariado', 'Voluntariado', 'Ministerial', '{"VOLT-08"}', 'ativo'),
  ('Satisfação voluntários', 'Medir satisfação dos voluntários semestralmente', 'Voluntariado', 'Ministerial', '{"VOLT-09"}', 'ativo');

-- NEXT (Ministerial)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Conversão batismo pós-NEXT', 'Medir inscritos não batizados que se tornam batizandos', 'NEXT', 'Ministerial', '{"NEXT-01"}', 'ativo'),
  ('Conversão voluntariado pós-NEXT', 'Medir inscritos que se tornam voluntários pós-NEXT', 'NEXT', 'Ministerial', '{"NEXT-02"}', 'ativo'),
  ('Conversão generosidade pós-NEXT', 'Medir inscritos com registro de oferta/dízimo pós-NEXT', 'NEXT', 'Ministerial', '{"NEXT-03"}', 'ativo'),
  ('NPS do NEXT', 'Coletar e calcular NPS dos encontros NEXT', 'NEXT', 'Ministerial', '{"NEXT-04"}', 'ativo');

-- Generosidade (Ministerial)
INSERT INTO processos (nome, descricao, area, categoria, indicador_ids, status) VALUES
  ('Crescimento doadores', 'Acompanhar crescimento do número de doadores ativos', 'Generosidade', 'Ministerial', '{"GEN-01"}', 'ativo'),
  ('Recorrência doadores', 'Medir doadores ativos com recorrência >= 3 meses', 'Generosidade', 'Ministerial', '{"GEN-02"}', 'ativo'),
  ('Evolução doadores C para B', 'Medir doadores do Grupo C avançando para Grupo B', 'Generosidade', 'Ministerial', '{"GEN-03"}', 'ativo'),
  ('Next para doadores', 'Medir participantes do Next convertidos em doadores', 'Generosidade', 'Ministerial', '{"GEN-04"}', 'ativo'),
  ('Arrecadação do ciclo', 'Acompanhar valor total arrecadado no ciclo', 'Generosidade', 'Ministerial', '{"GEN-05"}', 'ativo');

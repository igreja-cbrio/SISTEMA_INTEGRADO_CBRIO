-- ============================================================================
-- SEED · 75 KRs (3 por OKR) para os 25 objetivos gerais
--
-- Padrao de 3 KRs por OKR (validado com Marcos em 2026-05-08):
--   ordem 1: Volume / acumulado no ciclo (ano)
--   ordem 2: Comparacao historica (vs ciclo anterior)
--   ordem 3: Threshold / consistencia (floor minimo, zero falhas, etc)
--
-- Idempotente: insere apenas se nao existe KR daquele objetivo+ordem.
-- Marcos vai editar pelo /gestao Estrutura OKR.
-- ============================================================================

WITH novos_krs AS (
  SELECT * FROM (VALUES
  -- ── SEGUIR ────────────────────────────────────────────────────────────────
  -- 1. Aumentar a frequencia
  ('4b2bbe84-681b-fbd9-7e6f-343f72e7c1dc'::uuid, 'Frequencia media acumulada do ano +15%', 'Soma a frequencia presencial dos cultos no ano e compara com 2025. Vem auto via vw_culto_stats.', 'avg(presencial_adulto + presencial_kids) / avg(2025)', 15, '+15% vs 2025', '%', 1),
  ('4b2bbe84-681b-fbd9-7e6f-343f72e7c1dc'::uuid, 'Frequencia mensal sobe vs mesmo mes 2025 em >=10 meses', 'Compara cada mes do ano com o mesmo mes do ano passado.', 'count(meses com freq_2026 > freq_2025)', 10, '>=10 meses', 'meses', 2),
  ('4b2bbe84-681b-fbd9-7e6f-343f72e7c1dc'::uuid, '0 cultos com queda > 15% vs semana anterior', 'Alerta de qualidade: nenhum culto com queda critica.', 'count(cultos com freq_atual < freq_anterior * 0.85)', 0, '0 cultos', 'cultos', 3),

  -- 2. Aumentar Aceitacoes
  ('51ced6d4-baa9-bbc4-c99a-ac2b4861eb2d'::uuid, '>=1% dos presentes registram decisao (media do ano)', 'Razao decisoes / presentes em cada culto, media do ano. Auto via int_visitantes + cultos.', 'sum(decisoes) / sum(presencial) * 100', 1, '>=1% dos presentes', '%', 1),
  ('51ced6d4-baa9-bbc4-c99a-ac2b4861eb2d'::uuid, 'Total de conversoes do ano cresce >=20% vs 2025', 'Comparativo anual de conversoes registradas.', 'sum(conversoes_2026) vs sum(conversoes_2025)', 20, '+20% vs 2025', '%', 2),
  ('51ced6d4-baa9-bbc4-c99a-ac2b4861eb2d'::uuid, '0 trimestres com media abaixo do trimestre anterior', 'Garantia de tendencia ascendente trimestral.', 'count(trimestres com avg_atual < avg_anterior)', 0, '0 trimestres', 'trimestres', 3),

  -- 3. Aumentar batismos
  ('ac906f19-970a-d651-8c84-28f02f01a923'::uuid, '>=30% dos novos convertidos batizados em <=90 dias', 'Funil decisao -> batismo medido por janela de 90d. Auto via mem_trilha_valores + batismo_inscricoes.', 'count(batizados em <=90d da decisao) / total(convertidos)', 30, '>=30% em 90 dias', '%', 1),
  ('ac906f19-970a-d651-8c84-28f02f01a923'::uuid, 'Total de batismos do ano cresce >=25% vs 2025', 'Crescimento anual no volume absoluto.', 'sum(batismos_2026) vs sum(batismos_2025)', 25, '+25% vs 2025', '%', 2),
  ('ac906f19-970a-d651-8c84-28f02f01a923'::uuid, '>=6 datas de batismo realizadas no ano', 'Cadencia minima de 1 evento a cada 2 meses.', 'count distinct datas com batismos > 0', 6, '>=6 datas/ano', 'datas', 3),

  -- 6. Aumentar a frequencia NEXT
  ('68c17f72-72a3-2369-8d30-dc1f9db88a47'::uuid, '>=80% dos inscritos no NEXT comparecem', 'Taxa de presenca por ciclo NEXT. Manual ate criar modulo NEXT.', 'count(presentes) / count(inscritos)', 80, '>=80% comparecimento', '%', 1),
  ('68c17f72-72a3-2369-8d30-dc1f9db88a47'::uuid, 'Crescimento >=30% no nº medio de presentes por ciclo vs 2025', 'Comparativo ciclo a ciclo entre 2025 e 2026.', 'avg(presentes_ciclo_2026) vs avg(presentes_ciclo_2025)', 30, '+30% vs 2025', '%', 2),
  ('68c17f72-72a3-2369-8d30-dc1f9db88a47'::uuid, 'Ao menos 1 ciclo NEXT por trimestre realizado', 'Cadencia minima de 1 ciclo a cada 3 meses.', 'count(ciclos por trimestre) >= 1', 4, '4 ciclos/ano', 'ciclos', 3),

  -- 25. Melhorar qualidade do Next
  ('4af2c533-61d3-c3cb-6608-67ba0850455b'::uuid, 'NPS medio do ano >= 70', 'Pesquisa NPS pos-NEXT. Depende de modulo NPS futuro.', 'avg(nps_next) no ano', 70, 'NPS >= 70 (ou nota 4,0)', 'nota', 1),
  ('4af2c533-61d3-c3cb-6608-67ba0850455b'::uuid, '>=80% dos respondentes recomendam o NEXT', 'Promotores na pesquisa NPS.', 'count(promotores) / count(respondentes)', 80, '>=80% promotores', '%', 2),
  ('4af2c533-61d3-c3cb-6608-67ba0850455b'::uuid, '0 ciclos com NPS abaixo de 50', 'Floor minimo de qualidade.', 'count(ciclos com nps < 50)', 0, '0 ciclos < 50', 'ciclos', 3),

  -- ── INVESTIR TEMPO ────────────────────────────────────────────────────────
  -- 4. Aumentar Pessoas fazendo Devocionais
  ('576c04ec-88a2-40f3-6ba2-9d03fe65de96'::uuid, '>=25% das familias do CBKids registrando devocional mensal', 'Familias unicas com >=1 devocional registrado no mes. Auto via mem_devocionais quando modulo for criado.', 'count distinct familias com devocional / total familias kids', 25, '>=25% (50 familias)', '%', 1),
  ('576c04ec-88a2-40f3-6ba2-9d03fe65de96'::uuid, 'Crescimento >=50% no nº de devocionais/mes vs 2025', 'Volume mensal de devocionais registrados.', 'avg(devocionais_mes_2026) vs avg(devocionais_mes_2025)', 50, '+50% vs 2025', '%', 2),
  ('576c04ec-88a2-40f3-6ba2-9d03fe65de96'::uuid, '0 meses sem registro em alguma area', 'Cobertura por area: kids, AMI, Bridge, sede, online.', 'count(area-mes sem registro)', 0, '0 vazios', 'area-mes', 3),

  -- 18. Aumentar inscritos Jornada 180
  ('8b98695d-d7ca-25c8-8150-886d0c4f92ee'::uuid, 'Total de inscritos no ano >= 200', 'Volume absoluto de novos inscritos. Auto via cui_jornada180.', 'count(inscricoes no ano)', 200, '>=200 inscritos', 'pessoas', 1),
  ('8b98695d-d7ca-25c8-8150-886d0c4f92ee'::uuid, 'Cada ciclo cresce >=15% em inscritos vs ciclo anterior', 'Crescimento entre ciclos consecutivos do J180.', 'inscritos_ciclo / inscritos_ciclo_anterior', 15, '+15% por ciclo', '%', 2),
  ('8b98695d-d7ca-25c8-8150-886d0c4f92ee'::uuid, '>=60% dos inscritos completam os encontros', 'Taxa de conclusao do programa.', 'count(concluidos) / count(inscritos)', 60, '>=60% concluem', '%', 3),

  -- 19. Aumentar capelania atendidas
  ('74cf20d3-42e2-9268-964b-11a61964624e'::uuid, '>=90% das solicitacoes respondidas em <=48h', 'SLA de primeira resposta. Manual ate criar modulo Solicitacoes.', 'count(respondidas em <=48h) / total', 90, '>=90% em 48h', '%', 1),
  ('74cf20d3-42e2-9268-964b-11a61964624e'::uuid, '100% das solicitacoes atendidas dentro do mes', 'SLA de fechamento mensal.', 'count(fechadas no mes) / count(abertas no mes)', 100, '100% no mes', '%', 2),
  ('74cf20d3-42e2-9268-964b-11a61964624e'::uuid, '0 solicitacoes abertas ha > 7 dias sem encaminhamento', 'Backlog maximo de 7 dias.', 'count(abertas ha > 7d sem encaminhamento)', 0, '0 backlog > 7d', 'solicitacoes', 3),

  -- 20. Aumentar aconselhamento atendidas
  ('f65ba051-af87-fe75-4d82-c1d51c9d88f0'::uuid, '>=90% das solicitacoes encaminhadas em <=48h', 'SLA de encaminhamento. Manual ate modulo Solicitacoes.', 'count(encaminhadas em <=48h) / total', 90, '>=90% em 48h', '%', 1),
  ('f65ba051-af87-fe75-4d82-c1d51c9d88f0'::uuid, '100% com primeira sessao agendada em <=14 dias', 'SLA de agendamento da 1ª sessao.', 'count(com 1ª sessao em <=14d) / total', 100, '100% em 14 dias', '%', 2),
  ('f65ba051-af87-fe75-4d82-c1d51c9d88f0'::uuid, '0 solicitacoes abertas ha > 14 dias sem agendamento', 'Backlog maximo de 14 dias.', 'count(abertas ha > 14d sem agendamento)', 0, '0 backlog > 14d', 'solicitacoes', 3),

  -- 21. Aumentar convertidos atendidos por pastores na semana
  ('5ffafa58-a8ed-d248-a410-c4c8ffd69c14'::uuid, '>=95% dos convertidos com contato pastoral em <=7 dias', 'Janela de cuidado pos-decisao. Auto via cui_convertidos.atendido_apos_culto.', 'count(atendidos em <=7d) / total convertidos', 95, '>=95% em 7 dias', '%', 1),
  ('5ffafa58-a8ed-d248-a410-c4c8ffd69c14'::uuid, '100% dos cultos com lista repassada na 2ª-feira', 'Processo: lista de convertidos do culto -> capelania na 2ª-feira.', 'count(cultos com lista repassada) / total cultos', 100, '100% das semanas', '%', 2),
  ('5ffafa58-a8ed-d248-a410-c4c8ffd69c14'::uuid, '0 semanas com convertidos sem atendimento', 'Floor: nenhuma semana com convertido orfao.', 'count(semanas com >0 convertidos sem atendimento)', 0, '0 semanas', 'semanas', 3),

  -- ── CONECTAR PESSOAS ──────────────────────────────────────────────────────
  -- 7. Aumentar a frequencia de grupos
  ('e9934d9a-dd89-6a2b-0872-d20bb2e2f6aa'::uuid, 'Total de frequentes em grupos >= 1.300 (cresce 30% sobre base 1.000)', 'Volume anual. Auto via mem_grupo_membros.', 'count distinct membros frequentes em grupos no ano', 1300, '>=1300 pessoas', 'pessoas', 1),
  ('e9934d9a-dd89-6a2b-0872-d20bb2e2f6aa'::uuid, '>=80% das semanas com crescimento positivo vs anterior', 'Tendencia ascendente semanal.', 'count(semanas com freq_atual > freq_anterior) / total semanas', 80, '>=80% das semanas', '%', 2),
  ('e9934d9a-dd89-6a2b-0872-d20bb2e2f6aa'::uuid, '0 grupos com > 4 semanas consecutivas sem registro', 'Saude da operacao: grupo precisa registrar presenca.', 'count(grupos com > 4 semanas sem registro)', 0, '0 grupos inativos', 'grupos', 3),

  -- 9. Aumentar lideres em treinamento
  ('ad2904a2-a3ef-6836-6933-2b6e48755ce6'::uuid, '>=50% dos lideres ativos passam por treinamento no ano', 'Volume relativo. Manual: lider_treinados em dados_brutos.', 'count(lideres_treinados) / count(lideres_ativos)', 50, '>=50% dos lideres', '%', 1),
  ('ad2904a2-a3ef-6836-6933-2b6e48755ce6'::uuid, 'Crescimento >=50% no nº de lideres em formacao vs 2025', 'Comparativo anual.', 'count(lideres_treinados_2026) vs count(lideres_treinados_2025)', 50, '+50% vs 2025', '%', 2),
  ('ad2904a2-a3ef-6836-6933-2b6e48755ce6'::uuid, '>=1 turma de treinamento ativa por trimestre', 'Cadencia minima.', 'count(turmas ativas por trimestre) >= 1', 4, '4 turmas/ano', 'turmas', 3),

  -- 10. Aumentar lideres acompanhados
  ('72f8d900-60df-4a3b-c9f2-4dd0f990482f'::uuid, '100% dos lideres com >=1 encontro de supervisao por mes', 'Cobertura mensal de acompanhamento.', 'count(lideres com >=1 encontro/mes) / total lideres', 100, '100% dos lideres/mes', '%', 1),
  ('72f8d900-60df-4a3b-c9f2-4dd0f990482f'::uuid, '>=90% dos lideres com registro nos ultimos 60 dias', 'Janela rolling de saude.', 'count(lideres com encontro nos 60d) / total lideres', 90, '>=90% em 60 dias', '%', 2),
  ('72f8d900-60df-4a3b-c9f2-4dd0f990482f'::uuid, '0 lideres sem encontro ha > 90 dias', 'Floor: nenhum lider esquecido.', 'count(lideres sem encontro ha > 90d)', 0, '0 lideres orfaos', 'lideres', 3),

  -- 11. Aumentar numero de grupos
  ('e6f20018-78ac-1c2d-ad06-27178a7b8d53'::uuid, 'Total de grupos ativos no ano >= baseline + 20%', 'Crescimento anual no nº de grupos. Auto via mem_grupos.', 'count(grupos ativos no ano)', 20, '+20% vs baseline', '%', 1),
  ('e6f20018-78ac-1c2d-ad06-27178a7b8d53'::uuid, '>=5 novos grupos plantados no ano', 'Volume absoluto de novos.', 'count(grupos criados no ano)', 5, '>=5 novos', 'grupos', 2),
  ('e6f20018-78ac-1c2d-ad06-27178a7b8d53'::uuid, '0 ciclos com fechamento liquido', 'Sem trimestres fechando mais grupos do que abrindo.', 'count(trimestres com fechamentos > aberturas)', 0, '0 trimestres negativos', 'trimestres', 3),

  -- 12. Aumentar a satisfacao dos lideres grupos
  ('72c65b56-5fce-9d0c-6f4c-f4bfbced74f5'::uuid, 'NPS medio dos lideres >= 70', 'Pesquisa semestral. Depende de modulo NPS futuro.', 'avg(nps_lideres) no ano', 70, 'NPS >= 70 (ou 4,0)', 'nota', 1),
  ('72c65b56-5fce-9d0c-6f4c-f4bfbced74f5'::uuid, '>=90% dos lideres respondem a pesquisa semestral', 'Taxa de resposta nas 2 ondas do ano.', 'count(respondentes) / count(lideres ativos)', 90, '>=90% respondem', '%', 2),
  ('72c65b56-5fce-9d0c-6f4c-f4bfbced74f5'::uuid, '0 areas com NPS abaixo de 50 nos 2 ciclos', 'Floor minimo por area.', 'count(area-ciclo com nps < 50)', 0, '0 areas vermelhas', 'areas', 3),

  -- ── SERVIR ─────────────────────────────────────────────────────────────────
  -- 5. Recuperar voluntarios inativos
  ('b1dea2d4-5286-44d3-d26d-ec8f59a27632'::uuid, '>=60% dos inativos > 3 meses retomam servico no ano', 'Recuperacao da base inativa. Auto via mem_voluntarios.', 'count(recuperados) / count(inativos > 3m)', 60, '>=60% recuperados', '%', 1),
  ('b1dea2d4-5286-44d3-d26d-ec8f59a27632'::uuid, 'Taxa de saida mensal <= 5% da base ativa', 'Saida liquida mensal sob controle.', 'count(saidas_mes) / count(ativos_mes_anterior)', 5, '<=5%/mes', '%', 2),
  ('b1dea2d4-5286-44d3-d26d-ec8f59a27632'::uuid, '0 meses com taxa de saida > 10%', 'Floor: nenhum mes com sangria.', 'count(meses com saida > 10%)', 0, '0 meses criticos', 'meses', 3),

  -- 14. Aumentar voluntarios ativos
  ('7709a3c7-b41b-374a-555e-7853c5207e0f'::uuid, '>=30% dos frequentes ativos servindo (6m) -> 40% (12m)', '% igreja servindo. Auto via mem_voluntarios + frequentes.', 'count(voluntarios_ativos) / count(frequentes)', 30, '30% (6m) / 40% (12m)', '%', 1),
  ('7709a3c7-b41b-374a-555e-7853c5207e0f'::uuid, 'Total de voluntarios ativos no ano >= 750', 'Volume absoluto.', 'count distinct voluntarios ativos no ano', 750, '>=750 pessoas', 'pessoas', 2),
  ('7709a3c7-b41b-374a-555e-7853c5207e0f'::uuid, '0 areas com cobertura abaixo de 80% das vagas', 'Floor: cada area com >=80% das vagas preenchidas.', 'count(areas com cobertura < 80%)', 0, '0 areas descobertas', 'areas', 3),

  -- 15. Aumentar check-in correto
  ('3b0e542e-909a-c740-c73c-61c0057f7fc6'::uuid, '>=95% dos escalados com check-in registrado', 'Taxa de check-in no Planning Center / sistema. Manual ou via integracao.', 'count(checkins_validos) / count(escalas)', 95, '>=95% checkin', '%', 1),
  ('3b0e542e-909a-c740-c73c-61c0057f7fc6'::uuid, '>=90% dos voluntarios com checkin correto em >=80% das escalas', 'Consistencia individual.', 'count(voluntarios com >=80% acerto) / total', 90, '>=90% consistentes', '%', 2),
  ('3b0e542e-909a-c740-c73c-61c0057f7fc6'::uuid, '0 cultos com > 10% de check-ins faltantes', 'Floor de qualidade por culto.', 'count(cultos com checkin < 90%)', 0, '0 cultos falhos', 'cultos', 3),

  -- 16. Garantir alocacao de quem deseja servir
  ('7b571264-6276-b63f-8c7f-70a64bfc5f56'::uuid, '100% das solicitacoes com 1ª resposta em <=48h', 'SLA de primeira resposta. Depende de modulo Solicitacoes.', 'count(respondidas em <=48h) / total', 100, '100% em 48h', '%', 1),
  ('7b571264-6276-b63f-8c7f-70a64bfc5f56'::uuid, '>=90% dos interessados alocados em <=14 dias', 'SLA de alocacao final.', 'count(alocados em <=14d) / total', 90, '>=90% em 14 dias', '%', 2),
  ('7b571264-6276-b63f-8c7f-70a64bfc5f56'::uuid, '0 solicitacoes abertas ha > 30 dias sem alocacao', 'Backlog maximo absoluto.', 'count(abertas ha > 30d sem alocacao)', 0, '0 backlog > 30d', 'solicitacoes', 3),

  -- 17. Aumentar a satisfacao de voluntarios
  ('82364ebf-a47b-ef3b-fe96-cd509ebd43ec'::uuid, 'NPS medio >= 70', 'Pesquisa semestral. Depende de modulo NPS futuro.', 'avg(nps_voluntarios) no ano', 70, 'NPS >= 70 (ou 4,0)', 'nota', 1),
  ('82364ebf-a47b-ef3b-fe96-cd509ebd43ec'::uuid, '>=80% dos voluntarios respondem pesquisa semestral', 'Taxa de resposta nas 2 ondas.', 'count(respondentes) / count(voluntarios ativos)', 80, '>=80% respondem', '%', 2),
  ('82364ebf-a47b-ef3b-fe96-cd509ebd43ec'::uuid, '0 areas com NPS abaixo de 50 nos 2 ciclos', 'Floor minimo por area.', 'count(area-ciclo com nps < 50)', 0, '0 areas vermelhas', 'areas', 3),

  -- 22. Aumentar quantidade de voluntarios em treinamento
  ('b06ccb1b-e268-c5d5-6c63-bfbeeb07a9dd'::uuid, '>=90% dos voluntarios novos passam por integracao no 1º mes', 'Onboarding obrigatorio. Manual ate ter modulo de treinamento.', 'count(novos_treinados em <=30d) / count(novos)', 90, '>=90% em 30 dias', '%', 1),
  ('b06ccb1b-e268-c5d5-6c63-bfbeeb07a9dd'::uuid, '>=50% da base ativa com algum treinamento no ano', 'Cobertura anual de treinamento.', 'count(voluntarios_treinados) / count(ativos)', 50, '>=50% treinados', '%', 2),
  ('b06ccb1b-e268-c5d5-6c63-bfbeeb07a9dd'::uuid, '0 trimestres sem turma de treinamento ativa', 'Cadencia minima.', 'count(trimestres sem turma)', 0, '0 trimestres vazios', 'trimestres', 3),

  -- ── GENEROSIDADE ──────────────────────────────────────────────────────────
  -- 8. Aumentar dizimistas/ofertantes recorrentes
  ('54277517-82cb-7e83-4b63-43094277a19c'::uuid, '>=60% dos ativos com 3+ meses consecutivos', 'Quem doou em 3 meses seguidos. Auto via mem_contribuicoes.', 'count(recorrentes 3m+) / count(ativos)', 60, '>=60% recorrentes', '%', 1),
  ('54277517-82cb-7e83-4b63-43094277a19c'::uuid, 'Total de doadores recorrentes no ano cresce >=25% vs 2025', 'Comparativo anual.', 'count(recorrentes_2026) vs count(recorrentes_2025)', 25, '+25% vs 2025', '%', 2),
  ('54277517-82cb-7e83-4b63-43094277a19c'::uuid, '0 trimestres com queda no nº absoluto vs anterior', 'Tendencia ascendente trimestral.', 'count(trimestres com recorrentes_atual < anterior)', 0, '0 trimestres', 'trimestres', 3),

  -- 13. Melhorar Qualidade de doadores
  ('8853cdc2-188f-6a5a-f678-c292ec57af86'::uuid, '>=30% dos doadores Grupo C avancam para B', 'Migracao C->B no ano. Manual ate ter modulo de classificacao.', 'count(C->B no ano) / count(C inicio do ano)', 30, '>=30% sobem', '%', 1),
  ('8853cdc2-188f-6a5a-f678-c292ec57af86'::uuid, '>=5% dos doadores Grupo B avancam para A', 'Migracao B->A no ano.', 'count(B->A no ano) / count(B inicio do ano)', 5, '>=5% sobem', '%', 2),
  ('8853cdc2-188f-6a5a-f678-c292ec57af86'::uuid, '0 trimestres com fluxo descendente liquido', 'Garantir mais subidas que descidas (B->C).', 'count(trimestres com B->C > C->B)', 0, '0 trimestres regressivos', 'trimestres', 3),

  -- 23. Aumentar nº total de dizimistas e ofertantes
  ('599b3036-5ae0-a761-d6f1-831c0746592f'::uuid, 'Total de doadores unicos no ano cresce >=20% vs 2025', 'Volume anual. Auto via mem_contribuicoes.', 'count distinct doadores_2026 vs 2025', 20, '+20% vs 2025', '%', 1),
  ('599b3036-5ae0-a761-d6f1-831c0746592f'::uuid, '>=8 meses do ano com crescimento positivo vs mesmo mes 2025', 'Tendencia ascendente mensal.', 'count(meses com doadores_2026 > 2025)', 8, '>=8 meses', 'meses', 2),
  ('599b3036-5ae0-a761-d6f1-831c0746592f'::uuid, '0 trimestres com queda no absoluto vs trimestre anterior', 'Floor: nenhum trimestre regressivo.', 'count(trimestres com doadores_atual < anterior)', 0, '0 trimestres', 'trimestres', 3),

  -- 24. Aumentar valor total arrecadado no ano
  ('d1448365-a734-c620-edad-9100c4776560'::uuid, 'Valor total 2026 cresce >=15% vs 2025', 'Crescimento anual em R$. Auto via mem_contribuicoes.', 'sum(doacoes_2026) vs sum(doacoes_2025)', 15, '+15% vs 2025', '%', 1),
  ('d1448365-a734-c620-edad-9100c4776560'::uuid, '>=10 meses com arrecadacao maior que mesmo mes 2025', 'Tendencia ascendente mensal.', 'count(meses com valor_2026 > 2025)', 10, '>=10 meses', 'meses', 2),
  ('d1448365-a734-c620-edad-9100c4776560'::uuid, 'Make a Difference: definir base e crescer', 'Captacao do programa Make a Difference. Manual / financeiro.', 'sum(MAD_arrecadado_2026)', NULL, 'Definir baseline 2026', 'R$', 3)
  ) AS t(objetivo_geral_id, titulo, descricao, formula_calculo, meta_valor, meta_texto, unidade, ordem)
)
INSERT INTO public.kpi_krs (objetivo_geral_id, kpi_id, titulo, descricao, formula_calculo, meta_valor, meta_texto, unidade, ordem, ativo)
SELECT n.objetivo_geral_id, NULL, n.titulo, n.descricao, n.formula_calculo, n.meta_valor, n.meta_texto, n.unidade, n.ordem, true
  FROM novos_krs n
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kpi_krs k
    WHERE k.objetivo_geral_id = n.objetivo_geral_id
      AND k.ordem = n.ordem
      AND k.kpi_id IS NULL
 );

-- Conferencia (descomenta no Studio):
-- SELECT o.nome, count(k.id) AS qtde_krs
--   FROM kpi_objetivos_gerais o
--   LEFT JOIN kpi_krs k ON k.objetivo_geral_id = o.id AND k.ativo = true
--  WHERE o.ativo = true
--  GROUP BY o.id, o.nome, o.ordem
--  ORDER BY o.ordem;
-- Espera: 25 linhas, todas com qtde_krs = 3

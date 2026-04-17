-- Seed adicional: metas faltantes de todas as áreas do documento "Metas e Indicadores 2026"

INSERT INTO public.kpi_metas
  (area, indicador, descricao, valor_base, meta_6m, meta_12m, meta_24m, periodo_medicao, unidade, pilar)
VALUES
  -- AMI / Bridge — crescimento percentual
  ('ami_bridge', 'pct_aumento_frequencia', 'Aumento % frequência AMI + Bridge', null, 15, 30, null, 'semestral', 'percentual', 'seguir_jesus'),
  ('ami_bridge', 'pct_escola_discipulos',  'Aumento % participantes Escola de Discípulos', null, 50, null, null, 'semestral', 'percentual', 'investir_tempo'),
  ('ami_bridge', 'pct_next_inscritos',     'Aumento % inscritos no Next (dobrar)',         null, 100, null, null, 'semestral', 'percentual', 'investir_tempo'),

  -- Kids — metas de crescimento e retenção
  ('kids', 'pct_aceitacoes',       'Aumento % aceitações/mês (base: 8)',          8,    25,    null, null, 'mensal', 'percentual', 'seguir_jesus'),
  ('kids', 'pct_batismos',         'Aumento % batismos/mês (base: 3)',            3,    66.7,  null, null, 'mensal', 'percentual', 'seguir_jesus'),
  ('kids', 'saida_voluntariado',   'Saídas imotivadas voluntários Kids',         7,    4.9,   null, null, 'anual',  'pessoas',    'servir'),

  -- Grupos — % da Igreja
  ('grupos', 'pct_igreja_grupos',  '% da Igreja engajada em grupos',              null, null,  null, null, 'anual',  'percentual', 'conectar_pessoas'),
  ('grupos', 'lideres_treinamento','Líderes em treinamento',                      null, null,  null, null, 'mensal', 'pessoas',    'conectar_pessoas'),
  ('grupos', 'novos_lideres',      'Novos líderes formados',                      null, null,  null, null, 'mensal', 'pessoas',    'conectar_pessoas'),

  -- Voluntariado — metas adicionais
  ('voluntariado', 'pct_escalados_services',        '% voluntários escalados no Services',          null, 95,  null, null, 'mensal',     'percentual', 'servir'),
  ('voluntariado', 'pct_interessados_integrados',   '% interessados em servir integrados',          null, 90,  null, null, 'mensal',     'percentual', 'servir'),
  ('voluntariado', 'pct_desaparecidos_recuperados', '% voluntários desaparecidos recuperados',      null, 60,  null, null, 'trimestral', 'percentual', 'conectar_pessoas'),
  ('voluntariado', 'pct_satisfacao_feedback',       '% respostas positivas no feedback semestral',  null, 90,  null, null, 'semestral',  'percentual', 'servir'),
  ('voluntariado', 'novos_voluntarios',             'Novos voluntários (entrantes)',                null, null, null, null, 'mensal',    'pessoas',    'servir'),

  -- Integração — metas adicionais
  ('integracao', 'voluntarios_na_recepcao',      'Voluntários ativos na recepção',                 null, null, null, null, 'semanal', 'pessoas',    'servir'),
  ('integracao', 'pct_voluntarios_treinados',    '% voluntários da integração treinados mensalmente', null, 90, null, null, 'mensal', 'percentual', 'servir'),
  ('integracao', 'encontros_1x1',               'Encontros 1x1 coord/supervisores/voluntários',   null, null, null, null, 'mensal', 'encontros',  'conectar_pessoas'),
  ('integracao', 'abordagens_por_voluntario',   'Abordagens/culto por membro da recepção',        null, 5,    null, null, 'semanal','pessoas',    'seguir_jesus'),

  -- Cuidados — indicadores
  ('cuidados', 'pessoas_acompanhadas',      'Pessoas acompanhadas (jornada)',       null, null, null, null, 'mensal', 'pessoas',      'conectar_pessoas'),
  ('cuidados', 'pessoas_aconselhadas',      'Pessoas aconselhadas',                null, null, null, null, 'mensal', 'pessoas',      'conectar_pessoas'),
  ('cuidados', 'capelania_atendimentos',   'Atendimentos de capelania',            null, null, null, null, 'mensal', 'atendimentos', 'conectar_pessoas'),
  ('cuidados', 'jornada180_encontros',     'Encontros Jornada 180',               null, null, null, null, 'mensal', 'encontros',    'investir_tempo'),

  -- CBA — indicadores trimestrais
  ('cba', 'conversoes',   'Conversões CBA',                  null, null, null, null, 'trimestral', 'pessoas',   'seguir_jesus'),
  ('cba', 'reunioes',     'Reuniões realizadas CBA',         null, null, null, null, 'trimestral', 'reunioes',  'conectar_pessoas'),
  ('cba', 'participantes','Participantes nas reuniões CBA',  null, null, null, null, 'trimestral', 'pessoas',   'conectar_pessoas')

ON CONFLICT (area, indicador) DO NOTHING;

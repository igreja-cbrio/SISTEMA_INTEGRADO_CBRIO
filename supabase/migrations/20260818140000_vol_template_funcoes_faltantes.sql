-- ═══════════════════════════════════════════════════════════════════════════
-- Voluntariado · as funções que acontecem em todo culto e não estavam na
-- composição dos templates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Decisão do Matheus (18/08/2026): "pode incluir essas funções na composição".
--
-- Contexto: a migration 20260818120000 corrigiu a QUANTIDADE dos itens que já
-- existiam, e os alvos saíram de 28/28/27 pra 91/54/55 — contra 109/64/62
-- escalados de verdade por culto. A diferença é esta: funções que a igreja
-- escala toda semana e que nunca entraram no template.
--
-- ⚠️ CORTE EXPLÍCITO: só entra função presente em **6 dos 8 cultos** medidos
-- (últimas 8 semanas). Pôr uma função na composição é declarar que ela é
-- OBRIGATÓRIA naquele culto — a vaga vazia vira lacuna vermelha na tela e
-- entra na conta do auto-preencher. O que acontece de vez em quando viraria
-- uma falta permanente que ninguém consegue fechar, e a tela perderia o
-- sentido de "o que falta pra este domingo".
--
-- FICARAM DE FORA por serem eventuais (e não por esquecimento):
--   · Integração/Batismo    — 2 de 8 cultos (só quando há batismo)
--   · Integração/Ceia       — 2 de 8 cultos (só no culto de ceia)
--   · Produção/Diretor de Vídeo na Quarta — 1 de 8
--   · Cuidados/Bazar na Quarta            — 4 de 8
-- Quando o culto tiver batismo ou ceia, a área escala por fora da composição —
-- a tela mostra como "fora da composição", que é a leitura correta.
--
-- ⚠️ As linhas SEM FUNÇÃO ("equipe toda") não são resíduo: são exatamente 1 por
-- culto em 100% dos cultos, em Produção, Cuidados e Pastores — é o líder da
-- área, escalado no time genérico do Planning Center. O template da Quarta já
-- tinha esse item pra Pastores; os outros faltavam.
--
-- ⚠️ `fixo = false` em tudo: fixo é "essa vaga é sempre da mesma pessoa", e
-- nenhuma destas é. Marcar fixo faria o template prometer um nome que ele não
-- tem.

begin;

insert into vol_escala_template_itens (template_id, team_id, position_id, quantidade, fixo, sort_order)
select tp.id, t.id, p.id, v.qtd, false,
       coalesce((select max(i2.sort_order) from vol_escala_template_itens i2 where i2.template_id = tp.id), 0)
         + row_number() over (partition by tp.id order by v.equipe, v.funcao)
from (values
  -- template          equipe           função                          mediana  cultos_de_8
  ('Domingo manhã',    'Liderança',     'Supervisão',                      5),  -- 8
  ('Domingo manhã',    'Marketing',     'Cobertura de Culto',              3),  -- 8
  ('Domingo manhã',    'Online',        'Chat',                            3),  -- 8
  ('Domingo manhã',    'Produção',      'Mesa de Corte',                   1),  -- 8
  ('Domingo manhã',    'Produção',      'Supervisor de Câmeras',           1),  -- 8
  ('Domingo manhã',    'Produção',      'Transmissão e Infraestrutura',    1),  -- 8
  ('Domingo manhã',    'Voluntariado',  'Apoio',                           4),  -- 8

  ('Domingo noite',    'Liderança',     'Supervisão',                      6),  -- 8
  ('Domingo noite',    'Produção',      'Mesa de Corte',                   1),  -- 7
  ('Domingo noite',    'Produção',      'Supervisor de Câmeras',           1),  -- 8
  ('Domingo noite',    'Produção',      'Transmissão e Infraestrutura',    1),  -- 8
  ('Domingo noite',    'Voluntariado',  'Apoio',                           4),  -- 8

  ('Quarta',           'Liderança',     'Supervisão',                      5),  -- 8
  ('Quarta',           'Produção',      'Mesa de Corte',                   1),  -- 8
  ('Quarta',           'Produção',      'Supervisor de Câmeras',           1),  -- 8
  ('Quarta',           'Voluntariado',  'Apoio',                           5)   -- 8
) as v(template, equipe, funcao, qtd)
join vol_escala_templates tp on tp.nome = v.template and tp.deleted_at is null
join vol_teams t on t.name = v.equipe
join vol_positions p on p.team_id = t.id and p.name = v.funcao
where not exists (
  select 1 from vol_escala_template_itens i
  where i.template_id = tp.id and i.team_id = t.id and i.position_id = p.id
);

-- O líder da área: 1 por culto, em 100% dos cultos, sem função específica.
insert into vol_escala_template_itens (template_id, team_id, position_id, quantidade, fixo, sort_order)
-- ⚠️ `+ 100`: o `max(sort_order)` lê o estado ANTES do comando, então sem o
-- deslocamento este insert reusaria os mesmos sort_order do insert acima e a
-- ordem da tela ficaria decidida por desempate arbitrário.
select tp.id, t.id, null, 1, false,
       coalesce((select max(i2.sort_order) from vol_escala_template_itens i2 where i2.template_id = tp.id), 0)
         + 100 + row_number() over (partition by tp.id order by v.equipe)
from (values
  ('Domingo manhã',    'Produção'),
  ('Domingo noite',    'Produção'),
  ('Quarta',           'Produção'),
  ('Quarta',           'Cuidados')
) as v(template, equipe)
join vol_escala_templates tp on tp.nome = v.template and tp.deleted_at is null
join vol_teams t on t.name = v.equipe
where not exists (
  select 1 from vol_escala_template_itens i
  where i.template_id = tp.id and i.team_id = t.id and i.position_id is null
);

commit;

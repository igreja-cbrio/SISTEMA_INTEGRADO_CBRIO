-- ═══════════════════════════════════════════════════════════════════════════
-- Voluntariado · o "time" do Planning Center é a nossa FUNÇÃO, não a EQUIPE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DIAGNÓSTICO (16/08/2026, medido no banco vivo):
-- No Planning Center Services a granularidade de "team" é Vocal, Câmeras,
-- Recepção, Estacionamento, Bateria. O sync (`syncTeamMembersFromSchedules`)
-- criava um `vol_teams` por nome de time vindo em `vol_schedules.team_name` —
-- resultado: 129 equipes, das quais 113 são o espelho bruto do PCO, com
-- duplicatas de acento ("Cameras"/"Câmeras") e de horário ("Bazar 8:30",
-- "Bazar 10:00", "Bazar 10h", "Bazar 11:30").
--
-- Os 1.171 vínculos de `vol_team_members` foram todos parar nessas 113. As 9
-- equipes que a montagem de escala realmente usa (as referenciadas pelos
-- templates) ficaram com 0 a 7 membros:
--   Integração 0 · Online 0 · Voluntariado 0 · AMI 0 · Bridge 0
--   Banda 1 · Cuidados 1 · Kids 1 · Marketing 1 · Produção 7
--
-- Consequência na tela: a aba "Da área" do PainelEscalar filtra por
-- `team_members.team_id === vaga.team_id` (PainelEscalar.tsx:104) e vinha
-- vazia; o auto-preencher só considera quem tem vínculo com a equipe da vaga
-- (volRodizio.js:111) e respondia "sem candidato" em quase toda vaga. O
-- supervisor era empurrado pra aba "Qualquer voluntário" com a igreja inteira.
--
-- O encaixe é limpo: Vocal/Violão/Guitarra/Teclado/Bateria/Baixo são times no
-- PCO e são exatamente as 7 funções da equipe Banda aqui. Recepção,
-- Estacionamento, Batismo, Ceia, Ofertório são times no PCO e são exatamente as
-- funções da equipe Integração.
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Cria `vol_pco_mapa` — de-para nome-de-time-do-PCO → (equipe, função).
--   2. Cria as funções que faltavam nas equipes curadas.
--   3. Semeia o de-para dos 129 nomes.
--   4. Migra `vol_team_members` através do mapa (dedup por pessoa+equipe+função).
--   5. Faz backfill de `vol_schedules.team_id`/`position_id` (100% NULL hoje).
--   6. Desativa as equipes-espelho — `is_active=false`, NUNCA DELETE: o FK
--      `vol_positions.team_id ON DELETE CASCADE` derrubaria itens de template.
--   7. Preenche `vol_teams.area` (NULL em 129/129 — é o que faz o filtro
--      "minhas áreas" do builder nunca separar nada).
--
-- ⚠️ REVERSÍVEL: `vol_team_members.origem_pco_team` guarda de qual time do PCO
-- cada vínculo veio, e as equipes-espelho continuam na tabela (inativas).

begin;

-- ── 1. O de-para ────────────────────────────────────────────────────────────
-- É ele que impede a bagunça de voltar: o sync passa a consultar este mapa em
-- vez de criar uma equipe por nome novo. Nome do PCO que não estiver aqui vira
-- PENDÊNCIA visível, não equipe silenciosa.
create table if not exists vol_pco_mapa (
  id            uuid primary key default gen_random_uuid(),
  pco_nome      text not null,
  -- Chave de casamento: minúsculas, sem acento, sem espaço duplo. É o que
  -- colapsa "Cameras"/"Câmeras" e "Próximos passos"/"Próximos Passos".
  pco_chave     text not null unique,
  team_id       uuid references vol_teams(id) on delete cascade,
  position_id   uuid references vol_positions(id) on delete set null,
  -- true = nome do PCO que NÃO deve virar vínculo (time administrativo, teste).
  ignorar       boolean not null default false,
  observacao    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists vol_pco_mapa_team_idx on vol_pco_mapa(team_id);

comment on table vol_pco_mapa is
  'De-para: nome de "team" do Planning Center Services -> (equipe, funcao) do CBRio. '
  'O PCO usa "team" na granularidade que aqui e FUNCAO (Vocal, Cameras, Recepcao). '
  'Consultado por syncTeamMembersFromSchedules; nome ausente vira pendencia.';

-- Normalizador: mesma régua usada pelo backend pra casar nome do PCO.
-- ⚠️ GÊMEA EM JS: `backend/utils/pcoChave.js` (`chavePco`), testada em
-- `src/test/pcoChave.test.ts`. A migration semeia `pco_chave` com ESTA versão e
-- o sync consulta o mapa com AQUELA. Divergir não dá erro: o nome simplesmente
-- não é encontrado, vira "time desconhecido" e o voluntário fica sem equipe.
-- O `btrim` no fim não é enfeite — sem ele " Vocal" e "Vocal" seriam chaves
-- diferentes aqui e a MESMA chave lá.
create or replace function fn_vol_pco_chave(p_nome text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
           lower(translate(coalesce(p_nome,''),
             'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
           '\s+', ' ', 'g'))
$$;

comment on function fn_vol_pco_chave is
  'Chave de casamento de nome de time do PCO: minusculas, sem acento, espaco colapsado. '
  'E o que faz "Cameras" e "Cameras" caírem na mesma funcao.';

-- Coluna de rastro: de qual time do PCO veio o vínculo (permite desfazer).
alter table vol_team_members
  add column if not exists origem_pco_team text;

comment on column vol_team_members.origem_pco_team is
  'Nome do time do Planning Center que originou este vinculo, antes do remapeamento de 16/08/2026.';

-- ── 2. Funções que faltavam nas equipes curadas ─────────────────────────────
-- Sem elas, 87 nomes do PCO não teriam onde pousar.
insert into vol_positions (team_id, name)
select t.id, v.pos
from (values
  -- Banda
  ('Banda',        'Cajon'),
  ('Banda',        'Ministração'),
  -- Produção
  ('Produção',     'Mesa de Corte'),
  ('Produção',     'Coordenador Técnico'),
  -- Marketing
  ('Marketing',    'Escrita'),
  -- Kids
  ('Kids',         'Maternal 2-3 anos'),
  ('Kids',         'Apoio'),
  ('Kids',         'Vocal Kids'),
  -- Voluntariado
  ('Voluntariado', 'Apoio'),
  -- Liderança / Pastores (não tinham nenhuma função)
  ('Liderança',    'Supervisão'),
  ('Liderança',    'Líder'),
  ('Pastores',     'Preletor')
) as v(equipe, pos)
join vol_teams t on t.name = v.equipe
on conflict (team_id, name) do nothing;

-- ── 3. O de-para dos nomes do PCO ───────────────────────────────────────────
-- Cada linha: nome que chega do Planning Center -> equipe / função daqui.
-- Função NULL = entra na equipe sem função específica.
insert into vol_pco_mapa (pco_nome, pco_chave, team_id, position_id, observacao)
select v.pco, fn_vol_pco_chave(v.pco), t.id, p.id, v.obs
from (values
  -- ══ BANDA ══ (times do PCO que são instrumentos = funções da Banda)
  ('Vocal',                            'Banda', 'Vocal',            null),
  ('Vocais',                           'Banda', 'Vocal',            'duplicata de Vocal'),
  ('Violão',                           'Banda', 'Violão',           null),
  ('Guitarra',                         'Banda', 'Guitarra',         null),
  ('Guitarrista',                      'Banda', 'Guitarra',         'duplicata de Guitarra'),
  ('Teclado',                          'Banda', 'Teclado',          null),
  ('Tecladista',                       'Banda', 'Teclado',          'duplicata de Teclado'),
  ('Bateria',                          'Banda', 'Bateria',          null),
  ('Baterista',                        'Banda', 'Bateria',          'duplicata de Bateria'),
  ('Baixo',                            'Banda', 'Baixo',            null),
  ('Baixista',                         'Banda', 'Baixo',            'duplicata de Baixo'),
  ('Saxofone',                         'Banda', 'Saxofone',         null),
  ('Cajon',                            'Banda', 'Cajon',            null),
  ('Ministração',                      'Banda', 'Ministração',      null),

  -- ══ PRODUÇÃO ══
  ('Câmeras',                          'Produção', 'Câmeras',                   null),
  ('Cameras',                          'Produção', 'Câmeras',                   'duplicata sem acento'),
  ('Câmera',                           'Produção', 'Câmeras',                   'singular legado'),
  ('Camera 2',                         'Produção', 'Câmeras',                   'câmera específica -> Câmeras'),
  ('Câmera 3',                         'Produção', 'Câmeras',                   'câmera específica -> Câmeras'),
  ('Câmera 4',                         'Produção', 'Câmeras',                   'câmera específica -> Câmeras'),
  ('Câmera 6',                         'Produção', 'Câmeras',                   'câmera específica -> Câmeras'),
  ('Câmera 7',                         'Produção', 'Câmeras',                   'câmera específica -> Câmeras'),
  ('Supervisor de câmeras',            'Produção', 'Supervisor de Câmeras',     null),
  ('Supervisor de Câmera',             'Produção', 'Supervisor de Câmeras',     'duplicata no singular'),
  ('Projeção Led',                     'Produção', 'Projeção LED',              null),
  ('Projeção',                         'Produção', 'Projeção',                  null),
  ('Projeção (Telão)',                 'Produção', 'Projeção',                  null),
  ('Letras (Projeção)',                'Produção', 'Projeção',                  null),
  ('Letras (transmissão)',             'Produção', 'Transmissão',               null),
  ('Transmissão',                      'Produção', 'Transmissão',               null),
  ('Transmissão e Infraestrutura',     'Produção', 'Transmissão e Infraestrutura', null),
  ('Transmissão e infraestrutura',     'Produção', 'Transmissão e Infraestrutura', 'duplicata de caixa'),
  ('Broadcast',                        'Produção', 'Transmissão',               null),
  ('Broadcast ( Supervisão )',         'Produção', 'Transmissão',               null),
  ('Assistente de produção',           'Produção', 'Assistente de Produção',    null),
  ('Mesa de corte',                    'Produção', 'Mesa de Corte',             null),
  ('Diretor de Vídeo',                 'Produção', 'Diretor de Vídeo',          null),
  ('Coordenação de vídeo',             'Produção', 'Diretor de Vídeo',          null),
  ('Iluminação',                       'Produção', 'Iluminação',                null),
  ('Operador de Som',                  'Produção', 'Mesa de Som',               null),
  ('Mesa de Som',                      'Produção', 'Mesa de Som',               null),
  ('Coordenador Técnico',              'Produção', 'Coordenador Técnico',       null),
  ('Diretor de Culto',                 'Produção', 'Direção de Culto',          null),
  ('Produtor',                         'Produção', 'Direção de Culto',          null),

  -- ══ MARKETING ══
  ('Cobertura',                        'Marketing', 'Cobertura de Culto', null),
  ('Storymaker',                       'Marketing', 'Cobertura de Culto', null),
  ('Escrita',                          'Marketing', 'Escrita',            null),
  ('Marketing',                        'Marketing', null,                 'time genérico'),

  -- ══ INTEGRAÇÃO ══
  ('Recepção',                         'Integração', 'Recepção',       null),
  ('Recepção | Integração',            'Integração', 'Recepção',       null),
  ('Bem-Vindos',                       'Integração', 'Recepção',       null),
  ('Acolhimento',                      'Integração', 'Recepção',       null),
  ('Estacionamento',                   'Integração', 'Estacionamento', null),
  ('Batismo',                          'Integração', 'Batismo',        null),
  ('Ceia',                             'Integração', 'Ceia',           null),
  ('Ofertório',                        'Integração', 'Ofertório',      null),
  ('Oferta 8:30',                      'Integração', 'Ofertório',      'variação por horário'),
  ('Oferta 10:00',                     'Integração', 'Ofertório',      'variação por horário'),
  ('Oferta 11:30',                     'Integração', 'Ofertório',      'variação por horário'),
  ('Intercessão 11:30',                'Integração', 'Intercessão',    'variação por horário'),
  ('Intercessão | Ministração',        'Integração', 'Intercessão',    null),

  -- ══ ONLINE ══
  ('Interação com o Chat / Recepção',  'Online', 'Interação com Chat', null),
  ('Chat 8:30',                        'Online', 'Chat',               'variação por horário'),
  ('Chat 10:00',                       'Online', 'Chat',               'variação por horário'),
  ('Chat 11:30',                       'Online', 'Chat',               'variação por horário'),
  ('Pós Culto',                        'Online', 'Pós Culto/Host',     null),
  ('Pós Culto 8:30',                   'Online', 'Pós Culto/Host',     'variação por horário'),
  ('Pós Culto 10h',                    'Online', 'Pós Culto/Host',     'variação por horário'),
  ('Pós Culto 11:30',                  'Online', 'Pós Culto/Host',     'variação por horário'),
  ('Comunidade',                       'Online', 'Comunidade',         null),
  ('Host | Avisos',                    'Online', 'Host',               null),

  -- ══ CUIDADOS ══
  -- ⚠️ "Próximos Passos" existe como função em Online E em Cuidados. As
  -- variações com horário são presenciais (pós-culto no templo) -> Cuidados.
  ('Próximos Passos',                  'Cuidados', 'Próximos Passos', null),
  ('Próximos passos',                  'Cuidados', 'Próximos Passos', 'duplicata de caixa'),
  ('Próximos Passos 8:30h',            'Cuidados', 'Próximos Passos', 'variação por horário'),
  ('Próximos Passos 9:30h',            'Cuidados', 'Próximos Passos', 'variação por horário'),
  ('Próximos Passos 10:00h',           'Cuidados', 'Próximos Passos', 'variação por horário'),
  ('Próximos Passos 11:30h',           'Cuidados', 'Próximos Passos', 'variação por horário'),
  ('Bazar',                            'Cuidados', 'Bazar',           null),
  ('Bazar 8:30',                       'Cuidados', 'Bazar',           'variação por horário'),
  ('Bazar 10:00',                      'Cuidados', 'Bazar',           'variação por horário'),
  ('Bazar 10h',                        'Cuidados', 'Bazar',           'variação por horário'),
  ('Bazar 11:30',                      'Cuidados', 'Bazar',           'variação por horário'),

  -- ══ VOLUNTARIADO ══
  ('Check-in',                         'Voluntariado', 'Check-in', null),
  ('Check-In',                         'Voluntariado', 'Check-in', 'duplicata de caixa'),
  ('Cozinha',                          'Voluntariado', 'Cozinha',  null),
  ('Voluntários',                      'Voluntariado', null,       'time genérico'),
  ('Apoio',                            'Voluntariado', 'Apoio',    null),
  ('Apoio GC',                         'Voluntariado', 'Apoio',    null),
  ('Assistentes',                      'Voluntariado', 'Apoio',    null),
  ('Facilitador',                      'Voluntariado', 'Apoio',    null),
  ('Responsáveis',                     'Voluntariado', 'Apoio',    null),

  -- ══ KIDS ══
  ('6-23 meses',                       'Kids', 'Baby',              null),
  ('Berçário 6-23m',                   'Kids', 'Baby',              null),
  ('2 anos',                           'Kids', 'Maternal 2-3 anos', null),
  ('2-3 anos',                         'Kids', 'Maternal 2-3 anos', null),
  ('Maternal 2-3 anos',                'Kids', 'Maternal 2-3 anos', null),
  ('Sala 3 e 4 Anos',                  'Kids', 'Little 3-4 anos',   null),
  ('Sala 5 e 6 Anos',                  'Kids', 'Little 5-6 anos',   null),
  ('Sala 7 e 8 Anos',                  'Kids', 'Elevate 7-8 anos',  null),
  ('Apoio 9',                          'Kids', 'Elevate 9-12 anos', 'time "Apoio 9" com função "12 anos"'),
  ('Ministração Pré-Teens',            'Kids', 'Elevate 9-12 anos', null),
  ('- Apoio Pré-Teens',                'Kids', 'Elevate 9-12 anos', null),
  ('Apoio Pré-Teens',                  'Kids', 'Elevate 9-12 anos', null),
  ('- Apoio Kids',                     'Kids', 'Apoio',             null),
  ('Inclusão',                         'Kids', 'Inclusão',          null),
  ('História',                         'Kids', 'Devocional',        null),
  ('Coordenação',                      'Kids', 'Coordenação de Culto', null),
  ('Vocal Kids',                       'Kids', 'Vocal Kids',        null),
  ('Vocal Junior',                     'Kids', 'Vocal Kids',        null),
  ('Kids',                             'Kids', null,                'time genérico'),

  -- ══ LIDERANÇA / PASTORES / ASSISTENTE ══
  ('LIDERANÇA',                        'Liderança', 'Supervisão', null),
  ('SUPERVISOR',                       'Liderança', 'Supervisão', null),
  ('STAFF',                            'Liderança', null,          null),
  ('Adultos | Líderes',                'Liderança', 'Líder',      null),
  ('Jovens | Líderes',                 'Liderança', 'Líder',      null),
  ('Preletor',                         'Pastores',  'Preletor',   null),
  ('preletor',                         'Pastores',  'Preletor',   'duplicata de caixa'),
  ('Pregador | Preletor',              'Pastores',  'Preletor',   null),
  ('assistente ministerial',           'Assistente Ministerial', null, null),

  -- ══ AMI / BRIDGE ══
  ('Next AMI',                         'AMI',    null, null),
  ('AMI',                              'AMI',    null, 'time genérico'),
  ('Bridge',                           'Bridge', null, 'time genérico')
) as v(pco, equipe, funcao, obs)
join vol_teams t on t.name = v.equipe
left join vol_positions p on p.team_id = t.id and p.name = v.funcao
on conflict (pco_chave) do nothing;

-- As próprias equipes curadas também entram no mapa (identidade): quando o PCO
-- manda "Produção" ou "Banda" como time, ele já bate com a equipe daqui.
insert into vol_pco_mapa (pco_nome, pco_chave, team_id, position_id, observacao)
select t.name, fn_vol_pco_chave(t.name), t.id, null, 'identidade (equipe curada)'
from vol_teams t
where t.id in (
  select team_id from vol_escala_template_itens
  union select id from vol_teams where name in ('Kids','Marketing','AMI','Bridge')
)
on conflict (pco_chave) do nothing;

-- ── 3b. O vínculo passa a admitir MAIS DE UMA FUNÇÃO na mesma equipe ────────
-- ⚠️ Sem isto o remapeamento PERDE DADO. O único era `(team_id,
-- volunteer_profile_id)` — uma pessoa, uma equipe, uma função. Isso servia
-- enquanto cada função do PCO era uma "equipe" separada: quem fazia Câmeras e
-- Projeção tinha duas linhas, em duas equipes. Colapsando as duas em Produção,
-- as duas linhas viram a MESMA chave e uma delas seria descartada.
-- Medido em 16/08: **129 pessoas** têm mais de uma função na equipe de destino,
-- uma delas com 8. Guardar só a primeira apagaria isso em silêncio.
--
-- ⚠️ E o `volRodizio.js` JÁ ESPERA a lista: `_vinculoParaVaga` filtra os
-- vínculos da equipe e procura o que casa com a posição da vaga (utils/
-- volRodizio.js:110-119) — o índice é que estava mais estreito que o código.
--
-- ⚠️ Os dois índices são PARCIAIS de propósito, e por isso NENHUM dos dois
-- serve de alvo pra `ON CONFLICT` do PostgREST: um índice único cheio sobre
-- (team, profile, position) com NULLS NOT DISTINCT trataria todas as linhas
-- pc-only (profile NULL) da mesma equipe/função como a MESMA pessoa. Os
-- callers fazem dedup manual — é o que `syncTeamMembersFromSchedules` já fazia
-- no ramo pc-only.
alter table vol_team_members
  drop constraint if exists vol_team_members_team_id_volunteer_profile_id_key;

drop index if exists vol_team_members_team_profile_pos_key;
create unique index vol_team_members_team_profile_pos_key
  on vol_team_members (team_id, volunteer_profile_id, position_id)
  nulls not distinct
  where volunteer_profile_id is not null;

drop index if exists vol_team_members_team_pc_unique;
create unique index vol_team_members_team_pc_pos_unique
  on vol_team_members (team_id, planning_center_person_id, position_id)
  nulls not distinct
  where volunteer_profile_id is null and planning_center_person_id is not null;

-- ── 4. Migra os vínculos existentes através do mapa ─────────────────────────
-- Guarda de onde veio ANTES de mover (é o que permite auditar/desfazer).
update vol_team_members m
set origem_pco_team = t.name
from vol_teams t
where m.team_id = t.id and m.origem_pco_team is null;

-- Insere o vínculo no destino. Quem estava em "Cameras" E em "Câmeras" tem que
-- virar UMA linha em Produção/Câmeras.
-- ⚠️ `vol_team_members` não tem índice único em (team, position, pessoa), então
-- não há ON CONFLICT pra apoiar: a dedup contra o que JÁ existe é o `not exists`
-- e a dedup DENTRO do próprio comando é o `group by`.
-- ⚠️ O agrupamento é obrigatório, não estético: "Cameras" e "Câmeras" são duas
-- linhas de origem que viram A MESMA (Produção, Câmeras) pra mesma pessoa. Sem
-- colapsar aqui, o `not exists` (que enxerga só o estado ANTES do comando)
-- deixaria as duas entrarem e a pessoa apareceria em duplicidade no painel.
-- ⚠️⚠️ DOIS inserts, e a separação NÃO é estilo — é a forma das duas chaves
-- únicas. Elas são diferentes:
--   com perfil : (team_id, volunteer_profile_id, position_id)
--   pc-only    : (team_id, planning_center_person_id, position_id)
-- Um insert só, agrupado pelas QUATRO colunas, foi o que estourou 23505 na
-- primeira tentativa: a mesma pessoa (mesmo `volunteer_profile_id`) aparecia
-- com `planning_center_person_id` diferente em duas equipes-espelho, virava
-- DOIS grupos e portanto duas linhas — que a chave de 3 colunas recusa.
-- Agrupar por exatamente a chave que vai receber o INSERT é o que garante
-- uma linha por chave.

-- (a) Vínculos com perfil: uma linha por (equipe, função, pessoa).
insert into vol_team_members
  (team_id, position_id, volunteer_profile_id, planning_center_person_id,
   volunteer_name, is_active, origem_pco_team)
select d.team_id, d.position_id, d.volunteer_profile_id,
       min(d.planning_center_person_id), min(d.volunteer_name), true, min(d.origem_pco_team)
from (
  select mp.team_id, mp.position_id,
         m.volunteer_profile_id, m.planning_center_person_id,
         m.volunteer_name, m.origem_pco_team
  from vol_team_members m
  join vol_teams origem on origem.id = m.team_id
  join vol_pco_mapa mp on mp.pco_chave = fn_vol_pco_chave(origem.name)
  where mp.ignorar = false
    and mp.team_id <> m.team_id            -- só o que precisa mudar de equipe
    and m.volunteer_profile_id is not null
    and not exists (
      select 1 from vol_team_members x
      where x.team_id = mp.team_id
        and x.position_id is not distinct from mp.position_id
        and x.volunteer_profile_id = m.volunteer_profile_id
    )
) d
group by d.team_id, d.position_id, d.volunteer_profile_id;

-- (b) Vínculos pc-only (pessoa sem perfil no sistema): a chave é o id do PCO.
insert into vol_team_members
  (team_id, position_id, volunteer_profile_id, planning_center_person_id,
   volunteer_name, is_active, origem_pco_team)
select d.team_id, d.position_id, null,
       d.planning_center_person_id, min(d.volunteer_name), true, min(d.origem_pco_team)
from (
  select mp.team_id, mp.position_id,
         m.planning_center_person_id, m.volunteer_name, m.origem_pco_team
  from vol_team_members m
  join vol_teams origem on origem.id = m.team_id
  join vol_pco_mapa mp on mp.pco_chave = fn_vol_pco_chave(origem.name)
  where mp.ignorar = false
    and mp.team_id <> m.team_id
    and m.volunteer_profile_id is null
    and m.planning_center_person_id is not null
    and not exists (
      select 1 from vol_team_members x
      where x.team_id = mp.team_id
        and x.position_id is not distinct from mp.position_id
        and x.volunteer_profile_id is null
        and x.planning_center_person_id = m.planning_center_person_id
    )
) d
group by d.team_id, d.position_id, d.planning_center_person_id;

-- Remove os vínculos antigos que já foram reposicionados.
delete from vol_team_members m
using vol_teams origem, vol_pco_mapa mp
where origem.id = m.team_id
  and mp.pco_chave = fn_vol_pco_chave(origem.name)
  and mp.ignorar = false
  and mp.team_id <> m.team_id;

-- ── 5. Backfill de team_id / position_id nas escalas ────────────────────────
-- ⚠️ 100% das 5.587 linhas de vol_schedules têm team_id E position_id NULL —
-- só os textos team_name/position_name foram gravados pelo sync do PCO. Sem
-- este backfill, `montarCobertura` só casa pelo `escala_culto_item_id` (que
-- também é NULL em 100%) e o histórico inteiro fica invisível pra cobertura e
-- pro rodízio por área.
--
-- team_name pode vir com vários times separados por vírgula; usamos o PRIMEIRO
-- que casar no mapa — o mesmo critério do sync (`upsertScheduleResilient`
-- guarda a lista, mas a escala é de uma função só).
with resolvido as (
  select s.id as schedule_id, mp.team_id, mp.position_id,
         row_number() over (partition by s.id order by ord) as rn
  from vol_schedules s
  cross join lateral unnest(string_to_array(s.team_name, ',')) with ordinality as u(nome, ord)
  join vol_pco_mapa mp on mp.pco_chave = fn_vol_pco_chave(trim(u.nome))
  where s.team_name is not null
    and s.team_id is null
    and mp.ignorar = false
)
update vol_schedules s
set team_id = r.team_id,
    position_id = coalesce(s.position_id, r.position_id)
from resolvido r
where r.schedule_id = s.id and r.rn = 1;

-- ── 6. Desativa as equipes-espelho do PCO ───────────────────────────────────
-- ⚠️ is_active = false, NUNCA delete: `vol_positions.team_id ON DELETE CASCADE`
-- + `vol_escala_template_itens.position_id` fariam um DELETE derrubar itens de
-- template em silêncio (achado da auditoria de 16/08).
-- Equipe-espelho = está no mapa apontando pra OUTRA equipe (ou seja, o nome
-- dela é um nome do PCO que agora vira função em outro lugar).
update vol_teams t
set is_active = false
from vol_pco_mapa mp
where mp.pco_chave = fn_vol_pco_chave(t.name)
  and mp.team_id <> t.id;

-- Equipes que nunca entraram no mapa e ficaram sem nenhum membro: também saem
-- de circulação (são resíduo de sync antigo). Nada é apagado.
update vol_teams t
set is_active = false
where not exists (select 1 from vol_pco_mapa mp where mp.team_id = t.id)
  and not exists (select 1 from vol_team_members m where m.team_id = t.id)
  and not exists (select 1 from vol_escala_template_itens i where i.team_id = t.id);

-- ── 7. Área das equipes vivas ───────────────────────────────────────────────
-- ⚠️ `vol_teams.area` estava NULL em 129/129. É a chave do "minhas áreas" do
-- builder (VolScheduleBuilder.tsx:124) — sem ela, a separação nunca aparecia e
-- só a estrela do localStorage salvava. Os valores casam com `areas.nome`.
update vol_teams set area = v.area
from (values
  ('Banda',                  'Louvor'),
  ('Produção',               'Produção'),
  ('Marketing',              'Marketing'),
  ('Integração',             'Integração'),
  ('Online',                 'Online'),
  ('Cuidados',               'Cuidados'),
  ('Voluntariado',           'Voluntariado'),
  ('Kids',                   'KIDS'),
  ('AMI',                    'AMI'),
  ('Bridge',                 'Bridge'),
  ('Liderança',              'Voluntariado'),
  ('Pastores',               'Voluntariado'),
  ('Assistente Ministerial', 'Voluntariado')
) as v(nome, area)
where vol_teams.name = v.nome;

-- ── RLS · molde vol_ (leitura >= 1, escrita >= 3) ───────────────────────────
alter table public.vol_pco_mapa enable row level security;

drop policy if exists vol_pco_mapa_select on public.vol_pco_mapa;
create policy vol_pco_mapa_select on public.vol_pco_mapa for select to authenticated
  using (public.current_user_module_level('voluntariado') >= 1 or public.is_super_admin());

drop policy if exists vol_pco_mapa_write on public.vol_pco_mapa;
create policy vol_pco_mapa_write on public.vol_pco_mapa for all to authenticated
  using (public.current_user_module_level('voluntariado') >= 3 or public.is_super_admin())
  with check (public.current_user_module_level('voluntariado') >= 3 or public.is_super_admin());

drop policy if exists vol_pco_mapa_service on public.vol_pco_mapa;
create policy vol_pco_mapa_service on public.vol_pco_mapa for all to service_role
  using (true) with check (true);

drop trigger if exists trg_vol_pco_mapa_touch on public.vol_pco_mapa;
create trigger trg_vol_pco_mapa_touch before update on public.vol_pco_mapa
  for each row execute function public.vol_escala_touch_updated_at();

commit;

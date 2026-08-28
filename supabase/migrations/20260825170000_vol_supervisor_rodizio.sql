-- ══════════════════════════════════════════════════════════════════════════
-- Supervisão ganha o RODÍZIO da casa: semana × dia × período (2026-08-25)
--
-- A Ariel mandou a lista real: "1 Dom manhã / 1 Dom Noite / 2 Dom Manhã / … /
-- 1ª 4ª feira / 2ª 4ª feira / …". É a ENÉSIMA semana do mês, não o horário do
-- culto ("1 Dom manhã" = primeiro domingo, não o culto das 08:30).
--
-- ⚠️⚠️ POR QUE NÃO É POR HORÁRIO — medido no Planning Center em 25/08. Dos 110
-- escalados do domingo 23/08: 102 têm SÓ horário de ensaio, e os 8 com horário
-- de culto têm AS QUATRO horas (08:30+09:30+10:00+11:30). Trazer os `times` do
-- PCO daria uma dimensão que NÃO separa ninguém. Este eixo separa.
--
-- ⚠️ E não depende do PCO: dia, período e semana saem do `vol_services
-- .scheduled_at`, que já está no banco. Régua pura em `utils/rodizioCulto.js`,
-- no gate (`npm run test:rodizio-culto`).
--
-- ⚠️ NULL = curinga em cada eixo. É o que preserva TODA concessão anterior
-- (inclusive as de subárea criadas hoje) — sem isso a migration seria remoção
-- silenciosa de acesso.
-- ⚠️ 5ª semana REPETE A 1ª (decisão do Matheus): a lista da Ariel só vai até 4,
-- e culto órfão de supervisão é pior que supervisor repetido. Isso é resolvido
-- na RÉGUA, não com uma opção 5 aqui.
-- ⚠️ Quarta é culto ÚNICO (decisão dele): concessão de quarta fica com
-- `culto_periodo` NULL.
-- ══════════════════════════════════════════════════════════════════════════

alter table vol_area_supervisores
  add column if not exists culto_dia text
    check (culto_dia is null or culto_dia in ('domingo','quarta')),
  add column if not exists culto_periodo text
    check (culto_periodo is null or culto_periodo in ('manha','noite')),
  add column if not exists culto_semana smallint
    check (culto_semana is null or culto_semana between 1 and 4);

comment on column vol_area_supervisores.culto_dia is
  'Dia do rodízio: domingo | quarta. NULL = qualquer culto.';
comment on column vol_area_supervisores.culto_periodo is
  'manha | noite. NULL = os dois. Quarta usa NULL (culto único).';
comment on column vol_area_supervisores.culto_semana is
  'Enésima semana do mês (1..4). NULL = todas. A 5ª ocorrência é normalizada pra 1 na régua.';

-- A unicidade passa a incluir o rodízio: a MESMA pessoa pode supervisionar a
-- mesma subárea em turnos diferentes (é justamente a lista da Ariel — a Simone
-- Oliveira aparece na 2ª, 3ª e 4ª quarta).
drop index if exists vol_area_supervisores_membro_area_pos_uidx;

-- ⚠️ Índice sobre expressão com coalesce, não UNIQUE simples: em UNIQUE o
-- Postgres trata NULL como distinto de NULL, então a mesma concessão entraria
-- várias vezes e a tela mostraria linha duplicada.
create unique index if not exists vol_area_supervisores_escopo_uidx
  on vol_area_supervisores (
    membro_id,
    area,
    coalesce(position_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(culto_dia, ''),
    coalesce(culto_periodo, ''),
    coalesce(culto_semana, 0)
  );

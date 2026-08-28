-- ══════════════════════════════════════════════════════════════════════════
-- Supervisão de voluntariado ganha a dimensão SUBÁREA (2026-08-25)
--
-- Pedido do Matheus: "preciso das subáreas também — se eu escolher Integração,
-- deve aparecer as subáreas da Integração: ofertório, estacionamento etc".
--
-- Subárea = `vol_positions` (a posição/função dentro da equipe da área).
-- Medido: Integração → Assistência Médica, Batismo, Ceia, Estacionamento,
-- Intercessão, Ofertório, Recepção. É exatamente o que ele descreveu.
--
-- ⚠️⚠️ GUARDA O ID, NUNCA O NOME. Nome de posição REPETE entre áreas:
-- "Recepção" existe em Integração E em KIDS; "Cuidados" em AMI, Bridge e
-- Voluntariado; "Produção" em AMI, Bridge e Produção; "Intercessão" em AMI e
-- Integração; "Staff" em AMI e Bridge. Guardar texto faria a concessão de
-- "Recepção da Integração" vazar pro Kids — que é o oposto de restringir.
--
-- ⚠️ NULL = CURINGA ("todas as subáreas da área"). É o que preserva TODA
-- concessão existente: quem supervisiona a área inteira continua igual, e a
-- única linha viva hoje (geral) segue valendo. Sem isso a migration viraria
-- uma remoção de acesso silenciosa.
--
-- ⚠️ O culto/horário NÃO entra aqui, de propósito. A escala de hoje não
-- distingue 08:30 × 10:00 × 11:30: o Planning Center consolida a manhã inteira
-- num serviço só ("Domingo - Manhã", 1.304 escalas em 90 dias), e 63% das
-- escalas estão em serviço sem `service_type_id`. Uma coluna de culto aqui
-- seria um seletor que não filtra nada — o erro do `wa_templates.ativo`.
-- Pré-requisito registrado no CLAUDE.md: `include=times` no
-- `fetchAllTeamMembers` + mapa PlanTime→culto.
-- ══════════════════════════════════════════════════════════════════════════

alter table vol_area_supervisores
  add column if not exists position_id uuid references vol_positions(id) on delete cascade;

comment on column vol_area_supervisores.position_id is
  'Subárea (vol_positions) que a pessoa supervisiona. NULL = todas as subáreas da área.';

-- A unicidade antiga (membro_id, area) impediria a MESMA pessoa de supervisionar
-- duas subáreas da mesma área — que é justamente o caso de uso novo.
alter table vol_area_supervisores
  drop constraint if exists vol_area_supervisores_membro_id_area_key;

-- ⚠️ Índice sobre expressão, não UNIQUE simples: em UNIQUE o Postgres trata
-- NULL como distinto de NULL, então (membro, area, NULL) entraria DUAS vezes e
-- a tela mostraria a mesma concessão duplicada. O coalesce força a colisão.
create unique index if not exists vol_area_supervisores_membro_area_pos_uidx
  on vol_area_supervisores (
    membro_id,
    area,
    coalesce(position_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists vol_area_supervisores_position_idx
  on vol_area_supervisores (position_id) where position_id is not null;

-- SERVIR · a semana do mês que a PESSOA prefere servir (2026-09-24)
--
-- Pedido do Marcos (23/09): "cada um tem um domingo de preferência e ao clicar
-- para escalar naquela posição, ele filtra as pessoas que estão naquele time
-- priorizando quem colocou aquele domingo como rodízio".
--
-- ⚠️ É PREFERÊNCIA, não restrição: quem prefere o 1º domingo continua
-- escalável no 3º — só aparece depois na lista. Por PESSOA (vol_profiles), não
-- por vínculo de time: a pessoa tem um domingo, não um por time.
-- NULL = sem preferência declarada.
alter table vol_profiles
  add column if not exists rodizio_semana smallint
    check (rodizio_semana is null or rodizio_semana between 1 and 4);
comment on column vol_profiles.rodizio_semana is
  'Semana do mês (1..4) em que a pessoa prefere servir. Ordena o seletor da Montar escala; nunca filtra.';

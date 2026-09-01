-- ============================================================================
-- VOLUNTARIADO · marca de "arquivado por DECISÃO HUMANA" (2026-08-25)
--
-- Pedido do Matheus: desativar os voluntários sem escala nem check-in desde
-- dez/2025. ⚠️⚠️ SEM ESTA COLUNA A LIMPEZA SE DESFAZ SOZINHA EM UMA HORA:
-- `reconcilePlanningCenterProfiles` DESARQUIVA todo perfil cujo
-- `planning_center_id` esteja no roster do PCO — e essas pessoas ESTÃO lá
-- (o PCO Services lista 768 `active`, medido em 25/08). O cron roda de hora
-- em hora, então o arquivamento manual seria revertido no próximo ciclo, em
-- silêncio, e ninguém ligaria uma coisa à outra.
--
-- ⚠️ NÃO reusa `protegido_sync`: aquele campo significa "não sobrescreva os
-- DADOS deste perfil no upsert" (equipe editou à mão), não "um humano decidiu
-- desativar esta pessoa". Gravar um dizendo o outro é a lição do
-- `financeiro_dispensado_em` — carimbo próprio, nunca emprestado. Hoje
-- `protegido_sync` está em 0 perfis, então não é conflito: é semântica.
--
-- ⚠️ A coluna NÃO arquiva ninguém sozinha. Ela só diz "a baixa aqui foi
-- decisão nossa, o sync não desfaz". Reativar continua sendo 1 UPDATE.
--
-- Aditiva e idempotente. Nada existente é removido.
-- ============================================================================

alter table public.vol_profiles
  add column if not exists arquivado_manual boolean not null default false;

comment on column public.vol_profiles.arquivado_manual is
  'TRUE = a baixa foi decisão humana (limpeza de base), NÃO do Planning Center. '
  'reconcilePlanningCenterProfiles NÃO desarquiva quem tem esta marca, mesmo que '
  'a pessoa siga no roster ativo do PCO. Sem isso o arquivamento manual é '
  'revertido no próximo cron (de hora em hora). Reativar = arquivado=false E '
  'arquivado_manual=false.';

-- índice parcial: a leitura que importa é "quem foi baixado à mão"
create index if not exists idx_vol_profiles_arquivado_manual
  on public.vol_profiles (id) where arquivado_manual;

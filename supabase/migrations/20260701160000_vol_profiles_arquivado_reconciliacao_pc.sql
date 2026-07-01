-- Reconciliacao com o Planning Center: marca perfis que sairam do PCO.
-- O sync so fazia UPSERT (nunca removia) -> vol_profiles so crescia (o "sistema"
-- mostrava 897 enquanto o PCO tinha ~746). Esta coluna deixa o sync COMPLETO
-- (executarSyncCompleto · botao Sincronizar + cron horario) arquivar quem nao
-- veio mais no roster do PCO. Reversivel: reaparece no PCO -> arquivado=false.
-- Internos (origem<>planning_center) nunca sao tocados pela reconciliacao.
ALTER TABLE public.vol_profiles ADD COLUMN IF NOT EXISTS arquivado boolean NOT NULL DEFAULT false;
ALTER TABLE public.vol_profiles ADD COLUMN IF NOT EXISTS arquivado_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_vol_profiles_ativos ON public.vol_profiles (arquivado) WHERE arquivado = false;
COMMENT ON COLUMN public.vol_profiles.arquivado IS 'Reconciliacao PC: perfil origem=planning_center que nao veio no ultimo sync COMPLETO do Planning Center (saiu/arquivado no PCO). Internos (origem<>planning_center) nunca sao arquivados por aqui. Reversivel: reaparece no PCO -> arquivado=false.';

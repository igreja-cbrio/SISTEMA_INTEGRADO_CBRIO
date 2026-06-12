-- RH · coluna de motivo do desligamento (opcional)
-- Aditiva e idempotente. O desligamento já era lógico (status='inativo' +
-- data_demissao); esta coluna guarda o motivo informado no desligamento.

ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS motivo_desligamento text;

COMMENT ON COLUMN public.rh_funcionarios.motivo_desligamento
  IS 'Motivo informado ao desligar o colaborador (status=inativo). Preenchido por POST /api/rh/funcionarios/:id/desligar.';

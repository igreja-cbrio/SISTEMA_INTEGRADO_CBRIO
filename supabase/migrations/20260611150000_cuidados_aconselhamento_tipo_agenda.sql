-- Fase 2 da reformulação de Cuidados · aconselhamento como módulo do pastor.
-- cui_acompanhamentos ganha:
--   · tipo (aconselhamento | capelania) — o split que o dashboard (Gráfico 2) e o
--     KPI cuidados.atendimentos_pastorais passam a ler de REGISTRO REAL, no lugar
--     da entrada manual mensal (cui_atendimentos_agregado, aposentada na Fase 2).
--   · agenda da sessão (data + hora + quem atende) — aparece no calendário de
--     "Visitas agendadas" junto com os encontros de convertido.
-- Aditiva e idempotente · não toca RLS (a tabela já tem policies contextuais).

ALTER TABLE public.cui_acompanhamentos
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'aconselhamento',
  ADD COLUMN IF NOT EXISTS agendamento_data date,
  ADD COLUMN IF NOT EXISTS agendamento_hora time,
  ADD COLUMN IF NOT EXISTS agendamento_responsavel_id uuid,
  ADD COLUMN IF NOT EXISTS agendamento_responsavel_nome text;

-- CHECK do tipo (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cui_acompanhamentos_tipo_check'
  ) THEN
    ALTER TABLE public.cui_acompanhamentos
      ADD CONSTRAINT cui_acompanhamentos_tipo_check
      CHECK (tipo IN ('aconselhamento', 'capelania'));
  END IF;
END $$;

-- Linhas antigas viram 'aconselhamento' (o default já cobre as novas)
UPDATE public.cui_acompanhamentos SET tipo = 'aconselhamento' WHERE tipo IS NULL;

-- Índice pro filtro do calendário de visitas (sessões agendadas)
CREATE INDEX IF NOT EXISTS idx_cui_acomp_agenda
  ON public.cui_acompanhamentos (agendamento_data)
  WHERE agendamento_data IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.cui_acompanhamentos.tipo IS 'aconselhamento | capelania · split lido pelo dashboard e pelo KPI (substitui o agregado manual)';
COMMENT ON COLUMN public.cui_acompanhamentos.agendamento_data IS 'Data da sessão agendada · aparece no calendário de Visitas agendadas';

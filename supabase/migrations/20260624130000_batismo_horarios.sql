-- Horários de batismo · abrir/fechar + limite por horário (2026-06-24)
-- A pessoa escolhe o horário no formulário público; a Integração controla
-- QUAIS horários aparecem (aberto/fechado) e o LIMITE de vagas de cada um.
-- A data do batismo continua sendo o próximo 4º domingo (lógica existente);
-- os horários são os cultos de domingo, recorrentes. Sem PII.

CREATE TABLE IF NOT EXISTS public.batismo_horarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horario     text NOT NULL,                 -- valor enviado pelo form · ex: '10:00'
  label       text NOT NULL,                 -- exibição · ex: 'Domingo · 10:00 (2º culto)'
  aberto      boolean NOT NULL DEFAULT true,  -- aparece no formulário?
  limite      integer,                        -- nulo = sem limite
  ordem       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_batismo_horarios_horario
  ON public.batismo_horarios (horario) WHERE deleted_at IS NULL;

-- Horário escolhido, estruturado (antes só ia como texto em observacoes).
ALTER TABLE public.batismo_inscricoes ADD COLUMN IF NOT EXISTS horario_culto text;

ALTER TABLE public.batismo_horarios ENABLE ROW LEVEL SECURITY;

-- Catálogo de configuração, sem PII · leitura liberada; escrita pelo backend.
DROP POLICY IF EXISTS batismo_horarios_select ON public.batismo_horarios;
CREATE POLICY batismo_horarios_select ON public.batismo_horarios
  FOR SELECT USING (true);
DROP POLICY IF EXISTS batismo_horarios_service ON public.batismo_horarios;
CREATE POLICY batismo_horarios_service ON public.batismo_horarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed dos 4 cultos de domingo. 10:00 nasce ABERTO (é o único oferecido hoje);
-- os outros nascem FECHADOS — a Integração abre os que quiser na nova aba.
INSERT INTO public.batismo_horarios (horario, label, aberto, ordem) VALUES
  ('08:30', 'Domingo · 08:30 (1º culto da manhã)', false, 1),
  ('10:00', 'Domingo · 10:00 (2º culto da manhã)', true,  2),
  ('11:30', 'Domingo · 11:30 (3º culto da manhã)', false, 3),
  ('19:00', 'Domingo · 19:00 (culto da noite)',    false, 4)
ON CONFLICT DO NOTHING;

-- Backfill: inscrições futuras que já escolheram 10h (texto em observacoes)
-- passam a ter o horário estruturado, pra a contagem de vagas bater.
UPDATE public.batismo_inscricoes
SET horario_culto = '10:00'
WHERE deleted_at IS NULL AND horario_culto IS NULL
  AND observacoes ILIKE '%Culto: 10h%';

COMMENT ON TABLE public.batismo_horarios IS
  'Horários de batismo (cultos) · aberto/fechado + limite de vagas. Controla o seletor do formulário público.';

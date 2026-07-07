-- ============================================================================
-- NEXT · check-in "na hora do NEXT" + tag de origem NEXT no funil (2026-07-07)
--
-- Pedido do Matheus: (1) lista de presença/check-in no NEXT; (2) tablet/totem
-- onde a pessoa acha o nome dela e escolhe servir / batizar / grupo — o interesse
-- cai no módulo certo com tag "veio do NEXT", cruzando os dados (dedup) pra não
-- duplicar cadastro.
--
-- Tudo ADITIVO:
--   · check_in_at/check_in_by em next_matriculas (present today) → o totem
--     self-service mostra SÓ quem fez check-in hoje; a lista de presença marca
--     quem veio; walk-in (quem chegou sem inscrição) cria matrícula na turma
--     aberta com origem='totem'.
--   · vol_inscricoes.next_matricula_id → rastreio/dedup do "quero servir" do NEXT
--     (a tag de origem é origem='next'; a coluna liga à matrícula).
--   · batismo_inscricoes.origem aceita 'next' (a tag).
--   · grupos usa jornada_encaminhamentos (origem='next', já sem CHECK) — sem
--     mudança de schema (a pessoa não escolhe um grupo específico no totem).
-- ============================================================================

-- 1) Check-in na matrícula --------------------------------------------------
ALTER TABLE public.next_matriculas ADD COLUMN IF NOT EXISTS check_in_at timestamptz;
ALTER TABLE public.next_matriculas ADD COLUMN IF NOT EXISTS check_in_by uuid;
CREATE INDEX IF NOT EXISTS idx_next_matriculas_checkin
  ON public.next_matriculas(check_in_at)
  WHERE check_in_at IS NOT NULL AND deleted_at IS NULL;

-- 2) origem 'totem' pro walk-in criado no check-in do totem ------------------
ALTER TABLE public.next_matriculas DROP CONSTRAINT IF EXISTS next_matriculas_origem_check;
ALTER TABLE public.next_matriculas ADD CONSTRAINT next_matriculas_origem_check
  CHECK (origem IN ('formulario','manual','totem'));

-- 3) vol_inscricoes: rastreio da origem NEXT --------------------------------
ALTER TABLE public.vol_inscricoes ADD COLUMN IF NOT EXISTS next_matricula_id uuid;
CREATE INDEX IF NOT EXISTS idx_vol_inscricoes_next_matricula
  ON public.vol_inscricoes(next_matricula_id)
  WHERE next_matricula_id IS NOT NULL;

-- 4) batismo_inscricoes: aceitar a tag origem='next' ------------------------
ALTER TABLE public.batismo_inscricoes DROP CONSTRAINT IF EXISTS batismo_inscricoes_origem_check;
ALTER TABLE public.batismo_inscricoes ADD CONSTRAINT batismo_inscricoes_origem_check
  CHECK (origem IN ('totem','manual','publico','app','next'));

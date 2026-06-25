-- Next · direcionar pros valores na matrícula (Fase 1B · Marcos · 2026-06-25)
-- ============================================================================
-- A inversão: o direcionamento do convertido pros valores migrou do Cuidados pro NEXT.
-- Na matrícula (next_matriculas), o líder marca pra onde a pessoa segue ao fim do Next:
-- Grupos · Voluntários · Batismo · Devocional (sem Dízimo · decisão do Marcos).
--   Grupos/Voluntários → encaminhamento (origem='next') na caixa da área (já funciona ·
--     a máquina existe no fluxo legado de inscrições · aqui ligada à MATRÍCULA).
--   Batismo            → inscrição pendente em batismo_inscricoes reusando membro_id.
--   Devocional         → registra a escolha (flag · estatística "pra onde cada um foi").
--     O 1º acesso/leitura no app é Fase 2.
-- NÃO marca engajamento (NSM conta sinal real: grupo ativo, voluntário, batismo realizado,
-- 1ª devocional). Aditiva, idempotente. NÃO mexe em NSM.
-- ============================================================================

-- 1) Flag de devocional na matrícula (batismo/servir/grupo/dizimo já existem)
ALTER TABLE public.next_matriculas
  ADD COLUMN IF NOT EXISTS indicou_devocional boolean NOT NULL DEFAULT false;

-- 2) Liga o encaminhamento à MATRÍCULA que o originou (dedup + retract · espelha o
--    next_inscricao_id do fluxo legado). Sem CHECK por origem · 'next' já é aceito.
ALTER TABLE public.jornada_encaminhamentos
  ADD COLUMN IF NOT EXISTS next_matricula_id uuid REFERENCES public.next_matriculas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jornada_enc_next_matricula_idx
  ON public.jornada_encaminhamentos (next_matricula_id) WHERE deleted_at IS NULL;

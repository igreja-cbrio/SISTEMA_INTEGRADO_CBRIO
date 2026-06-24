-- Cuidados · direcionamento ganha "Next" e "Batismo" + tracking pro retract (Marcos · 2026-06-24)
-- ============================================================================
-- O seletor de "Direcionamento" no Próximos passos passa a ter 5 opções:
-- Grupos · Devocionais · Voluntários · Next · Batismo.
--   - Grupos/Voluntários = handoff (encaminhamento) na caixa da área.
--   - Devocionais = só registro.
--   - Next/Batismo = INSCREVE a pessoa (matrícula Next em fila · inscrição de batismo
--     pendente) REUSANDO o membro_id → sem duplicar cadastro. Aparece como pendente
--     "vindo de Cuidados" pra Integração confirmar (ou linkar via QR).
--
-- TRACKING (`direcionamento_ref_*`): guarda QUAL registro o direcionamento criou, pra
-- o retract (misclick · voltar pra "—" ou trocar) desfazer SÓ o que o Cuidados criou
-- e SÓ se ainda estiver intocado (a área/Integração não mexeu).
--
-- ENGAJAMENTO: criar a inscrição NÃO conta no NSM — ele conta batismo só quando
-- 'realizado' e Next só quando 'formado'. Esta migration NÃO toca NSM nem o schema
-- de batismo_inscricoes/next_matriculas (o backend só INSERE linhas neles, normal).
-- Aditiva e idempotente.
-- ============================================================================

-- 1) direcionamento aceita 'next' e 'batismo'
ALTER TABLE public.cui_convertidos
  DROP CONSTRAINT IF EXISTS cui_convertidos_direcionamento_check;
ALTER TABLE public.cui_convertidos
  ADD CONSTRAINT cui_convertidos_direcionamento_check
  CHECK (direcionamento IS NULL OR direcionamento IN ('grupos', 'devocionais', 'voluntarios', 'next', 'batismo'));

-- 2) Referência do registro criado pelo direcionamento (pro retract preciso)
ALTER TABLE public.cui_convertidos
  ADD COLUMN IF NOT EXISTS direcionamento_ref_tipo text,
  ADD COLUMN IF NOT EXISTS direcionamento_ref_id   uuid;

COMMENT ON COLUMN public.cui_convertidos.direcionamento_ref_id IS
  'ID do registro criado pelo direcionamento (encaminhamento / matrícula Next / inscrição Batismo). Usado pra retrair só o que o Cuidados criou e só se intocado (misclick).';

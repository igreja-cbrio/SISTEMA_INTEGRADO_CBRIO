-- ============================================================================
-- Totem · Fase 2B-2 — horário das turmas do Next + autodeclaração de conversão
--
-- Aditiva, idempotente, backwards-compatible (o backend tolera as colunas
-- ausentes — o recurso só liga depois de aplicada).
--
--  1. next_turmas.horario — horário do encontro (texto livre "HH:MM" ou rótulo),
--     pra o totem mostrar "quando chegar". Por turma (o Next roda no mesmo
--     horário nos 2 encontros); vazio = "a confirmar".
--
--  2. mem_cadastros_pendentes.converteu_na_cbrio — checkbox autodeclarado no
--     cadastro ("Você se converteu na CBRio?"). ⚠️ É AUTODECLARADO e NUNCA
--     alimenta cui_convertidos / mem_trilha_valores / nsm_eventos — a fonte
--     canônica de conversão é a DECISÃO EM CULTO (regra do projeto:
--     "Convertido vem SEMPRE de culto"). Serve só pra triagem humana da
--     Integração e reconciliação de decisões órfãs (78% sem CPF).
-- ============================================================================

ALTER TABLE public.next_turmas
  ADD COLUMN IF NOT EXISTS horario text;

ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS converteu_na_cbrio boolean;

COMMENT ON COLUMN public.mem_cadastros_pendentes.converteu_na_cbrio IS
  'Autodeclarado no cadastro (totem/app). NUNCA alimenta cui_convertidos/NSM/trilha — fonte canônica de conversão é decisão em culto. Uso: triagem da Integração + reconciliação de decisões órfãs.';

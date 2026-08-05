-- ============================================================================
-- A trilha do "Ligar ao cadastro" nunca foi gravada · CHECK engolido (2026-08-05)
-- ============================================================================
-- Achado ao construir a ligação em LOTE. `entradas_resolucoes_acao_check`
-- aceita:
--
--   fundido · pessoas_distintas · vinculado · cadastro_criado · cpf_confirmado
--   resolvido · descartado · adiado · reativado
--
-- e a rota `POST /identidade-pendencias/:id/ligar-inscricao` grava
-- `acao: 'inscricao_vinculada'` — que **não está na lista**. Todo INSERT dela
-- violava o CHECK (23514) e o erro era engolido pelo `console.warn` de
-- `registrarResolucaoEntrada` (que só propaga se a mensagem casar
-- /entradas_resolucoes|schema cache|does not exist/).
--
-- Medido em produção antes de corrigir:
--   · mem_identidade_observacoes com origem 'fila_identidade%': 134 linhas
--     (última em 05/08 13:36) — ou seja, as ligações ACONTECERAM de verdade;
--   · entradas_resolucoes com acao='inscricao_vinculada': ZERO, desde sempre.
--
-- Ou seja: 134 vínculos de pessoa criados por decisão humana, e a trilha que
-- responde "QUEM ligou esta inscrição a este cadastro, e quando?" está vazia.
-- O dado do vínculo sobreviveu (observação de identidade); a autoria não.
--
-- ⚠️ Isto NÃO reescreve o passado — as 134 ligações seguem sem trilha, porque
-- não há de onde tirar autor/momento (a pendência guarda `resolvida_por` e
-- `resolvida_em`, e é o mais perto de auditoria que existe pra elas).
--
-- `inscricao_vinculada_lote` entra junto: o lote registra com ação PRÓPRIA de
-- propósito — "ligou 20 de uma vez confiando na régua de evidência forte" é uma
-- decisão diferente de "abriu o card, olhou os dois lados e ligou", e seis meses
-- depois ninguém consegue distinguir as duas se compartilharem o rótulo.
--
-- Aditiva e idempotente: só amplia o conjunto aceito. Nenhuma linha existente
-- fica inválida.
-- ============================================================================

ALTER TABLE public.entradas_resolucoes
  DROP CONSTRAINT IF EXISTS entradas_resolucoes_acao_check;

ALTER TABLE public.entradas_resolucoes
  ADD CONSTRAINT entradas_resolucoes_acao_check
  CHECK (acao = ANY (ARRAY[
    'fundido',
    'pessoas_distintas',
    'vinculado',
    'cadastro_criado',
    'cpf_confirmado',
    'resolvido',
    'descartado',
    'adiado',
    'reativado',
    'inscricao_vinculada',
    'inscricao_vinculada_lote'
  ]::text[]));

COMMENT ON CONSTRAINT entradas_resolucoes_acao_check ON public.entradas_resolucoes IS
  'Ações de resolução das filas de Entradas. inscricao_vinculada/_lote entraram '
  'em 05/08/2026: a rota de ligar inscrição órfã gravava a primeira desde 31/07 '
  'e o INSERT violava o CHECK em silêncio (o erro é engolido por console.warn), '
  'deixando 134 vínculos humanos sem trilha de autoria. Ação nova no backend '
  'PRECISA entrar aqui.';

-- Conferência (rodar depois · o SQL Editor não mostra RAISE NOTICE):
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='public.entradas_resolucoes'::regclass and contype='c'
--      and conname='entradas_resolucoes_acao_check';
--   -- deve listar inscricao_vinculada e inscricao_vinculada_lote

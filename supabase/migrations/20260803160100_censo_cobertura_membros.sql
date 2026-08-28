-- ============================================================================
-- CENSO / RECADASTRAMENTO · PARTE 2 de 2 — mem_membros
-- (demanda do Arthur Serpa · 2026-08-03)
--
-- ⚠️ APLICAR EM COLAGEM SEPARADA da parte 1
--    (20260803160000_censo_recadastramento.sql · mem_cadastros_pendentes).
--    O SQL Editor roda a colagem inteira numa transação só; DDL que trava DUAS
--    tabelas vivas pode deadlockar (40P01) com o tráfego de produção e a vítima
--    é a migração. `mem_membros` é a tabela mais quente do sistema (toda porta
--    de pessoa a toca), então ela vai sozinha. As duas partes são INDEPENDENTES
--    e idempotentes: qualquer ordem, re-rodar sem medo.
--
-- Marcadores de COBERTURA — é o que responde "quem já respondeu / quem falta",
-- a pergunta que DEFINE um censo e que nenhuma tela do sistema respondia (o
-- módulo de Inscrições conta inscrições; o formulário de membresia conta
-- submissões — nenhum dos dois sabe quantas pessoas da base ainda faltam).
--
-- São COLUNAS e não tabela nova porque a pergunta é "esta pessoa respondeu?",
-- 1 resposta por pessoa (reenvio sobrescreve), e o histórico completo do que
-- ela enviou já vive em mem_cadastros_pendentes.
--
-- ⚠️ `censo_vinculo_declarado` é AUTODECLARADO e é APENAS INFORMATIVO: não é o
--    status de membresia e nada no sistema deve derivar membresia dele. Quem é
--    membro segue sendo decisão da igreja (batismo, curso, carta).
--
-- Auditoria: o trigger de audit de mem_membros (20260521230000) já cobre
-- 'cpf,status,deleted_at,nome,email,telefone' — os campos que o censo pode
-- preencher (email/telefone) JÁ são auditados. O rastro campo a campo do que o
-- censo aplicou vai pra mem_historico (services/censoReconciliar.js), no mesmo
-- padrão do cpfReconciliar.
-- ============================================================================
SET lock_timeout = '10s';

ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS censo_respondido_em TIMESTAMPTZ;

ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS censo_vinculo_declarado TEXT;

ALTER TABLE public.mem_membros
  DROP CONSTRAINT IF EXISTS mem_membros_censo_vinculo_declarado_check;
ALTER TABLE public.mem_membros
  ADD CONSTRAINT mem_membros_censo_vinculo_declarado_check
  CHECK (censo_vinculo_declarado IS NULL
         OR censo_vinculo_declarado IN ('membro', 'congregado', 'visitante'));

-- "Quem falta" é o índice quente do painel (varre a base viva inteira).
-- ⚠️ CREATE INDEX (sem CONCURRENTLY) trava escrita na tabela — CONCURRENTLY não
--    roda dentro de transação e o SQL Editor sempre abre uma. Com ~7,5 mil
--    linhas isso é instantâneo; se a tabela crescer uma ordem de grandeza,
--    criar o índice fora do editor.
CREATE INDEX IF NOT EXISTS idx_mem_membros_censo_pendente
  ON public.mem_membros (nome)
  WHERE censo_respondido_em IS NULL AND deleted_at IS NULL AND active = true;

CREATE INDEX IF NOT EXISTS idx_mem_membros_censo_respondido
  ON public.mem_membros (censo_respondido_em DESC)
  WHERE censo_respondido_em IS NOT NULL;

COMMENT ON COLUMN public.mem_membros.censo_respondido_em IS
  'Quando esta pessoa respondeu o censo. NULL = ainda falta (é o denominador da cobertura).';
COMMENT ON COLUMN public.mem_membros.censo_vinculo_declarado IS
  'Vínculo AUTODECLARADO no censo. Informativo — NÃO é o status de membresia.';

-- ⚠️ CONFERIR NO CATÁLOGO (o SQL Editor do Supabase NÃO mostra RAISE NOTICE).
--    Esperado: 2 colunas e 2 índices.
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'mem_membros'
--      AND column_name LIKE 'censo%';
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'mem_membros' AND indexname LIKE '%censo%';

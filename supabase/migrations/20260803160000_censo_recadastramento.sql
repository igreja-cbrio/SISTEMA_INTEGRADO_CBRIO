-- ============================================================================
-- CENSO / RECADASTRAMENTO DA MEMBRESIA (demanda do Arthur Serpa · 2026-08-03)
--
-- A igreja escaneia UM QR no culto por um mês e preenche o formulário público
-- de membresia (`/cadastro-membresia`). Pra MAIORIA das pessoas isso é um
-- UPDATE (elas já existem na base viva), não um INSERT — e é aí que o censo
-- morre operacionalmente: cada pessoa que já existe gerava uma linha
-- `mem_cadastros_pendentes` com status='duplicado' pra resolver UMA POR UMA
-- (não existe endpoint em lote de aprovação/merge). Com a base viva na casa dos
-- 3.900, isso é trabalho humano que ninguém vaza em um mês.
--
-- Esta migration é ADITIVA e habilita 3 coisas:
--   1. `censo` + `vinculo_declarado` — marcam a submissão e o vínculo que a
--      PESSOA declarou (membro / congregado / visitante).
--   2. `censo_conflitos` + status 'aplicado' — o reconciliador
--      (services/censoReconciliar.js) preenche sozinho o campo VAZIO no
--      cadastro existente e manda pra fila humana SÓ o conflito real
--      (valor diferente num campo que já tinha valor).
--   3. Marcadores em `mem_membros` pra responder "quem já respondeu / quem
--      falta" — a pergunta que define um censo e que nem o módulo de
--      Inscrições nem o formulário de membresia respondiam.
--
-- ⚠️ O CENSO NÃO PROMOVE NINGUÉM A MEMBRO. `vinculo_declarado` é
--    AUTODECLARADO e NUNCA vira `mem_membros.status` — mesma política do
--    `converteu_na_cbrio` ("autodeclarado · NUNCA vira convertido/NSM").
--    Quem é membro continua sendo decisão da igreja (batismo, curso, carta) e
--    o número de membresia alimenta OKR/KPI.
--
-- Aplicação manual: 1 colagem só. Tudo idempotente (rodar de novo é no-op).
-- O backend TOLERA a ausência desta migration (as colunas novas só entram no
-- payload quando existem) — mas o painel de cobertura só funciona com ela.
-- ============================================================================
SET lock_timeout = '10s';

-- ── 1. mem_cadastros_pendentes · marcação do censo + conflitos ──────────────
ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS censo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS vinculo_declarado TEXT;

-- Campos que o reconciliador NÃO pôde aplicar porque o cadastro existente já
-- tinha OUTRO valor. Formato: [{campo, atual, informado}] — a UI mostra os dois
-- lados e a pessoa da equipe escolhe. Fica NA LINHA (e não numa tabela de fila
-- nova) porque é a linha que carrega os valores submetidos: a tela de
-- Duplicatas que a equipe já usa passa a ter tudo o que precisa pra decidir.
ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS censo_conflitos JSONB;

-- Quando o reconciliador aplicou tudo sem conflito, a linha vira 'aplicado':
-- some da fila humana MAS continua existindo como prova do que a pessoa
-- enviou e do consentimento que ela aceitou (LGPD).
-- ⚠️ Descobre o nome REAL do CHECK no catálogo antes de dropar (drift git↔prod:
--    o nome pode não ser o convencional). Padrão da 20260729070000.
DO $$
DECLARE nome_check TEXT;
BEGIN
  SELECT con.conname INTO nome_check
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'mem_cadastros_pendentes'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%status%'
     AND pg_get_constraintdef(con.oid) ILIKE '%pendente%'
   LIMIT 1;

  IF nome_check IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.mem_cadastros_pendentes DROP CONSTRAINT %I', nome_check);
  END IF;

  -- Defensivo: o SELECT acima pode ter achado um CHECK com nome legado e
  -- dropado ESSE, deixando o nome canônico ocupado por uma rodada anterior.
  ALTER TABLE public.mem_cadastros_pendentes
    DROP CONSTRAINT IF EXISTS mem_cadastros_pendentes_status_check;

  ALTER TABLE public.mem_cadastros_pendentes
    ADD CONSTRAINT mem_cadastros_pendentes_status_check
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'duplicado', 'aplicado'));
END $$;

-- Vocabulário do vínculo AUTODECLARADO. Sem acento (é identificador
-- persistido · a regra global de acentuação vale pro texto EXIBIDO).
ALTER TABLE public.mem_cadastros_pendentes
  DROP CONSTRAINT IF EXISTS mem_cadastros_pendentes_vinculo_declarado_check;
ALTER TABLE public.mem_cadastros_pendentes
  ADD CONSTRAINT mem_cadastros_pendentes_vinculo_declarado_check
  CHECK (vinculo_declarado IS NULL
         OR vinculo_declarado IN ('membro', 'congregado', 'visitante'));

-- Fila do censo (conflito a resolver) e volume por dia da campanha.
CREATE INDEX IF NOT EXISTS idx_mem_cad_pend_censo
  ON public.mem_cadastros_pendentes (created_at DESC)
  WHERE censo = true;

-- ── 2. mem_membros · marcadores de cobertura ────────────────────────────────
-- É o que responde "quem falta". Coluna e não tabela nova: a pergunta é
-- "esta pessoa respondeu?", 1 resposta por pessoa (reenvio sobrescreve), e o
-- histórico completo do que ela enviou já vive em mem_cadastros_pendentes.
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
CREATE INDEX IF NOT EXISTS idx_mem_membros_censo_pendente
  ON public.mem_membros (nome)
  WHERE censo_respondido_em IS NULL AND deleted_at IS NULL AND active = true;

CREATE INDEX IF NOT EXISTS idx_mem_membros_censo_respondido
  ON public.mem_membros (censo_respondido_em DESC)
  WHERE censo_respondido_em IS NOT NULL;

-- ── 3. Auditoria ────────────────────────────────────────────────────────────
-- O trigger de audit de mem_membros (20260521230000) já cobre
-- 'cpf,status,deleted_at,nome,email,telefone' — os campos que o censo pode
-- preencher (email/telefone) JÁ são auditados. O rastro campo a campo do que
-- o censo aplicou vai pra mem_historico (services/censoReconciliar.js), no
-- mesmo padrão do cpfReconciliar.

COMMENT ON COLUMN public.mem_cadastros_pendentes.censo IS
  'true = submissão veio da campanha de censo/recadastramento. Separa o censo do fluxo normal de cadastro público na contagem de cobertura.';
COMMENT ON COLUMN public.mem_cadastros_pendentes.vinculo_declarado IS
  'Vínculo AUTODECLARADO pela pessoa (membro|congregado|visitante). NUNCA vira mem_membros.status — quem é membro é decisão da igreja (batismo/curso/carta).';
COMMENT ON COLUMN public.mem_cadastros_pendentes.censo_conflitos IS
  'Campos que o reconciliador não aplicou porque o cadastro já tinha OUTRO valor: [{campo, atual, informado}]. Alimenta a decisão humana na tela de Duplicatas.';
COMMENT ON COLUMN public.mem_membros.censo_respondido_em IS
  'Quando esta pessoa respondeu o censo. NULL = ainda falta (é o denominador da cobertura).';
COMMENT ON COLUMN public.mem_membros.censo_vinculo_declarado IS
  'Vínculo AUTODECLARADO no censo. Informativo — NÃO é o status de membresia.';

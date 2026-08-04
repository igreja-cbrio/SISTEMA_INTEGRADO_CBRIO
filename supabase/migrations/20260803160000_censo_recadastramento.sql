-- ============================================================================
-- CENSO / RECADASTRAMENTO · PARTE 1 de 2 — mem_cadastros_pendentes
-- (demanda do Arthur Serpa · 2026-08-03)
--
-- ⚠️ APLICAR EM 2 COLAGENS SEPARADAS, UMA TABELA CADA:
--      1ª) este arquivo               → mem_cadastros_pendentes
--      2ª) 20260803160100_censo_cobertura_membros.sql → mem_membros
--    O SQL Editor do Supabase roda a colagem inteira numa transação só. DDL que
--    trava DUAS tabelas vivas pode se abraçar com uma consulta de produção que
--    as toca na ordem inversa → `40P01 deadlock detected`, e a vítima é a
--    migração (rollback total). Foi o que aconteceu na 20260728150000. Transação
--    de tabela única não forma ciclo. As duas partes são INDEPENDENTES e
--    idempotentes: pode rodar em qualquer ordem e re-rodar sem medo.
--
-- CONTEXTO. A igreja escaneia UM QR no culto por um mês e preenche o formulário
-- público de membresia (`/cadastro-membresia?censo=1`). Pra MAIORIA das pessoas
-- isso é um UPDATE (elas já existem na base viva), não um INSERT — e é aí que o
-- censo morre operacionalmente: cada pessoa que já existe gerava uma linha
-- `mem_cadastros_pendentes` com status='duplicado' pra resolver UMA POR UMA
-- (não existe endpoint em lote de aprovação/merge). Com a base viva na casa dos
-- 3.900, isso é trabalho humano que ninguém vaza em um mês.
--
-- Esta parte habilita:
--   1. `censo` + `vinculo_declarado` — marcam a submissão e o vínculo que a
--      PESSOA declarou (membro / congregado / visitante).
--   2. `censo_conflitos` + status 'aplicado' — o reconciliador
--      (services/censoReconciliar.js) preenche sozinho o campo VAZIO no
--      cadastro existente e manda pra fila humana SÓ o conflito real (valor
--      diferente num campo que já tinha valor).
--
-- ⚠️ O CENSO NÃO PROMOVE NINGUÉM A MEMBRO. `vinculo_declarado` é AUTODECLARADO
--    e NUNCA vira `mem_membros.status` — mesma política do `converteu_na_cbrio`
--    ("autodeclarado · NUNCA vira convertido/NSM"). Quem é membro continua
--    sendo decisão da igreja (batismo, curso, carta) e o número de membresia
--    alimenta OKR/KPI.
--
-- O backend TOLERA a ausência desta migration (o insert repete sem as colunas
-- quando elas não existem — 42703), mas o painel de cobertura só funciona com
-- as DUAS partes aplicadas.
-- ============================================================================
SET lock_timeout = '10s';

-- ── Marcação do censo + conflitos ───────────────────────────────────────────
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
-- some da fila humana MAS continua existindo como prova do que a pessoa enviou
-- e do consentimento que ela aceitou (LGPD).
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

COMMENT ON COLUMN public.mem_cadastros_pendentes.censo IS
  'true = submissão veio da campanha de censo/recadastramento. Separa o censo do fluxo normal de cadastro público na contagem de cobertura.';
COMMENT ON COLUMN public.mem_cadastros_pendentes.vinculo_declarado IS
  'Vínculo AUTODECLARADO pela pessoa (membro|congregado|visitante). NUNCA vira mem_membros.status — quem é membro é decisão da igreja (batismo/curso/carta).';
COMMENT ON COLUMN public.mem_cadastros_pendentes.censo_conflitos IS
  'Campos que o reconciliador não aplicou porque o cadastro já tinha OUTRO valor: [{campo, atual, informado}]. Alimenta a decisão humana na tela de Duplicatas.';

-- ⚠️ CONFERIR NO CATÁLOGO (o SQL Editor do Supabase NÃO mostra RAISE NOTICE —
--    não usar notice como prova). Esperado: 3 linhas e 'aplicado' no CHECK.
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'mem_cadastros_pendentes'
--      AND column_name IN ('censo', 'vinculo_declarado', 'censo_conflitos');
--
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'mem_cadastros_pendentes_status_check';

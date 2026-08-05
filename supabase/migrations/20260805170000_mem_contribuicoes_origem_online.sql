-- ============================================================================
-- mem_contribuicoes.origem += 'online'  (doação pelo site/app · Generosidade)
--
-- ADITIVA e IDEMPOTENTE: só amplia o CHECK. Nenhuma linha existente muda, nenhum
-- leitor precisa saber do valor novo (o dashboard financeiro lê o BALANÇO, não
-- esta tabela — ver a lei nº 6 do núcleo de pagamentos).
--
-- POR QUE UM VALOR NOVO, e não reusar um dos 4 que existem:
--   'pix'         mentiria em doação por CARTÃO (e a forma real já vive em
--                 forma_pagamento, vinda de pag_cobrancas.metodo — o que o PSP
--                 CONFIRMOU). Foi exatamente o palpite `|| 'pix'` do espelho de
--                 inscrições que fez a tela dizer "Pix" pra todo mundo.
--   'banco'       é conciliação de extrato, feita por gente.
--   'manual'      é lançamento humano no painel.
--   'importacao'  é planilha nominal.
-- 'online' responde a pergunta que nenhum deles responde: "esta doação nasceu
-- na porta pública, com cobrança no PSP e webhook", e é o que permite auditar o
-- canal sem cruzar tabela.
--
-- ⚠️ O nome do CHECK é descoberto no CATÁLOGO antes de dropar (nunca decorado):
-- o banco vivo pode ter constraint com nome diferente do arquivo original.
--
-- ⚠️⚠️ DRIFT REAL, medido antes de aplicar (05/08): o CHECK VIVO é
--   ('manual','banco','pix','importacao','app')
-- — tem **`app`**, que NÃO existe no arquivo `20260413170000` que criou a tabela.
-- Alguém o acrescentou direto em produção (é o caminho de doação pelo app, das
-- Edge Functions `generosidade-*`) e **há 1 linha usando** (10/06/2026).
-- A 1ª versão desta migration recriava a lista a partir do ARQUIVO e teria
-- DERRUBADO o `app`: `ADD CONSTRAINT` numa tabela que viola falha com 23514, e a
-- migration morreria no meio. Por isso a lista abaixo é a do banco VIVO + o valor
-- novo. Régua: escrever migration sobre `pg_get_constraintdef`, não sobre o
-- arquivo que "deveria" descrever o estado.
--
-- ⚠️ `app` e `online` são canais DIFERENTES e os dois ficam: `app` = doação
-- nativa dentro do aplicativo (Stripe/Apple Pay, hoje desligada até a Benevity);
-- `online` = a porta pública `/doar` (Asaas), que o app abre no navegador. Fundir
-- os dois faria "de onde veio essa doação?" perder a resposta.
-- ============================================================================

DO $$
DECLARE
  v_nome text;
BEGIN
  SELECT con.conname INTO v_nome
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'mem_contribuicoes'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%origem%'
     AND pg_get_constraintdef(con.oid) ILIKE '%importacao%'
   LIMIT 1;

  IF v_nome IS NOT NULL THEN
    -- Já aceita 'online'? Então a migration já rodou — sai sem tocar em nada.
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
       WHERE con.conname = v_nome
         AND pg_get_constraintdef(con.oid) ILIKE '%online%'
    ) THEN
      RAISE NOTICE 'mem_contribuicoes.origem já aceita ''online'' — nada a fazer.';
      RETURN;
    END IF;
    EXECUTE format('ALTER TABLE public.mem_contribuicoes DROP CONSTRAINT %I', v_nome);
  END IF;

  -- ⚠️ `app` está aqui porque está no CHECK VIVO e TEM linha usando — ver o
  -- bloco de DRIFT no topo. Removê-lo faz este ADD CONSTRAINT falhar (23514).
  ALTER TABLE public.mem_contribuicoes
    ADD CONSTRAINT mem_contribuicoes_origem_check
    CHECK (origem IN ('manual', 'banco', 'pix', 'importacao', 'app', 'online'));
END $$;

COMMENT ON COLUMN public.mem_contribuicoes.origem IS
  'Como a contribuição chegou: manual (lançada no painel) · banco (conciliação de extrato) · '
  'pix (chave da igreja) · importacao (planilha nominal) · app (doação nativa dentro do '
  'aplicativo) · online (doação pela porta pública /doar, com cobrança em pag_cobrancas — a '
  'forma real fica em forma_pagamento).';

-- ⚠️ NENHUMA tabela nova para a doação, de propósito. A "linha de domínio" da
-- doação É a cobrança (`pag_cobrancas` com origem_tipo='generosidade'): uma
-- tabela `gen_doacoes` só duplicaria valor/pagador/status e viraria a segunda
-- verdade que o núcleo de pagamentos existe pra evitar. `origem_tipo` é texto
-- livre no banco justamente pra módulo novo não exigir migration.

-- ── Conferência (rodar depois, no catálogo — NUNCA confiar em RAISE NOTICE,
--    que o SQL Editor do Supabase não mostra) ────────────────────────────────
-- select pg_get_constraintdef(con.oid)
--   from pg_constraint con
--   join pg_class rel on rel.oid = con.conrelid
--  where rel.relname = 'mem_contribuicoes' and con.contype = 'c';
--
-- Idempotência da doação (a UNIQUE que faz reentrega de webhook não duplicar
-- contribuição) já existe desde 20260413170000:
-- select indexdef from pg_indexes
--  where tablename = 'mem_contribuicoes' and indexname = 'uniq_mem_contribuicoes_referencia';

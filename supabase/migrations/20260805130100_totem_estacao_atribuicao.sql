-- ============================================================================
-- Totem · ATRIBUIÇÃO da estação nas linhas que ela produz (2026-08-05)
--
-- Segunda parte de 20260805130000_totem_estacoes.sql. Colagem SEPARADA de
-- propósito: aqui mexemos em 3 tabelas VIVAS do fluxo de inscrição/dinheiro, e
-- DDL que trava várias tabelas na mesma transação pode se abraçar com uma
-- consulta de produção que as toca na ordem inversa (40P01 · foi o que
-- aconteceu na 20260728150000). Aplicar DEPOIS da parte 1.
--
-- Por que COLUNA e não `metadata` jsonb: a conciliação diária do presencial é
-- `GROUP BY estacao_id`, e em JSON isso é scan. Também é o que responde "qual
-- maquininha cobrou isso" sem depender de convenção de chave.
--
-- ⚠️ LEI Nº 10 aplicada: `ADD COLUMN IF NOT EXISTS ... REFERENCES` ENGOLE a FK
-- quando a coluna já existe (o IF NOT EXISTS pula o comando INTEIRO). Foi assim
-- que `vol_profiles.membresia_id` passou meses sem a FK que o repo "declarava".
-- Aqui a coluna e a constraint entram em comandos SEPARADOS, a constraint
-- guardada por pg_constraint. E a FK é a peça que faz `merge_membros`-style
-- descoberta por catálogo funcionar — não é enfeite de integridade.
--
-- ⚠️ FK entra NOT VALID + VALIDATE em seguida: a validação de uma coluna nova
-- (100% NULL) é garantida a passar, e o VALIDATE toma lock mais fraco
-- (SHARE UPDATE EXCLUSIVE) que não bloqueia leitura nem escrita da tabela viva.
-- ============================================================================

-- ─── 1. pag_cobrancas · qual estação cobrou ───────────────────────────────
ALTER TABLE public.pag_cobrancas
  ADD COLUMN IF NOT EXISTS estacao_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pag_cobrancas_estacao_id_fkey'
      AND conrelid = 'public.pag_cobrancas'::regclass
  ) THEN
    ALTER TABLE public.pag_cobrancas
      ADD CONSTRAINT pag_cobrancas_estacao_id_fkey
      FOREIGN KEY (estacao_id) REFERENCES public.totem_estacoes(id)
      ON DELETE SET NULL NOT VALID;
    ALTER TABLE public.pag_cobrancas VALIDATE CONSTRAINT pag_cobrancas_estacao_id_fkey;
    RAISE NOTICE '[totem] FK pag_cobrancas.estacao_id criada';
  ELSE
    RAISE NOTICE '[totem] FK pag_cobrancas.estacao_id ja existia';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pag_cobrancas_estacao_idx
  ON public.pag_cobrancas (estacao_id, created_at) WHERE estacao_id IS NOT NULL;

COMMENT ON COLUMN public.pag_cobrancas.estacao_id IS
  'Estação de autoatendimento que originou a cobrança (NULL = veio pela web). Atribuído pelo servidor a partir do token da estação — NUNCA declarado pelo cliente.';

-- ─── 2. inscricoes · onde a pessoa se inscreveu ───────────────────────────
-- Separado da cobrança de propósito: evento GRATUITO no totem não tem cobrança
-- e você ainda quer saber onde o consentimento foi colhido.
ALTER TABLE public.inscricoes
  ADD COLUMN IF NOT EXISTS totem_estacao_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inscricoes_totem_estacao_id_fkey'
      AND conrelid = 'public.inscricoes'::regclass
  ) THEN
    ALTER TABLE public.inscricoes
      ADD CONSTRAINT inscricoes_totem_estacao_id_fkey
      FOREIGN KEY (totem_estacao_id) REFERENCES public.totem_estacoes(id)
      ON DELETE SET NULL NOT VALID;
    ALTER TABLE public.inscricoes VALIDATE CONSTRAINT inscricoes_totem_estacao_id_fkey;
    RAISE NOTICE '[totem] FK inscricoes.totem_estacao_id criada';
  ELSE
    RAISE NOTICE '[totem] FK inscricoes.totem_estacao_id ja existia';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inscricoes_totem_estacao_idx
  ON public.inscricoes (totem_estacao_id) WHERE totem_estacao_id IS NOT NULL;

-- ─── 3. inscricao_consentimentos · onde a prova foi colhida ───────────────
-- ⚠️ O CHECK de `porta` NÃO é tocado: 'evento_externo' continua verdadeiro
-- (é o mesmo contrato, o mesmo texto canônico do GET /textos). O que distingue
-- o presencial é a ESTAÇÃO. Alterar CHECK de tabela append-only de auditoria
-- legal é risco sem ganho.
ALTER TABLE public.inscricao_consentimentos
  ADD COLUMN IF NOT EXISTS totem_estacao_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inscricao_consentimentos_totem_estacao_id_fkey'
      AND conrelid = 'public.inscricao_consentimentos'::regclass
  ) THEN
    ALTER TABLE public.inscricao_consentimentos
      ADD CONSTRAINT inscricao_consentimentos_totem_estacao_id_fkey
      FOREIGN KEY (totem_estacao_id) REFERENCES public.totem_estacoes(id)
      ON DELETE SET NULL NOT VALID;
    ALTER TABLE public.inscricao_consentimentos
      VALIDATE CONSTRAINT inscricao_consentimentos_totem_estacao_id_fkey;
    RAISE NOTICE '[totem] FK inscricao_consentimentos.totem_estacao_id criada';
  ELSE
    RAISE NOTICE '[totem] FK inscricao_consentimentos.totem_estacao_id ja existia';
  END IF;
END $$;

COMMENT ON COLUMN public.inscricao_consentimentos.totem_estacao_id IS
  'Estação onde o consentimento foi colhido presencialmente (NULL = web/celular da própria pessoa). Responde "quem colheu esta prova, e onde".';

-- ─── Conferência (SQL Editor) ──────────────────────────────────────────────
-- select conname, conrelid::regclass, convalidated from pg_constraint
--  where conname in ('pag_cobrancas_estacao_id_fkey',
--                    'inscricoes_totem_estacao_id_fkey',
--                    'inscricao_consentimentos_totem_estacao_id_fkey');
--   ⚠️ convalidated tem que ser TRUE nas 3 — FK criada e não validada não
--      protege nada e é o tipo de coisa que passa meses sem ninguém ver.
-- select table_name, column_name from information_schema.columns
--  where column_name in ('estacao_id','totem_estacao_id') order by 1;

-- ═══════════════════════════════════════════════════════════════════════════
--  DIAGNÓSTICOS · o botão "Resolver todos" · 2026-08-31
--
--  Pedido do Matheus: um botão na aba Diagnósticos que resolve tudo, abre as
--  PRs, faz os merges, e deixa SINALIZADO o que precisa da ação dele.
--
--  ⚠️⚠️ A MÁQUINA JÁ EXISTIA E NUNCA HAVIA RODADO. O `developer_agent`
--  (Railway) escreve código, roda o G1, abre PR, espera o CI e mergeia — e
--  medido em 31/08 há **ZERO `agent_runs` de `developer_agent` na história do
--  banco**. Esta migration não constrói executor nenhum: ela abre as três
--  portas que faltavam pra ligar a aba nele.
--
--  Nada aqui é destrutivo: 2 CHECKs ganham valor novo e 1 coluna nasce com
--  default seguro (`false` = não mergeia).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · `origem = 'diagnostico'`
--
-- A procedência tem de ficar registrada na própria linha: "de onde veio esta
-- tarefa?" é a primeira pergunta de quem for auditar um merge automático, e
-- reusar `'web'` (que é o clique genérico do painel) apagaria a resposta.
--
-- ⚠️ GUARDA DE DRIFT em vez de reescrita cega: a definição VIVA é conferida
-- contra a que foi medida em 31/08. Se outra frente acrescentou um valor fora
-- do git, a migration ABORTA — `DROP + ADD` com lista decorada é uma REMOÇÃO
-- silenciosa disfarçada de acréscimo (a lição da whitelist de soft-delete).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
  v_esperada text := 'CHECK ((origem = ANY (ARRAY[''manual''::text, ''web''::text, ''whatsapp''::text, ''app''::text, ''cron''::text])))';
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
   WHERE c.relname = 'agent_tarefas' AND con.conname = 'agent_tarefas_origem_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'agent_tarefas_origem_check não existe — conferir o schema vivo antes de mexer';
  END IF;

  IF v_def LIKE '%''diagnostico''%' THEN
    RAISE NOTICE 'origem: ''diagnostico'' já aceito — nada a fazer';
  ELSIF v_def <> v_esperada THEN
    RAISE EXCEPTION 'agent_tarefas_origem_check DIVERGE do medido em 31/08. Vivo: %', v_def;
  ELSE
    ALTER TABLE public.agent_tarefas DROP CONSTRAINT agent_tarefas_origem_check;
    ALTER TABLE public.agent_tarefas ADD CONSTRAINT agent_tarefas_origem_check
      CHECK (origem = ANY (ARRAY['manual','web','whatsapp','app','cron','diagnostico']::text[]));
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · ⚠️⚠️ BUG LATENTE · `gate = 'aprovacao_unica'` era RECUSADO pelo banco
--
-- Achado ao medir os CHECKs em 31/08. `agent-worker/src/agents/devAgent.ts`
-- fecha o fluxo de bug com:
--
--     atualizarTarefa(taskId, { status: 'concluida', gate: 'aprovacao_unica' })
--
-- e `'aprovacao_unica'` NÃO estava na lista permitida (G1 · G2 · execucao ·
-- revisao). `atualizarTarefa` LANÇA em erro, e essa chamada é o passo seguinte
-- ao `mergearPr`. Ou seja, no primeiro bug corrigido de verdade o resultado
-- seria: **PR MERGEADO, migration aplicada em produção, deploy disparado — e a
-- tarefa marcada `falhou`**, sem notificar quem reportou. O board diria o
-- oposto do que aconteceu.
--
-- ⚠️ Ninguém descobriu porque o executor nunca rodou (0 runs). É bomba armada,
-- não estrago em curso — e o caminho de merge é exatamente o que esta leva
-- passa a usar, então tem de ser desarmada antes.
--
-- Por que ampliar o CHECK e não trocar o valor no código: `'aprovacao_unica'`
-- é a distinção que o fluxo FAZ (aprovação única × G2 com revisão humana), e
-- está escrita no skill do agente. Renomear apagaria a distinção.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
  v_esperada text := 'CHECK ((gate = ANY (ARRAY[''G1''::text, ''G2''::text, ''execucao''::text, ''revisao''::text])))';
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
   WHERE c.relname = 'agent_tarefas' AND con.conname = 'agent_tarefas_gate_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'agent_tarefas_gate_check não existe — conferir o schema vivo antes de mexer';
  END IF;

  IF v_def LIKE '%''aprovacao_unica''%' THEN
    RAISE NOTICE 'gate: ''aprovacao_unica'' já aceito — nada a fazer';
  ELSIF v_def <> v_esperada THEN
    RAISE EXCEPTION 'agent_tarefas_gate_check DIVERGE do medido em 31/08. Vivo: %', v_def;
  ELSE
    ALTER TABLE public.agent_tarefas DROP CONSTRAINT agent_tarefas_gate_check;
    ALTER TABLE public.agent_tarefas ADD CONSTRAINT agent_tarefas_gate_check
      CHECK (gate = ANY (ARRAY['G1','G2','execucao','revisao','aprovacao_unica']::text[]));
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · `merge_automatico` · quem autoriza o merge é ESTA coluna
--
-- ⚠️⚠️ DEFAULT `false` é fail-closed e não é detalhe: toda tarefa que já existe
-- e toda tarefa criada por qualquer outro caminho (app do staff, board manual,
-- watcher) segue PARANDO no PR. Só a linha que a régua de autonomia marcar
-- explicitamente é mergeada sozinha.
--
-- Coluna, e não `gate`/`descricao`: é AUTORIZAÇÃO, e autorização escondida em
-- texto livre é o que ninguém audita. Aqui dá pra responder num SELECT "o que
-- foi mergeado sozinho, e quem autorizou".
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_tarefas
  ADD COLUMN IF NOT EXISTS merge_automatico BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agent_tarefas.merge_automatico IS
  'true = o developer_agent mergeia o próprio PR quando o CI ficar verde (deploy '
  'automático do Vercel). Escrito SÓ pela régua backend/utils/diagnosticoAutonomia.js '
  '(faixa "auto": incidente reproduzível + classificação de código + plano de ação + '
  'fora de pagamentos/autenticação/migrations). Default false = fail-closed: para no PR. '
  '⚠️ Migrations continuam PROIBIDAS neste caminho (writePolicy incident_correction).';

COMMENT ON COLUMN public.agent_tarefas.origem IS
  'De onde a tarefa veio. ''diagnostico'' = criada pelo botão "Resolver todos" da aba '
  'Diagnósticos do /assistente-ia, a partir de um achado com incidente aberto — nessas '
  'linhas `id` é IGUAL a system_incidents.id (é a identidade que o devAgent usa pra '
  'reconhecer correção assistida, e é o que liga o achado ao andamento na tela).';

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · leitura do andamento por incidente
--
-- A aba resolve o estado de N achados numa consulta (`.in('id', incidentIds)`).
-- ⚠️ Índice PARCIAL aqui é seguro porque nenhum `ON CONFLICT` o infere — quem
-- casa é a PK (`id`), que é a identidade com o incidente.
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS agent_tarefas_diagnostico_idx
  ON public.agent_tarefas (origem, status)
  WHERE origem = 'diagnostico' AND deleted_at IS NULL;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONSOLIDAÇÃO · BUGS DO APP × MÓDULO SISTEMA
-- Bugs reportados no app Staff (`agent_tarefas` classe='bug') viram incidentes
-- no módulo Sistema (`system_incidents` source_type='bug') POR TRIGGER SQL.
--
-- Por que trigger e não código JS: o worker do Railway (agent-worker/devBoard.ts)
-- grava status DIRETO no Supabase com service_role, sem passar pelo Express. O
-- trigger é o único ponto onde TODAS as escritas da tarefa convergem (rota
-- staff.js + dispatcher + agente + rota decidir) — espelho em JS precisaria de
-- 3 lugares e um redeploy do worker.
--
-- Decisões (conselho llm-council + aval do Matheus 2026-08-14):
--   · source_type NOVO 'bug' no CHECK (semântica limpa; não disfarçar de feedback)
--   · incidente nasce já em 'investigando' (convenção da triage · pula promoteUntriaged)
--   · agendada → mitigado (aprovação = mitigação em andamento)
--   · ESPELHO NUNCA ABORTA a escrita da tarefa (EXCEPTION → RAISE WARNING)
--
-- ⚠️ VERIFICADO CONTRA O BANCO VIVO antes de escrever (14/08/2026):
--   · `uq_system_incidents_source` é PARCIAL — `EXPLAIN` do INSERT confirmou
--     "Conflict Arbiter Indexes: uq_system_incidents_source", ou seja a
--     inferência do ON CONFLICT casa. Se não casasse, o erro cairia no
--     EXCEPTION abaixo e o espelho falharia PARA SEMPRE, em silêncio.
--   · `system_incidents.environment` é NOT NULL (default 'unknown') e os 13
--     incidentes existentes são TODOS 'production' — por isso gravamos
--     'production' explícito, senão o bug nasceria como o único 'unknown'.
--   · `agent_tarefas.titulo` é NOT NULL → `'Bug: ' || NULL` não acontece.
--   · severidades ('info','warning','error','critical') e status do incidente
--     conferidos contra os CHECKs vivos.
--
-- ADITIVA e idempotente · não altera dado existente (só recria CHECK + cria
-- função/trigger + backfill que hoje é no-op: há 0 tarefas classe='bug').
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. system_incidents · source_type ganha 'bug' ──────────────────────────
-- Ampliação de CHECK: aceita tudo o que já aceitava, mais 'bug'.
ALTER TABLE public.system_incidents DROP CONSTRAINT IF EXISTS system_incidents_source_type_check;
ALTER TABLE public.system_incidents ADD CONSTRAINT system_incidents_source_type_check
  CHECK (source_type IN ('manual','feedback','server_error','job','sentry','security','bug'));

-- ── 2. Trigger de espelhamento (INSERT + UPDATE de agent_tarefas) ──────────
CREATE OR REPLACE FUNCTION public.fn_agent_tarefas_sync_incidente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_incident_id uuid;
  v_status      text;
BEGIN
  -- Título: o CHECK de system_incidents.title exige 3..180 chars.
  -- Status do incidente espelhado do status da tarefa (só pontos limpos).
  -- Statuses sem espelho (falhou/bloqueada/cancelada) → NULL = mantém como está,
  -- porque "a tarefa falhou" não diz nada sobre o bug ter sido resolvido.
  v_status := CASE NEW.status
    WHEN 'nova'                  THEN 'investigando'
    WHEN 'em_diagnostico'        THEN 'investigando'
    WHEN 'em_andamento'          THEN 'investigando'
    WHEN 'aguardando_revisao'    THEN 'investigando'
    WHEN 'aguardando_aprovacao'  THEN 'investigando'
    WHEN 'agendada'              THEN 'mitigado'
    WHEN 'concluida'             THEN 'resolvido'
    WHEN 'rejeitada'             THEN 'risco_aceito'
    ELSE NULL
  END;

  -- Find-or-create pelo source_ref (= task.id), em QUALQUER status — cobre a
  -- reabertura (concluida → em_andamento é transição válida em agentTasks, e
  -- resolvido → investigando é válida em sistemaV1) sem duplicar incidente.
  SELECT id INTO v_incident_id
    FROM public.system_incidents
   WHERE source_type = 'bug' AND source_ref = NEW.id::text
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_incident_id IS NULL THEN
    INSERT INTO public.system_incidents (
      title, description, severity, status, source_type, source_ref,
      affected_surface, environment, created_by_email, updated_by_email,
      acknowledged_at
    ) VALUES (
      left(CASE WHEN char_length(NEW.titulo) >= 3 THEN NEW.titulo ELSE 'Bug: ' || NEW.titulo END, 180),
      NEW.descricao,
      CASE NEW.prioridade
        WHEN 'baixa'   THEN 'info'
        WHEN 'media'   THEN 'warning'
        WHEN 'alta'    THEN 'error'
        WHEN 'critica' THEN 'critical'
        ELSE 'warning'
      END,
      COALESCE(v_status, 'investigando'),
      'bug', NEW.id::text,
      CASE WHEN NEW.origem = 'app' THEN 'app-staff' ELSE 'painel-agentes' END,
      'production',
      'agente-incidentes@cbrio.org', 'agente-incidentes@cbrio.org', now()
    )
    -- Guarda de corrida (duas escritas simultâneas da mesma tarefa). O
    -- predicado é IDÊNTICO ao do índice parcial `uq_system_incidents_source`
    -- — inferência confirmada por EXPLAIN, ver cabeçalho.
    ON CONFLICT (source_type, source_ref)
      WHERE source_ref IS NOT NULL
        AND status IN ('novo','reconhecido','investigando','mitigado','monitorado')
    DO NOTHING;

  ELSIF v_status IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- ⚠️ Espelha SÓ status e carimbos de tempo. `title` e `severity` NÃO são
    -- reescritos de propósito: /sistema é painel operacional onde gente refina
    -- o incidente, e sobrescrever a cada mudança de status apagaria o trabalho
    -- humano. O incidente nasce com o título/severidade da tarefa; depois disso
    -- quem manda no texto é quem triou.
    UPDATE public.system_incidents SET
      status           = v_status,
      acknowledged_at  = COALESCE(acknowledged_at, now()),
      -- mitigated_at persiste de 'mitigado' até 'resolvido' e zera na reabertura
      mitigated_at     = CASE WHEN v_status IN ('mitigado','resolvido')
                              THEN COALESCE(mitigated_at, now()) ELSE NULL END,
      resolved_at      = CASE WHEN v_status = 'resolvido'
                              THEN COALESCE(resolved_at, now()) ELSE NULL END,
      updated_by_email = 'agente-incidentes@cbrio.org'
    WHERE id = v_incident_id;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- ESPELHO NUNCA ABORTA A ESCRITA DA TAREFA (regra da casa · best-effort).
  -- ⚠️ Exceção em trigger AFTER aborta o statement inteiro — sem este bloco,
  -- um bug do app deixaria de ser gravado por causa do espelho. É a mesma
  -- lição do incidente de 04/08 com `nsm_eventos_pessoa_valor_uq`.
  RAISE WARNING 'fn_agent_tarefas_sync_incidente falhou (task %): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_tarefas_sync_incidente ON public.agent_tarefas;
CREATE TRIGGER trg_agent_tarefas_sync_incidente
  AFTER INSERT OR UPDATE ON public.agent_tarefas
  FOR EACH ROW
  WHEN (NEW.classe = 'bug')
  EXECUTE FUNCTION public.fn_agent_tarefas_sync_incidente();

COMMENT ON FUNCTION public.fn_agent_tarefas_sync_incidente IS
  'Espelho best-effort: bug (agent_tarefas classe=bug) -> incidente (system_incidents source_type=bug, source_ref=task.id). Cobre TODAS as escritas (Express + worker Railway). NUNCA aborta a criacao/edicao da tarefa. Timeline de eventos vem de graca via trg_system_incident_timeline. UPDATE espelha so status e carimbos: title/severity ficam com quem triou.';

-- ── 3. Backfill · bugs já existentes também aparecem no painel ─────────────
-- Hoje é no-op (0 tarefas classe='bug'), mas o OTA do app Staff já está
-- publicado: sem isto, todo bug que chegar entre a escrita e a aplicação desta
-- migration nasceria fora do painel e ninguém saberia.
INSERT INTO public.system_incidents (
  title, description, severity, status, source_type, source_ref,
  affected_surface, environment, created_by_email, updated_by_email, acknowledged_at
)
SELECT
  left(CASE WHEN char_length(t.titulo) >= 3 THEN t.titulo ELSE 'Bug: ' || t.titulo END, 180),
  t.descricao,
  CASE t.prioridade WHEN 'baixa' THEN 'info' WHEN 'media' THEN 'warning'
       WHEN 'alta' THEN 'error' WHEN 'critica' THEN 'critical' ELSE 'warning' END,
  CASE t.status WHEN 'agendada' THEN 'mitigado'
       WHEN 'concluida' THEN 'resolvido' WHEN 'rejeitada' THEN 'risco_aceito'
       ELSE 'investigando' END,
  'bug', t.id::text,
  CASE WHEN t.origem = 'app' THEN 'app-staff' ELSE 'painel-agentes' END,
  'production',
  'agente-incidentes@cbrio.org', 'agente-incidentes@cbrio.org', now()
FROM public.agent_tarefas t
WHERE t.classe = 'bug'
  AND NOT EXISTS (
    SELECT 1 FROM public.system_incidents i
    WHERE i.source_type = 'bug' AND i.source_ref = t.id::text
  );

-- ⚠️ Rodar `NOTIFY pgrst, 'reload schema'` após aplicar no SQL Editor.

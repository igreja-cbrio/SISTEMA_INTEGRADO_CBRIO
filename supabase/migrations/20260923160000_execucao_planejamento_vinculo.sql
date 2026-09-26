-- =====================================================================
-- Execução do Planejamento · vínculo com Projetos/Eventos + módulo novo
-- =====================================================================
-- Contexto: módulo novo (slug 'planejamento-execucao') que lista as
-- propostas APROVADAS do Planejamento Anual e permite, depois que a
-- proposta entra no calendário (PA.noCalendario · backend/services/
-- planejamentoAnualRegras.js), criar manualmente o Projeto ou Evento
-- vinculado. A decisão do Pastor NUNCA materializa nada sozinha — é
-- sempre um clique humano dentro do módulo novo.
--
-- Idempotente/aditiva: pode já ter sido parcialmente aplicada (coluna
-- criada sem a FK, FK sem o índice, etc.) — cada passo confere o estado
-- vivo antes de agir, nunca assume que partiu do zero.
-- =====================================================================

-- ── 1 · Coluna + FK + UNIQUE em `projects` ──────────────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS proposta_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_proposta_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_proposta_id_fkey
      FOREIGN KEY (proposta_id) REFERENCES public.plan_propostas(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_proposta_id_key'
  ) THEN
    -- UNIQUE padrão do Postgres permite múltiplos NULLs (1 proposta → no
    -- máximo 1 projeto; a maioria dos projetos não vem de proposta nenhuma).
    ALTER TABLE public.projects ADD CONSTRAINT projects_proposta_id_key UNIQUE (proposta_id);
  END IF;
END $$;

COMMENT ON COLUMN public.projects.proposta_id IS
  'Proposta do Planejamento Anual (plan_propostas) que originou este projeto, quando materializado pelo módulo Execução do Planejamento. NULL = projeto criado direto, sem passar pelo ciclo de propostas.';

-- ── 2 · Coluna + FK + UNIQUE em `events` ─────────────────────────────────
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS proposta_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_proposta_id_fkey'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_proposta_id_fkey
      FOREIGN KEY (proposta_id) REFERENCES public.plan_propostas(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_proposta_id_key'
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_proposta_id_key UNIQUE (proposta_id);
  END IF;
END $$;

COMMENT ON COLUMN public.events.proposta_id IS
  'Proposta do Planejamento Anual (plan_propostas) que originou este evento, quando materializado pelo módulo Execução do Planejamento. NULL = evento criado direto.';

CREATE INDEX IF NOT EXISTS idx_projects_proposta_id ON public.projects (proposta_id) WHERE proposta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_proposta_id   ON public.events   (proposta_id) WHERE proposta_id IS NOT NULL;

-- ── 3 · Módulo novo no catálogo ──────────────────────────────────────────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'planejamento-execucao', 'Execução do Planejamento', '/planejamento-execucao', 'estrategica', 53,
       'Propostas aprovadas do Planejamento Anual, com detalhe somente-leitura e Kanban de fases do Projeto/Evento vinculado',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'planejamento-execucao');

-- Matriz default: copia de 'planejamento-anual' (mesmo público que já opera
-- o ciclo de propostas é quem acompanha a execução dele).
DO $$
DECLARE base_modulo_id int; novo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'planejamento-anual';
  SELECT id INTO novo_id        FROM public.modulos WHERE slug = 'planejamento-execucao';
  IF base_modulo_id IS NOT NULL AND novo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao
      (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
     WHERE cmp.modulo_id = base_modulo_id
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

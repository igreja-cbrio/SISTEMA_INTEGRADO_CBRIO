-- ============================================================================
-- APRESENTAÇÃO DE CRIANÇAS · horário do culto (2026-09-08)
--
-- Pedido do Marcos (via Milena, no Kids): *"não aparece o horário que as
-- crianças vão se apresentar. Criar nesse formulário uma ótica parecida com a do
-- batismo: até 6 inscrições, sempre no culto de 9:30; passando de 6, culto de
-- 11:30; com a possibilidade de editar dentro da área do Kids os horários."*
--
-- Espelha `batismo_horarios` (migration 20260624130000) de propósito: catálogo
-- VIVO (a equipe abre/fecha e muda o limite sem PR) + coluna `horario_culto`
-- na inscrição. A diferença é QUEM escolhe: no batismo a pessoa escolhe; aqui
-- o sistema ATRIBUI (primeiro horário aberto com vaga, na `ordem`) e o Kids
-- corrige na tela. Régua pura em `backend/utils/apresentacaoHorario.js`.
--
-- ⚠️ Aditiva e idempotente. Tabela ÚNICA alterada → 1 colagem só.
-- ============================================================================
SET lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.apresentacao_horarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horario     text NOT NULL,                  -- valor gravado na inscrição · ex: '09:30'
  label       text NOT NULL,                  -- exibição · ex: 'Culto das 9h30'
  aberto      boolean NOT NULL DEFAULT true,  -- recebe inscrições automáticas?
  limite      integer,                        -- nulo = sem teto (recebe o transbordo)
  ordem       integer NOT NULL DEFAULT 0,     -- ordem de preenchimento (menor primeiro)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_apresentacao_horarios_horario
  ON public.apresentacao_horarios (horario) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.apresentacao_horarios IS
  'Catálogo dos cultos que recebem a apresentação de crianças (2º domingo). O sistema atribui o 1º horário aberto com vaga na ordem; o Kids edita na tela. 2026-09-08.';
COMMENT ON COLUMN public.apresentacao_horarios.limite IS
  'Vagas (inscrições = crianças) por horário. NULO = sem teto. Irmãos da mesma inscrição nunca se separam: o limite é conferido ANTES da família entrar.';

-- Semente: a regra que a igreja pratica hoje. Só insere se estiver vazio —
-- capacidade é decisão da equipe do Kids, não deste arquivo.
INSERT INTO public.apresentacao_horarios (horario, label, aberto, limite, ordem)
SELECT v.horario, v.label, true, v.limite, v.ordem
  FROM (VALUES
    ('09:30', 'Culto das 9h30',  6,    1),
    ('11:30', 'Culto das 11h30', NULL, 2)
  ) AS v(horario, label, limite, ordem)
 WHERE NOT EXISTS (SELECT 1 FROM public.apresentacao_horarios WHERE deleted_at IS NULL);

-- Horário atribuído/corrigido, estruturado (casa com apresentacao_horarios.horario).
ALTER TABLE public.apresentacao_criancas
  ADD COLUMN IF NOT EXISTS horario_culto text;
COMMENT ON COLUMN public.apresentacao_criancas.horario_culto IS
  'Culto em que a criança será apresentada (ex: 09:30). Atribuído no envio pela régua de apresentacao_horarios; editável pelo Kids. NULO = ainda sem horário.';

CREATE INDEX IF NOT EXISTS idx_apres_data_horario
  ON public.apresentacao_criancas (data_apresentacao, horario_culto) WHERE deleted_at IS NULL;

-- RLS · catálogo de configuração, sem PII: leitura liberada; escrita pelo backend.
ALTER TABLE public.apresentacao_horarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apresentacao_horarios_select ON public.apresentacao_horarios;
CREATE POLICY apresentacao_horarios_select ON public.apresentacao_horarios
  FOR SELECT USING (true);
DROP POLICY IF EXISTS apresentacao_horarios_service ON public.apresentacao_horarios;
CREATE POLICY apresentacao_horarios_service ON public.apresentacao_horarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- updated_at automático (mesma função já usada por apresentacao_criancas)
DROP TRIGGER IF EXISTS trg_apresentacao_horarios_updated_at ON public.apresentacao_horarios;
CREATE TRIGGER trg_apresentacao_horarios_updated_at
  BEFORE UPDATE ON public.apresentacao_horarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_apresentacao_criancas_updated_at();

-- ── Conferência ──────────────────────────────────────────────────────────────
-- select horario, label, aberto, limite, ordem from public.apresentacao_horarios
--  where deleted_at is null order by ordem;
-- Esperado: 09:30 (limite 6, ordem 1) · 11:30 (sem limite, ordem 2).

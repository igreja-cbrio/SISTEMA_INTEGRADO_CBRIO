-- ============================================================================
-- Backfill: traz o HISTÓRICO do Next (next_eventos + next_inscricoes) pro modelo
-- de turmas, pra aparecer na aba Next (Por turma / Por pessoa).
--
-- Mapeamento (Marcos 2026-06-17 · "ver as antigas como turma também"):
--   · 1 turma (status 'encerrada') por evento antigo  → next_turmas
--   · 1 encontro (a data do evento) por turma          → next_encontros (numero 1)
--   · 1 matrícula por inscrição                        → next_matriculas
--   · check_in_at preenchido => presença no encontro 1 (vira 'formado')
--   · inscrição órfã (sem evento) => matrícula na fila (turma_id NULL)
--
-- Idempotente: colunas origem_evento_id / origem_inscricao_id + NOT EXISTS.
-- Aditivo: não dropa nem altera o modelo legado (next_eventos/inscricoes ficam).
-- ============================================================================

ALTER TABLE public.next_turmas     ADD COLUMN IF NOT EXISTS origem_evento_id   uuid REFERENCES public.next_eventos(id)    ON DELETE SET NULL;
ALTER TABLE public.next_matriculas ADD COLUMN IF NOT EXISTS origem_inscricao_id uuid REFERENCES public.next_inscricoes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_turmas_origem_evento
  ON public.next_turmas(origem_evento_id) WHERE origem_evento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_matriculas_origem_insc
  ON public.next_matriculas(origem_inscricao_id) WHERE origem_inscricao_id IS NOT NULL;

-- 1. Turma por evento (encerrada · histórica)
INSERT INTO public.next_turmas (nome, status, observacoes, origem_evento_id, created_at)
SELECT
  COALESCE(NULLIF(btrim(e.titulo), ''), 'Next ' || to_char(e.data, 'DD/MM/YYYY')),
  'encerrada',
  'Importado do histórico do Next',
  e.id,
  COALESCE(e.created_at, now())
FROM public.next_eventos e
WHERE NOT EXISTS (SELECT 1 FROM public.next_turmas t WHERE t.origem_evento_id = e.id);

-- 2. Encontro (a data do evento) por turma importada
INSERT INTO public.next_encontros (turma_id, numero, data, created_at)
SELECT t.id, 1, e.data, COALESCE(e.created_at, now())
FROM public.next_turmas t
JOIN public.next_eventos e ON e.id = t.origem_evento_id
WHERE NOT EXISTS (SELECT 1 FROM public.next_encontros en WHERE en.turma_id = t.id AND en.numero = 1);

-- 3. Matrículas (1 por inscrição vinculada a evento)
INSERT INTO public.next_matriculas (
  turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes, membro_id,
  ja_batizado, ja_voluntario, ja_doador, indicou_batismo, indicou_servir, indicou_grupo, indicou_dizimo,
  status, origem, registered_by, origem_inscricao_id, created_at
)
SELECT
  t.id, i.nome, i.sobrenome, i.cpf, i.telefone, i.email, i.data_nascimento, i.observacoes, i.membro_id,
  COALESCE(i.ja_batizado, false), COALESCE(i.ja_voluntario, false), COALESCE(i.ja_doador, false),
  COALESCE(i.indicou_batismo, false), COALESCE(i.indicou_servir, false), COALESCE(i.indicou_grupo, false), COALESCE(i.indicou_dizimo, false),
  CASE WHEN i.check_in_at IS NOT NULL THEN 'formado' ELSE 'matriculado' END,
  'manual', i.registered_by, i.id, COALESCE(i.created_at, now())
FROM public.next_inscricoes i
JOIN public.next_turmas t ON t.origem_evento_id = i.evento_id
WHERE i.evento_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.next_matriculas m WHERE m.origem_inscricao_id = i.id)
ON CONFLICT DO NOTHING;

-- 3b. Inscrições órfãs (sem evento) → fila (turma_id NULL)
INSERT INTO public.next_matriculas (
  turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes, membro_id,
  ja_batizado, ja_voluntario, ja_doador, indicou_batismo, indicou_servir, indicou_grupo, indicou_dizimo,
  status, origem, registered_by, origem_inscricao_id, created_at
)
SELECT
  NULL, i.nome, i.sobrenome, i.cpf, i.telefone, i.email, i.data_nascimento, i.observacoes, i.membro_id,
  COALESCE(i.ja_batizado, false), COALESCE(i.ja_voluntario, false), COALESCE(i.ja_doador, false),
  COALESCE(i.indicou_batismo, false), COALESCE(i.indicou_servir, false), COALESCE(i.indicou_grupo, false), COALESCE(i.indicou_dizimo, false),
  'matriculado', 'manual', i.registered_by, i.id, COALESCE(i.created_at, now())
FROM public.next_inscricoes i
WHERE i.evento_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.next_matriculas m WHERE m.origem_inscricao_id = i.id)
ON CONFLICT DO NOTHING;

-- 4. Presenças (quem fez check-in => presente no encontro 1 da turma)
INSERT INTO public.next_presencas (encontro_id, matricula_id, presente)
SELECT en.id, m.id, true
FROM public.next_matriculas m
JOIN public.next_inscricoes i ON i.id = m.origem_inscricao_id
JOIN public.next_turmas t ON t.id = m.turma_id AND t.origem_evento_id IS NOT NULL
JOIN public.next_encontros en ON en.turma_id = t.id AND en.numero = 1
WHERE i.check_in_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.next_presencas p WHERE p.encontro_id = en.id AND p.matricula_id = m.id);

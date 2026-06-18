-- ============================================================================
-- Next · turmas MENSAIS (1 turma/mês) + resolução do convertido
--
-- (1) Reagrupa o histórico em turmas MENSAIS: substitui o backfill "1 turma por
--     evento" (#1119) por turmas por MÊS — cada mês = 1 turma ("Abril 2026"…),
--     os domingos do mês = os encontros, e cada pessoa aparece 1× no mês
--     (deduplicada), presente nos encontros em que fez check-in.
-- (2) Acaba com o "vermelho pra sempre": campo de resolução no convertido
--     (cui_convertidos.next_resolucao: contatado|sem_interesse|ja_fez_fora|encerrado).
--
-- Aditivo/idempotente. Não toca next_eventos/next_inscricoes (legado intacto).
-- Decisão Marcos 2026-06-18.
-- ============================================================================

-- 0. Colunas de apoio + folga no nº de encontros ----------------------------
ALTER TABLE public.next_turmas     ADD COLUMN IF NOT EXISTS origem_mes     text;
ALTER TABLE public.next_matriculas ADD COLUMN IF NOT EXISTS origem_mes_key text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_turmas_origem_mes
  ON public.next_turmas(origem_mes) WHERE origem_mes IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_next_matriculas_origem_mes_key
  ON public.next_matriculas(origem_mes_key) WHERE origem_mes_key IS NOT NULL;

-- mês pode ter 5 domingos → solta o teto de encontros (era 1..4)
ALTER TABLE public.next_encontros DROP CONSTRAINT IF EXISTS next_encontros_numero_check;
ALTER TABLE public.next_encontros ADD CONSTRAINT next_encontros_numero_check CHECK (numero BETWEEN 1 AND 6);

-- resolução do convertido (guard: só se a tabela existir)
DO $$ BEGIN
  IF to_regclass('public.cui_convertidos') IS NOT NULL THEN
    ALTER TABLE public.cui_convertidos ADD COLUMN IF NOT EXISTS next_resolucao text
      CHECK (next_resolucao IS NULL OR next_resolucao IN ('contatado','sem_interesse','ja_fez_fora','encerrado'));
    ALTER TABLE public.cui_convertidos ADD COLUMN IF NOT EXISTS next_resolucao_em  timestamptz;
    ALTER TABLE public.cui_convertidos ADD COLUMN IF NOT EXISTS next_resolucao_por uuid;
  END IF;
END $$;

-- 1. Remove o backfill antigo "por evento" (#1119); preserva o que foi criado
--    manualmente (origem_* nulas) e as turmas mensais (origem_mes*).
DELETE FROM public.next_matriculas WHERE origem_inscricao_id IS NOT NULL;
DELETE FROM public.next_turmas     WHERE origem_evento_id   IS NOT NULL;

-- 2. Turma por MÊS ("Abril 2026") -------------------------------------------
INSERT INTO public.next_turmas (nome, status, observacoes, origem_mes, created_at)
SELECT
  (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[m.mes]
    || ' ' || m.ano::text,
  'encerrada', 'Importado do histórico do Next (mensal)', m.ym, now()
FROM (
  SELECT DISTINCT to_char(data,'YYYY-MM') AS ym,
         EXTRACT(YEAR FROM data)::int AS ano, EXTRACT(MONTH FROM data)::int AS mes
  FROM public.next_eventos
) m
WHERE NOT EXISTS (SELECT 1 FROM public.next_turmas t WHERE t.origem_mes = m.ym);

-- 3. Encontros = os domingos daquele mês (numerados por data) ----------------
INSERT INTO public.next_encontros (turma_id, numero, data, created_at)
SELECT t.id, ev.numero, ev.data, now()
FROM (
  SELECT e.data, to_char(e.data,'YYYY-MM') AS ym,
         row_number() OVER (PARTITION BY to_char(e.data,'YYYY-MM') ORDER BY e.data) AS numero
  FROM public.next_eventos e
) ev
JOIN public.next_turmas t ON t.origem_mes = ev.ym
WHERE ev.numero <= 6
  AND NOT EXISTS (SELECT 1 FROM public.next_encontros en WHERE en.turma_id = t.id AND en.data = ev.data);

-- 4. Matrículas: 1 por pessoa por mês (dedup membro_id→cpf→email→nome) --------
WITH insc AS (
  SELECT i.*, to_char(e.data,'YYYY-MM') AS ym,
         lower(COALESCE(NULLIF(i.membro_id::text,''), NULLIF(i.cpf,''), NULLIF(i.email,''),
                        btrim(i.nome || ' ' || COALESCE(i.sobrenome,'')))) AS person_key
  FROM public.next_inscricoes i
  JOIN public.next_eventos e ON e.id = i.evento_id
  WHERE i.evento_id IS NOT NULL
),
ranked AS (
  SELECT *, row_number() OVER (
            PARTITION BY ym, person_key
            ORDER BY (cpf IS NOT NULL) DESC, (membro_id IS NOT NULL) DESC, created_at ASC) AS rn
  FROM insc
)
INSERT INTO public.next_matriculas (
  turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes, membro_id,
  ja_batizado, ja_voluntario, ja_doador, indicou_batismo, indicou_servir, indicou_grupo, indicou_dizimo,
  status, origem, registered_by, origem_mes_key, created_at
)
SELECT
  t.id, r.nome, r.sobrenome, r.cpf, r.telefone, r.email, r.data_nascimento, r.observacoes, r.membro_id,
  COALESCE(r.ja_batizado,false), COALESCE(r.ja_voluntario,false), COALESCE(r.ja_doador,false),
  COALESCE(r.indicou_batismo,false), COALESCE(r.indicou_servir,false), COALESCE(r.indicou_grupo,false), COALESCE(r.indicou_dizimo,false),
  'matriculado', 'manual', r.registered_by, r.ym || '|' || r.person_key, COALESCE(r.created_at, now())
FROM ranked r
JOIN public.next_turmas t ON t.origem_mes = r.ym
WHERE r.rn = 1
  AND NOT EXISTS (SELECT 1 FROM public.next_matriculas m WHERE m.origem_mes_key = r.ym || '|' || r.person_key)
ON CONFLICT DO NOTHING;

-- 5. Presenças: check-in de cada inscrição → presença no encontro daquela data
WITH insc AS (
  SELECT i.check_in_at, e.data, to_char(e.data,'YYYY-MM') AS ym,
         lower(COALESCE(NULLIF(i.membro_id::text,''), NULLIF(i.cpf,''), NULLIF(i.email,''),
                        btrim(i.nome || ' ' || COALESCE(i.sobrenome,'')))) AS person_key
  FROM public.next_inscricoes i
  JOIN public.next_eventos e ON e.id = i.evento_id
  WHERE i.evento_id IS NOT NULL AND i.check_in_at IS NOT NULL
)
INSERT INTO public.next_presencas (encontro_id, matricula_id, presente)
SELECT en.id, m.id, true
FROM insc
JOIN public.next_matriculas m ON m.origem_mes_key = insc.ym || '|' || insc.person_key
JOIN public.next_encontros en ON en.turma_id = m.turma_id AND en.data = insc.data
WHERE NOT EXISTS (SELECT 1 FROM public.next_presencas p WHERE p.encontro_id = en.id AND p.matricula_id = m.id);

-- 6. Status: formado = presente em TODOS os encontros do mês ------------------
UPDATE public.next_matriculas m SET status = 'formado', updated_at = now()
WHERE m.origem_mes_key IS NOT NULL AND m.status <> 'desistiu'
  AND (SELECT count(*) FROM public.next_encontros en WHERE en.turma_id = m.turma_id) > 0
  AND (SELECT count(*) FROM public.next_presencas p
         JOIN public.next_encontros en ON en.id = p.encontro_id
        WHERE en.turma_id = m.turma_id AND p.matricula_id = m.id AND p.presente)
      >= (SELECT count(*) FROM public.next_encontros en WHERE en.turma_id = m.turma_id);

-- 7. Inscrições órfãs (sem evento) → fila (turma_id NULL) ---------------------
INSERT INTO public.next_matriculas (
  turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes, membro_id,
  ja_batizado, ja_voluntario, ja_doador, indicou_batismo, indicou_servir, indicou_grupo, indicou_dizimo,
  status, origem, registered_by, origem_inscricao_id, created_at
)
SELECT
  NULL, i.nome, i.sobrenome, i.cpf, i.telefone, i.email, i.data_nascimento, i.observacoes, i.membro_id,
  COALESCE(i.ja_batizado,false), COALESCE(i.ja_voluntario,false), COALESCE(i.ja_doador,false),
  COALESCE(i.indicou_batismo,false), COALESCE(i.indicou_servir,false), COALESCE(i.indicou_grupo,false), COALESCE(i.indicou_dizimo,false),
  'matriculado', 'manual', i.registered_by, i.id, COALESCE(i.created_at, now())
FROM public.next_inscricoes i
WHERE i.evento_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.next_matriculas m WHERE m.origem_inscricao_id = i.id)
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.next_turmas.origem_mes IS 'AAAA-MM do backfill mensal (idempotência).';

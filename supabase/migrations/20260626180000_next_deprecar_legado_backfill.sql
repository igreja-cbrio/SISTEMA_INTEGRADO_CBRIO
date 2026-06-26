-- ============================================================================
-- Next · backfill que torna next_matriculas a fonte COMPLETA de "fez Next"
--        (pré-requisito p/ cortar as leituras legadas de next_inscricoes)
--
-- Contexto: o redesenho (#1118/#1151) tornou next_matriculas a fonte das turmas,
-- e os KPIs next.* (#1175) já leem só ela. Mas "fez Next" ainda era lido com OR
-- pro check-in legado de next_inscricoes em DOIS lugares — Cuidados
-- (/jornada-convertidos · o "verde") e o NSM do /painel. Pra cortar essas leituras
-- SEM regredir, primeiro tornamos next_matriculas completa.
--
-- Causa do gap: o backfill mensal (#1151) fragmentou cada mês em N encontros
-- (os domingos) e só marcou 'formado' quem teve presença em TODOS. Mas o check-in
-- legado = compareceu ao Next do modelo antigo (1 evento) = COMPLETOU o Next.
-- Resultado medido em prod: 748 dos 994 check-ins ficaram 'matriculado'.
--
-- Esta migration (idempotente · aditiva · NÃO toca turmas operacionais):
--   (1) promove a 'formado' as matrículas HISTÓRICAS (origem_mes_key OU
--       origem_inscricao_id não-nulos) cuja pessoa teve check-in legado
--       (match por membro_id, CPF de 11 díg., ou nome exato);
--   (2) re-liga o membro_id dessas matrículas ao membro_id canônico que está na
--       própria inscrição-gêmea — o #1151 gravou um membro_id sintético que
--       divergiu do canônico (corrige a quebra do match forte no Cuidados);
--   (3) insere matrícula 'formado' (turma "Histórico · check-in") pros check-ins
--       SEM matrícula por nenhuma identidade (dedup por pessoa · idempotente);
--   (4) backfilla next_presencas (presente=true) das matrículas formadas pelo
--       backfill, pra o 'formado' SOBREVIVER a um recompute (Reabrir turma).
--
-- Fora do alcance (decisão · canônico de pessoa é de OUTRA frente): 1 convertido
-- residual (membro_id divergente entre cui_convertidos e next) segue sem casar
-- pela chave forte — fica pra unificação canônica. next_inscricoes permanece
-- intacta (histórico + módulo Next-Batismo do Kevyn + lookups).
-- ============================================================================

-- 0. Turma "container" dos órfãos (check-in sem matrícula) + 1 encontro -------
--    origem_mes='hist-checkin' (marcador único · idempotente).
INSERT INTO public.next_turmas (nome, status, observacoes, origem_mes)
SELECT 'Histórico · check-in (sem turma)', 'encerrada',
       'Backfill 2026-06-26 · check-ins legados sem matrícula', 'hist-checkin'
WHERE NOT EXISTS (SELECT 1 FROM public.next_turmas WHERE origem_mes = 'hist-checkin');

INSERT INTO public.next_encontros (turma_id, numero, data, tema)
SELECT t.id, 1, NULL, 'Check-in legado'
FROM public.next_turmas t
WHERE t.origem_mes = 'hist-checkin'
  AND NOT EXISTS (SELECT 1 FROM public.next_encontros e WHERE e.turma_id = t.id);

-- 1+2. Promove a formado + re-liga membro_id ao gêmeo canônico ----------------
--      (UPDATE ... FROM com LEFT JOIN · sem subquery escalar em SET nem CASE)
WITH ci AS (  -- check-ins legados (compareceu = completou o Next antigo)
  SELECT membro_id,
         NULLIF(regexp_replace(COALESCE(cpf,''), '[^0-9]', '', 'g'), '') AS cpf11,
         lower(btrim(nome)) AS nomek
  FROM public.next_inscricoes
  WHERE check_in_at IS NOT NULL
),
ci_cpf AS (   -- 1 membro_id por CPF (chave forte)
  SELECT DISTINCT ON (cpf11) cpf11, membro_id
  FROM ci WHERE cpf11 IS NOT NULL AND length(cpf11) = 11 AND membro_id IS NOT NULL
  ORDER BY cpf11, membro_id
),
ci_nome AS (  -- 1 membro_id por nome exato (fallback)
  SELECT DISTINCT ON (nomek) nomek, membro_id
  FROM ci WHERE nomek <> '' AND membro_id IS NOT NULL
  ORDER BY nomek, membro_id
),
alvo AS (     -- matrículas históricas candidatas (chave normalizada pré-calculada)
  SELECT m.id AS mat_id,
         NULLIF(regexp_replace(COALESCE(m.cpf,''), '[^0-9]', '', 'g'), '') AS cpf11,
         lower(btrim(m.nome)) AS nomek,
         m.membro_id AS cur_membro
  FROM public.next_matriculas m
  WHERE m.deleted_at IS NULL
    AND m.status IN ('matriculado', 'incompleto')
    AND (m.origem_mes_key IS NOT NULL OR m.origem_inscricao_id IS NOT NULL)  -- só backfill histórico
)
UPDATE public.next_matriculas t
SET status = 'formado',
    membro_id = COALESCE(
      cc.membro_id,                                                   -- gêmeo por CPF (forte)
      CASE WHEN a.cur_membro IS NULL OR mm.id IS NULL                 -- atual nulo ou sintético
           THEN cn.membro_id END,                                     -- gêmeo por nome
      a.cur_membro),                                                  -- senão mantém
    updated_at = now()
FROM alvo a
LEFT JOIN ci_cpf  cc ON a.cpf11 IS NOT NULL AND cc.cpf11 = a.cpf11
LEFT JOIN ci_nome cn ON cn.nomek = a.nomek
LEFT JOIN public.mem_membros mm ON mm.id = a.cur_membro
WHERE t.id = a.mat_id
  AND (
    (a.cur_membro IS NOT NULL AND EXISTS (SELECT 1 FROM ci WHERE ci.membro_id = a.cur_membro))
    OR cc.membro_id IS NOT NULL   -- casou check-in por CPF
    OR cn.membro_id IS NOT NULL   -- casou check-in por nome
  );

-- 3. Órfãos: check-in legado SEM nenhuma matrícula → formado na turma histórica
WITH orf AS (
  SELECT DISTINCT ON (
           COALESCE(i.membro_id::text,
                    NULLIF(regexp_replace(COALESCE(i.cpf,''),'[^0-9]','','g'),''),
                    lower(btrim(i.nome)))
         )
         i.id, i.membro_id, i.cpf, i.telefone, i.email, i.nome, i.sobrenome,
         i.data_nascimento, i.ja_batizado, i.ja_voluntario, i.ja_doador, i.created_at
  FROM public.next_inscricoes i
  WHERE i.check_in_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.next_matriculas m
      WHERE m.deleted_at IS NULL AND (
           (i.membro_id IS NOT NULL AND m.membro_id = i.membro_id)
        OR (length(NULLIF(regexp_replace(COALESCE(i.cpf,''),'[^0-9]','','g'),'')) = 11
            AND regexp_replace(COALESCE(m.cpf,''),'[^0-9]','','g') = regexp_replace(i.cpf,'[^0-9]','','g'))
        OR (lower(btrim(m.nome)) = lower(btrim(i.nome)))
      ))
  ORDER BY COALESCE(i.membro_id::text,
                    NULLIF(regexp_replace(COALESCE(i.cpf,''),'[^0-9]','','g'),''),
                    lower(btrim(i.nome))),
           (i.cpf IS NOT NULL) DESC, (i.membro_id IS NOT NULL) DESC, i.created_at ASC
)
INSERT INTO public.next_matriculas (
  turma_id, nome, sobrenome, cpf, telefone, email, data_nascimento, membro_id,
  ja_batizado, ja_voluntario, ja_doador, status, origem, origem_inscricao_id, created_at
)
SELECT (SELECT id FROM public.next_turmas WHERE origem_mes = 'hist-checkin'),
       orf.nome, orf.sobrenome, orf.cpf, orf.telefone, orf.email, orf.data_nascimento, orf.membro_id,
       COALESCE(orf.ja_batizado,false), COALESCE(orf.ja_voluntario,false), COALESCE(orf.ja_doador,false),
       'formado', 'manual', orf.id, COALESCE(orf.created_at, now())
FROM orf
WHERE NOT EXISTS (SELECT 1 FROM public.next_matriculas m2 WHERE m2.origem_inscricao_id = orf.id);

-- 4. Presenças das formadas do backfill → 'formado' sobrevive a recompute ------
--    (recomputarStatusTurma demoteria formado sem presença em TODOS os encontros)
INSERT INTO public.next_presencas (encontro_id, matricula_id, presente)
SELECT e.id, m.id, true
FROM public.next_matriculas m
JOIN public.next_encontros e ON e.turma_id = m.turma_id
WHERE m.deleted_at IS NULL
  AND m.status = 'formado'
  AND (m.origem_mes_key IS NOT NULL OR m.origem_inscricao_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.next_presencas p
    WHERE p.encontro_id = e.id AND p.matricula_id = m.id
  );

COMMENT ON COLUMN public.next_turmas.origem_mes IS
  'AAAA-MM do backfill mensal (idempotência). ''hist-checkin'' = container dos check-ins legados sem turma.';

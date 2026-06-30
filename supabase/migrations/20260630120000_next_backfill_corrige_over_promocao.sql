-- ============================================================================
-- Next - corrige a over-promocao do backfill 20260626180000
--
-- O backfill foi aplicado via copia hand-editada (durante o ajuste dos erros de
-- transporte do runner de SQL) que PERDEU o filtro WHERE do UPDATE -> promoveu
-- TODAS as matriculas historicas a 'formado' (1189), nao so as ~865 cujas pessoas
-- realmente tiveram check-in legado. O step 4 entao gravou presencas espurias
-- nesses ~324 falsos, fazendo o 'formado' sobreviver a recompute.
--
-- Esta migration RE-DERIVA o estado correto, independente do que rodou:
--   backfill e 'formado' SOMENTE se a pessoa teve check-in (membro/cpf/nome).
--   (1) apaga as presencas espurias dos formado-backfill SEM check-in real;
--   (2) demote esses rows a 'matriculado'.
-- Idempotente. Em ambiente limpo (migration original correta) nao acha falso -> no-op.
-- ============================================================================

-- 1. Apaga presencas espurias (DELETE antes do UPDATE: o predicado usa status='formado')
DELETE FROM public.next_presencas p
USING public.next_matriculas m
WHERE p.matricula_id = m.id
  AND m.deleted_at IS NULL
  AND m.status = 'formado'
  AND (m.origem_mes_key IS NOT NULL OR m.origem_inscricao_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.next_inscricoes i
    WHERE i.check_in_at IS NOT NULL AND (
         (m.membro_id IS NOT NULL AND i.membro_id = m.membro_id)
      OR (length(NULLIF(regexp_replace(COALESCE(m.cpf,''),'[^0-9]','','g'),'')) = 11
          AND regexp_replace(COALESCE(i.cpf,''),'[^0-9]','','g') = regexp_replace(m.cpf,'[^0-9]','','g'))
      OR (lower(btrim(i.nome)) = lower(btrim(m.nome)))
    )
  );

-- 2. Demote os formado-backfill SEM check-in real -> matriculado
UPDATE public.next_matriculas m
SET status = 'matriculado', updated_at = now()
WHERE m.deleted_at IS NULL
  AND m.status = 'formado'
  AND (m.origem_mes_key IS NOT NULL OR m.origem_inscricao_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.next_inscricoes i
    WHERE i.check_in_at IS NOT NULL AND (
         (m.membro_id IS NOT NULL AND i.membro_id = m.membro_id)
      OR (length(NULLIF(regexp_replace(COALESCE(m.cpf,''),'[^0-9]','','g'),'')) = 11
          AND regexp_replace(COALESCE(i.cpf,''),'[^0-9]','','g') = regexp_replace(m.cpf,'[^0-9]','','g'))
      OR (lower(btrim(i.nome)) = lower(btrim(m.nome)))
    )
  );

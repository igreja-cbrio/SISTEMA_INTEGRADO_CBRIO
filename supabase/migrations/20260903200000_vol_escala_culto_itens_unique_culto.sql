-- ============================================================================
-- A unicidade do ALVO precisa conhecer o horário (2026-09-03)
--
-- ⚠️⚠️ ESTE É O BLOQUEADOR DO SPLIT, e ele estava escondido no `onConflict`.
-- `vol_escala_culto_itens` nasceu (migration `20260729030000`) com
--   UNIQUE NULLS NOT DISTINCT (service_id, team_id, position_id)
-- e o `POST /schedule-templates/:id/apply` faz upsert exatamente nessas três
-- colunas. Para um time `split_por_horario`, as linhas de alvo do 09:30 e do
-- 11:30 têm o MESMO (service_id, team_id, position_id) e diferem só no
-- `culto_id` ⇒ **a segunda sobrescreveria a primeira em silêncio**, e a
-- cobertura da manhã mostraria uma celebração só.
--
-- Eu havia registrado este risco na `20260903190000` apontando as colunas
-- ERRADAS (`service_id, template_item_id`). A constraint real é a de cima —
-- conferida no arquivo de origem.
--
-- ⚠️ `NULLS NOT DISTINCT` é obrigatório e é o que preserva a idempotência do
-- caso não-split: com o default do Postgres (NULLS DISTINCT), dois alvos de
-- BLOCO (`culto_id IS NULL`) do mesmo time/posição passariam a ser permitidos,
-- e reaplicar o template duplicaria a vaga a cada clique. O projeto já usa
-- essa cláusula em `vol_schedules_pc_unique` pelo mesmo motivo.
--
-- ⚠️⚠️ ORDEM DE ROLLOUT: o código do `apply` foi escrito RESILIENTE — tenta o
-- `onConflict` de 4 colunas e cai pro de 3 no erro 42P10. É o mesmo padrão que
-- `services/planningCenter.js` já usa pro índice de 5 colunas do PCO. Então
-- tanto faz se esta migration chega antes ou depois do deploy: nada quebra.
--
-- ⚠️ A constraint original foi declarada INLINE no CREATE TABLE, então o nome
-- é gerado pelo Postgres. Em vez de chutar o nome, o DO abaixo o DESCOBRE pelo
-- conjunto exato de colunas — assim a migration roda igual em qualquer
-- ambiente onde o nome tenha saído diferente.
-- ============================================================================

DO $$
DECLARE
  nome text;
BEGIN
  -- Acha a unique de exatamente (service_id, team_id, position_id)
  SELECT c.conname INTO nome
  FROM pg_constraint c
  WHERE c.conrelid = 'public.vol_escala_culto_itens'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM unnest(c.conkey) k
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
    ) = ARRAY['position_id', 'service_id', 'team_id']
  LIMIT 1;

  IF nome IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.vol_escala_culto_itens DROP CONSTRAINT %I', nome);
    RAISE NOTICE 'unique antiga removida: %', nome;
  ELSE
    RAISE NOTICE 'unique de 3 colunas nao encontrada (ja migrada?)';
  END IF;
END $$;

ALTER TABLE public.vol_escala_culto_itens
  DROP CONSTRAINT IF EXISTS vol_escala_culto_itens_alvo_unico;

ALTER TABLE public.vol_escala_culto_itens
  ADD CONSTRAINT vol_escala_culto_itens_alvo_unico
  UNIQUE NULLS NOT DISTINCT (service_id, team_id, position_id, culto_id);

COMMENT ON CONSTRAINT vol_escala_culto_itens_alvo_unico ON public.vol_escala_culto_itens IS
  'Um alvo por (culto/plano, time, posição, HORÁRIO). O culto_id na chave é o que permite ao time split_por_horario ter uma linha de alvo por celebração do bloco — sem ele a segunda sobrescreveria a primeira. NULLS NOT DISTINCT preserva a idempotência do caso não-split (culto_id NULL), senão reaplicar o template duplicaria a vaga.';

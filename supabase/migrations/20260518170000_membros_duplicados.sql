-- ============================================================================
-- Detecção e merge de membros duplicados
--
-- Marcos: "caso alguém por acaso se converta, ou levante a mão duas vezes em
--          cultos diferentes, ou caso nós marquemos uma decisão de uma pessoa
--          que já está no sistema em grupos por exemplo · não deve ser impedido
--          de ser cadastrado, mas devemos ter uma aba de juntar esses cadastros
--          futuramente".
--
-- Sistema NÃO bloqueia duplicatas (mantém flexibilidade no cadastro).
-- Adiciona:
--   1. View vw_membros_duplicados · pares potenciais (CPF · telefone · nome+nasc · email)
--   2. Tabela mem_duplicados_ignorados · pares marcados como "não é duplicata"
--   3. Tabela mem_merge_log · audit de cada merge feito (snapshot pré-merge)
--   4. Função public.merge_membros(keep_id, merge_ids[]) · faz o merge
--      atualizando todas as FKs conhecidas + deleta duplicatas
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensão pg_trgm pra similaridade de nomes
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. Tabela mem_duplicados_ignorados · pares que Marcos/Alda confirmaram
--    que NÃO são duplicata · não voltam a aparecer na lista
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_duplicados_ignorados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ordenado · sempre menor_id, maior_id pra ser idempotente
  membro_a_id   uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  membro_b_id   uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  ignorado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo        text,
  ignorado_em   timestamptz NOT NULL DEFAULT now(),
  CHECK (membro_a_id < membro_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_dup_ignorados_par
  ON public.mem_duplicados_ignorados (membro_a_id, membro_b_id);

ALTER TABLE public.mem_duplicados_ignorados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_mem_dup_ignorados" ON public.mem_duplicados_ignorados;
CREATE POLICY "service_role_mem_dup_ignorados"
  ON public.mem_duplicados_ignorados FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "auth_read_mem_dup_ignorados" ON public.mem_duplicados_ignorados;
CREATE POLICY "auth_read_mem_dup_ignorados"
  ON public.mem_duplicados_ignorados FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 2. Tabela mem_merge_log · audit de cada merge feito
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mem_merge_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keep_id      uuid NOT NULL,         -- membro que sobrou (não FK · pra preservar log se deletar depois)
  merged_ids   uuid[] NOT NULL,       -- membros que foram absorvidos
  snapshot     jsonb NOT NULL,        -- dados dos merged_ids antes de deletar
  feito_por    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  feito_em     timestamptz NOT NULL DEFAULT now(),
  observacao   text
);

CREATE INDEX IF NOT EXISTS idx_mem_merge_log_keep ON public.mem_merge_log (keep_id, feito_em DESC);

ALTER TABLE public.mem_merge_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_mem_merge_log" ON public.mem_merge_log;
CREATE POLICY "service_role_mem_merge_log"
  ON public.mem_merge_log FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "auth_read_mem_merge_log" ON public.mem_merge_log;
CREATE POLICY "auth_read_mem_merge_log"
  ON public.mem_merge_log FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 3. View vw_membros_duplicados · detecta pares potencialmente duplicados
--
-- Critérios (qualquer um qualifica):
--   - Mesmo CPF (limpo · só dígitos)
--   - Mesmo telefone (limpo)
--   - Mesmo email (lower/trim)
--   - Mesmo nome (lower/trim) + mesma data_nascimento (raríssimo coincidir)
--   - Similaridade de nome > 0.7 + (mesmo CPF OR mesmo telefone OR mesma data_nasc)
--
-- Resultado: 1 linha por par (sempre menor_id, maior_id pra dedup)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_membros_duplicados AS
WITH pares AS (
  -- Mesmo CPF
  SELECT
    LEAST(a.id, b.id)::uuid AS membro_a_id,
    GREATEST(a.id, b.id)::uuid AS membro_b_id,
    'cpf_igual' AS motivo,
    100 AS confianca
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND regexp_replace(a.cpf, '\D', '', 'g') = regexp_replace(b.cpf, '\D', '', 'g')
   AND length(regexp_replace(a.cpf, '\D', '', 'g')) = 11

  UNION

  -- Mesmo telefone
  SELECT
    LEAST(a.id, b.id)::uuid,
    GREATEST(a.id, b.id)::uuid,
    'telefone_igual',
    90
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND regexp_replace(a.telefone, '\D', '', 'g') = regexp_replace(b.telefone, '\D', '', 'g')
   AND length(regexp_replace(a.telefone, '\D', '', 'g')) >= 10

  UNION

  -- Mesmo email
  SELECT
    LEAST(a.id, b.id)::uuid,
    GREATEST(a.id, b.id)::uuid,
    'email_igual',
    85
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND lower(trim(a.email)) = lower(trim(b.email))
   AND a.email IS NOT NULL
   AND length(trim(a.email)) > 3

  UNION

  -- Mesmo nome + data nascimento
  SELECT
    LEAST(a.id, b.id)::uuid,
    GREATEST(a.id, b.id)::uuid,
    'nome_e_nascimento',
    95
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND lower(trim(a.nome)) = lower(trim(b.nome))
   AND a.data_nascimento = b.data_nascimento
   AND a.data_nascimento IS NOT NULL

  UNION

  -- Nome similar (>=0.7) + (mesmo CPF curto OR mesma data nasc)
  SELECT
    LEAST(a.id, b.id)::uuid,
    GREATEST(a.id, b.id)::uuid,
    'nome_similar',
    70
  FROM public.mem_membros a
  JOIN public.mem_membros b
    ON a.id < b.id
   AND similarity(lower(a.nome), lower(b.nome)) >= 0.7
   AND (
     (a.data_nascimento IS NOT NULL AND a.data_nascimento = b.data_nascimento)
     OR (regexp_replace(a.cpf, '\D', '', 'g') = regexp_replace(b.cpf, '\D', '', 'g')
         AND length(regexp_replace(a.cpf, '\D', '', 'g')) = 11)
   )
),
pares_agrupados AS (
  -- Se mesmo par cai em vários critérios, agrega
  SELECT
    membro_a_id,
    membro_b_id,
    array_agg(motivo ORDER BY confianca DESC) AS motivos,
    max(confianca) AS confianca
  FROM pares
  GROUP BY membro_a_id, membro_b_id
)
SELECT
  pa.membro_a_id,
  pa.membro_b_id,
  pa.motivos,
  pa.confianca,
  -- Dados do A
  a.nome           AS a_nome,
  a.email          AS a_email,
  a.telefone       AS a_telefone,
  a.cpf            AS a_cpf,
  a.data_nascimento AS a_nascimento,
  a.status         AS a_status,
  a.foto_url       AS a_foto_url,
  a.created_at     AS a_criado_em,
  -- Dados do B
  b.nome           AS b_nome,
  b.email          AS b_email,
  b.telefone       AS b_telefone,
  b.cpf            AS b_cpf,
  b.data_nascimento AS b_nascimento,
  b.status         AS b_status,
  b.foto_url       AS b_foto_url,
  b.created_at     AS b_criado_em
FROM pares_agrupados pa
JOIN public.mem_membros a ON a.id = pa.membro_a_id
JOIN public.mem_membros b ON b.id = pa.membro_b_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.mem_duplicados_ignorados ign
   WHERE ign.membro_a_id = pa.membro_a_id
     AND ign.membro_b_id = pa.membro_b_id
);

GRANT SELECT ON public.vw_membros_duplicados TO authenticated, service_role;

COMMENT ON VIEW public.vw_membros_duplicados IS
  'Pares de membros potencialmente duplicados · 5 critérios (cpf · telefone · email · nome+nasc · nome similar). Pares marcados em mem_duplicados_ignorados ficam excluidos.';

-- ----------------------------------------------------------------------------
-- 4. Função merge_membros(keep_id, merge_ids[])
--
-- Atualiza todas as FKs apontando pros merge_ids pra apontar pro keep_id,
-- depois deleta os merge_ids. Idempotente · se já não existe, no-op.
--
-- Estratégia pra UNIQUE constraints (ex: mesma pessoa em 2 grupos ativos):
--   DELETE primeiro as duplicatas que conflitariam, depois UPDATE o resto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_membros(
  p_keep_id   uuid,
  p_merge_ids uuid[],
  p_feito_por uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_id uuid;
  v_count_updates jsonb := '{}'::jsonb;
BEGIN
  -- Valida: keep_id existe?
  IF NOT EXISTS (SELECT 1 FROM public.mem_membros WHERE id = p_keep_id) THEN
    RAISE EXCEPTION 'keep_id % não existe em mem_membros', p_keep_id;
  END IF;

  -- Filtra merge_ids: tira o próprio keep_id da lista e IDs inexistentes
  p_merge_ids := ARRAY(
    SELECT DISTINCT m_id
    FROM unnest(p_merge_ids) AS m_id
    WHERE m_id <> p_keep_id
      AND EXISTS (SELECT 1 FROM public.mem_membros WHERE id = m_id)
  );

  IF array_length(p_merge_ids, 1) IS NULL OR array_length(p_merge_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'merged', 0, 'observacao', 'nenhum merge_id válido');
  END IF;

  -- Snapshot pré-merge (pra audit)
  SELECT jsonb_agg(to_jsonb(m.*))
    INTO v_snapshot
    FROM public.mem_membros m
   WHERE m.id = ANY(p_merge_ids);

  -- ──────────────────────────────────────────────────────────────────────
  -- Tabelas com UNIQUE (membro_id, ...) · DELETE conflitos antes do UPDATE
  -- ──────────────────────────────────────────────────────────────────────

  -- mem_grupo_membros · UNIQUE (membro_id) WHERE saiu_em IS NULL
  -- Se keep já tá ativo num grupo, deleta os ativos dos merged
  DELETE FROM public.mem_grupo_membros gm
  WHERE gm.membro_id = ANY(p_merge_ids)
    AND gm.saiu_em IS NULL
    AND EXISTS (
      SELECT 1 FROM public.mem_grupo_membros gm2
      WHERE gm2.membro_id = p_keep_id AND gm2.saiu_em IS NULL
    );

  -- ──────────────────────────────────────────────────────────────────────
  -- UPDATE em todas as FKs conhecidas
  -- ──────────────────────────────────────────────────────────────────────

  UPDATE public.mem_grupo_membros        SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  UPDATE public.mem_grupos               SET lider_id  = p_keep_id WHERE lider_id  = ANY(p_merge_ids);
  UPDATE public.mem_contribuicoes        SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  UPDATE public.mem_trilha_valores       SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  UPDATE public.mem_voluntarios          SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  UPDATE public.mem_devocionais          SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  UPDATE public.cultos_decisoes_pessoas  SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  UPDATE public.nsm_eventos              SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  UPDATE public.cui_jornada180           SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);

  -- Tabelas opcionais (pode não existir em todos os ambientes · usa DO/EXCEPTION)
  BEGIN
    UPDATE public.mem_ministerio_membros SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.mem_ministerios SET lider_id = p_keep_id WHERE lider_id = ANY(p_merge_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.mem_cadastros_pendentes SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.grupo_encontros_presencas SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.grupo_pedidos SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    UPDATE public.vol_inscricoes SET membro_id = p_keep_id WHERE membro_id = ANY(p_merge_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- ──────────────────────────────────────────────────────────────────────
  -- Tenta enriquecer keep_id com dados que merged tinha e keep não
  -- (CPF, telefone, email, data_nascimento, foto_url)
  -- ──────────────────────────────────────────────────────────────────────
  UPDATE public.mem_membros keep
  SET
    cpf            = COALESCE(keep.cpf,            (SELECT cpf            FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.cpf            IS NOT NULL LIMIT 1)),
    telefone       = COALESCE(keep.telefone,       (SELECT telefone       FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.telefone       IS NOT NULL LIMIT 1)),
    email          = COALESCE(keep.email,          (SELECT email          FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.email          IS NOT NULL LIMIT 1)),
    data_nascimento = COALESCE(keep.data_nascimento,(SELECT data_nascimento FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.data_nascimento IS NOT NULL LIMIT 1)),
    foto_url       = COALESCE(keep.foto_url,       (SELECT foto_url       FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids) AND m.foto_url       IS NOT NULL LIMIT 1))
  WHERE keep.id = p_keep_id;

  -- ──────────────────────────────────────────────────────────────────────
  -- DELETE merged_ids · agora seguro (FKs já apontaram pro keep)
  -- ──────────────────────────────────────────────────────────────────────
  DELETE FROM public.mem_membros WHERE id = ANY(p_merge_ids);

  -- Log
  INSERT INTO public.mem_merge_log (keep_id, merged_ids, snapshot, feito_por, observacao)
  VALUES (p_keep_id, p_merge_ids, COALESCE(v_snapshot, '[]'::jsonb), p_feito_por, p_observacao);

  RETURN jsonb_build_object(
    'ok', true,
    'keep_id', p_keep_id,
    'merged', array_length(p_merge_ids, 1)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.merge_membros(uuid, uuid[], uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.merge_membros(uuid, uuid[], uuid, text) IS
  'Funde N membros num só · atualiza FKs em todas as tabelas + deleta duplicatas + log em mem_merge_log. Idempotente.';

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT * FROM vw_membros_duplicados LIMIT 10;
--   SELECT public.merge_membros('<keep_uuid>', ARRAY['<merge1_uuid>','<merge2_uuid>']::uuid[]);
--   SELECT * FROM mem_merge_log ORDER BY feito_em DESC LIMIT 5;
-- ============================================================================

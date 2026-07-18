-- Identidade progressiva · cada porta acrescenta evidências e reavalia pares.
-- Também torna merge_membros conservador: uma colisão UNIQUE remove somente
-- a linha realmente redundante, nunca todas as linhas filhas do cadastro.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS public.mem_identidade_observacoes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id          uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  origem             text NOT NULL,
  origem_id          text,
  nome               text,
  nome_normalizado   text,
  cpf                text,
  telefone           text,
  email              text,
  data_nascimento    date,
  dados              jsonb NOT NULL DEFAULT '{}'::jsonb,
  observado_em       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identidade_obs_membro
  ON public.mem_identidade_observacoes (membro_id, observado_em DESC);
CREATE INDEX IF NOT EXISTS idx_identidade_obs_cpf
  ON public.mem_identidade_observacoes (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identidade_obs_telefone
  ON public.mem_identidade_observacoes (telefone) WHERE telefone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identidade_obs_email
  ON public.mem_identidade_observacoes (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identidade_obs_nascimento
  ON public.mem_identidade_observacoes (data_nascimento) WHERE data_nascimento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identidade_obs_nome_trgm
  ON public.mem_identidade_observacoes USING gin (nome_normalizado gin_trgm_ops)
  WHERE nome_normalizado IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_identidade_obs_origem
  ON public.mem_identidade_observacoes (origem, origem_id);

CREATE TABLE IF NOT EXISTS public.mem_identidade_pares (
  membro_a_id         uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  membro_b_id         uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  score               smallint NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  prioridade          text NOT NULL CHECK (prioridade IN ('quase_confirmado','alta','media','descoberta')),
  evidencias          jsonb NOT NULL DEFAULT '[]'::jsonb,
  contradicoes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  fontes              jsonb NOT NULL DEFAULT '[]'::jsonb,
  primeira_evidencia_em timestamptz NOT NULL DEFAULT now(),
  ultima_evidencia_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membro_a_id, membro_b_id),
  CHECK (membro_a_id < membro_b_id)
);

CREATE INDEX IF NOT EXISTS idx_identidade_pares_fila
  ON public.mem_identidade_pares (prioridade, score DESC, ultima_evidencia_em DESC);

ALTER TABLE public.mem_identidade_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mem_identidade_pares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identidade_observacoes_service ON public.mem_identidade_observacoes;
CREATE POLICY identidade_observacoes_service ON public.mem_identidade_observacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS identidade_pares_service ON public.mem_identidade_pares;
CREATE POLICY identidade_pares_service ON public.mem_identidade_pares
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS identidade_pares_leitura ON public.mem_identidade_pares;
CREATE POLICY identidade_pares_leitura ON public.mem_identidade_pares
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.mem_identidade_observacoes IS
  'Histórico imutável dos sinais informados em cada porta. Um dado novo soma evidência; nunca apaga o que outra porta observou.';
COMMENT ON TABLE public.mem_identidade_pares IS
  'Materialização incremental de possíveis duplicidades. Atualizada imediatamente quando uma nova observação conecta pessoas.';

-- O estado atual vira o ponto zero do histórico. Novas portas acrescentam
-- observações com sua origem real após o deploy do backend.
INSERT INTO public.mem_identidade_observacoes
  (membro_id, origem, origem_id, nome, nome_normalizado, cpf, telefone, email, data_nascimento, observado_em)
SELECT m.id, 'base_legada', m.id::text, m.nome,
       lower(unaccent(regexp_replace(trim(COALESCE(m.nome, '')), '\s+', ' ', 'g'))),
       CASE WHEN length(regexp_replace(COALESCE(m.cpf, ''), '\D', '', 'g')) = 11
            THEN regexp_replace(m.cpf, '\D', '', 'g') END,
       CASE WHEN length(regexp_replace(COALESCE(m.telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 13
            THEN regexp_replace(m.telefone, '\D', '', 'g') END,
       NULLIF(lower(trim(COALESCE(m.email, ''))), ''), m.data_nascimento,
       COALESCE(m.created_at, now())
  FROM public.mem_membros m
 WHERE m.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Rede de segurança para integrações SQL e futuras rotas que gravem o membro
-- sem passar pelo serviço Node. Só dispara quando um campo de identidade nasce
-- ou muda; atualizações administrativas sem relação com identidade não poluem
-- o histórico.
CREATE OR REPLACE FUNCTION public.fn_observar_identidade_membro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
     (NEW.nome, NEW.cpf, NEW.telefone, NEW.email, NEW.data_nascimento)
       IS NOT DISTINCT FROM
     (OLD.nome, OLD.cpf, OLD.telefone, OLD.email, OLD.data_nascimento) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.mem_identidade_observacoes
    (membro_id, origem, nome, nome_normalizado, cpf, telefone, email, data_nascimento, dados)
  VALUES (
    NEW.id, COALESCE(NULLIF(NEW.origem_cadastro, ''), 'mem_membros'), NEW.nome,
    lower(unaccent(regexp_replace(trim(COALESCE(NEW.nome, '')), '\s+', ' ', 'g'))),
    CASE WHEN length(regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g')) = 11
         THEN regexp_replace(NEW.cpf, '\D', '', 'g') END,
    CASE WHEN length(regexp_replace(COALESCE(NEW.telefone, ''), '\D', '', 'g')) BETWEEN 10 AND 13
         THEN regexp_replace(NEW.telefone, '\D', '', 'g') END,
    NULLIF(lower(trim(COALESCE(NEW.email, ''))), ''), NEW.data_nascimento,
    jsonb_build_object('operacao', lower(TG_OP))
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_observar_identidade_membro ON public.mem_membros;
CREATE TRIGGER trg_observar_identidade_membro
AFTER INSERT OR UPDATE OF nome, cpf, telefone, email, data_nascimento ON public.mem_membros
FOR EACH ROW EXECUTE FUNCTION public.fn_observar_identidade_membro();

ALTER TABLE public.mem_merge_log
  ADD COLUMN IF NOT EXISTS related_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.merge_membros(
  p_keep_id uuid,
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
  v_related_snapshot jsonb := '[]'::jsonb;
  v_table_snapshot jsonb;
  v_merge_id uuid;
  v_ctid tid;
  r record;
  v_cpf text;
  v_telefone text;
  v_email text;
  v_nascimento date;
  v_foto text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.mem_membros WHERE id = p_keep_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'keep_id % não existe em mem_membros', p_keep_id;
  END IF;

  p_merge_ids := ARRAY(
    SELECT DISTINCT m_id FROM unnest(p_merge_ids) AS m_id
     WHERE m_id <> p_keep_id
       AND EXISTS (SELECT 1 FROM public.mem_membros WHERE id = m_id AND deleted_at IS NULL)
  );
  IF cardinality(p_merge_ids) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'merged', 0, 'observacao', 'nenhum merge_id válido');
  END IF;

  SELECT jsonb_agg(to_jsonb(m.*)) INTO v_snapshot
    FROM public.mem_membros m WHERE m.id = ANY(p_merge_ids);
  SELECT
    (SELECT cpf FROM public.mem_membros WHERE id = ANY(p_merge_ids) AND cpf IS NOT NULL LIMIT 1),
    (SELECT telefone FROM public.mem_membros WHERE id = ANY(p_merge_ids) AND telefone IS NOT NULL LIMIT 1),
    (SELECT email FROM public.mem_membros WHERE id = ANY(p_merge_ids) AND email IS NOT NULL LIMIT 1),
    (SELECT data_nascimento FROM public.mem_membros WHERE id = ANY(p_merge_ids) AND data_nascimento IS NOT NULL LIMIT 1),
    (SELECT foto_url FROM public.mem_membros WHERE id = ANY(p_merge_ids) AND foto_url IS NOT NULL LIMIT 1)
  INTO v_cpf, v_telefone, v_email, v_nascimento, v_foto;

  DELETE FROM public.mem_duplicados_ignorados
   WHERE membro_a_id = ANY(p_merge_ids) OR membro_b_id = ANY(p_merge_ids);

  -- Pares materializados são derivados das observações. Guardamos o snapshot
  -- e os removemos antes do repoint para não produzir self-pair nem violar a
  -- ordenação membro_a_id < membro_b_id. Novas observações os recalculam.
  SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) INTO v_table_snapshot
    FROM public.mem_identidade_pares p
   WHERE p.membro_a_id = ANY(p_merge_ids) OR p.membro_b_id = ANY(p_merge_ids);
  IF jsonb_array_length(v_table_snapshot) > 0 THEN
    v_related_snapshot := v_related_snapshot || jsonb_build_array(jsonb_build_object(
      'tabela', 'mem_identidade_pares', 'coluna', 'par', 'linhas', v_table_snapshot
    ));
  END IF;
  DELETE FROM public.mem_identidade_pares
   WHERE membro_a_id = ANY(p_merge_ids) OR membro_b_id = ANY(p_merge_ids);

  FOR r IN
    SELECT c.conrelid::regclass AS tab, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.mem_membros'::regclass
       AND c.conrelid <> 'public.mem_duplicados_ignorados'::regclass
       AND c.conrelid <> 'public.mem_identidade_pares'::regclass
  LOOP
    -- Snapshot de recuperação antes de tocar em qualquer filho.
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM %s x WHERE %I = ANY($1)', r.tab, r.col)
      INTO v_table_snapshot USING p_merge_ids;
    IF jsonb_array_length(v_table_snapshot) > 0 THEN
      v_related_snapshot := v_related_snapshot || jsonb_build_array(jsonb_build_object(
        'tabela', r.tab::text, 'coluna', r.col, 'linhas', v_table_snapshot
      ));
    END IF;

    -- Atualiza linha a linha. Se somente aquela linha conflitar com uma UNIQUE,
    -- ela é a redundante; todas as demais continuam preservadas e repontadas.
    FOREACH v_merge_id IN ARRAY p_merge_ids LOOP
      FOR v_ctid IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tab, r.col) USING v_merge_id
      LOOP
        BEGIN
          EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tab, r.col)
            USING p_keep_id, v_ctid;
        EXCEPTION WHEN unique_violation OR check_violation THEN
          EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tab) USING v_ctid;
        END;
      END LOOP;
    END LOOP;
  END LOOP;

  DELETE FROM public.mem_membros WHERE id = ANY(p_merge_ids);
  UPDATE public.mem_membros keep SET
    cpf = COALESCE(keep.cpf, v_cpf),
    telefone = COALESCE(keep.telefone, v_telefone),
    email = COALESCE(keep.email, v_email),
    data_nascimento = COALESCE(keep.data_nascimento, v_nascimento),
    foto_url = COALESCE(keep.foto_url, v_foto)
  WHERE keep.id = p_keep_id;

  INSERT INTO public.mem_merge_log
    (keep_id, merged_ids, snapshot, related_snapshot, feito_por, observacao)
  VALUES
    (p_keep_id, p_merge_ids, COALESCE(v_snapshot, '[]'::jsonb), v_related_snapshot, p_feito_por, p_observacao);

  RETURN jsonb_build_object('ok', true, 'keep_id', p_keep_id, 'merged', cardinality(p_merge_ids));
END $$;

GRANT EXECUTE ON FUNCTION public.merge_membros(uuid, uuid[], uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.merge_membros(uuid, uuid[], uuid, text) IS
  'Fusão segura: preserva snapshot dos filhos e remove somente a linha que realmente colide numa restrição UNIQUE.';

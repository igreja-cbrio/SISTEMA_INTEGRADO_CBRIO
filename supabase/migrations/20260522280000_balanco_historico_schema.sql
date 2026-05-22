-- Schema pra importacao do balanco historico (2022-2025) das planilhas Excel legadas
-- Adiciona suporte a codigo_legado idempotente + grupo de movimento + forma pgto +
-- nome do lancador (texto livre p preservar historico).

-- 1. Tabela de grupos de movimento (categoria solta · 'CUSTOS', 'SECRETARIA', etc)
CREATE TABLE IF NOT EXISTS public.fin_grupos_movimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fin_grupos_movimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_grupos_movimento_read ON public.fin_grupos_movimento
  FOR SELECT TO authenticated USING (true);

CREATE POLICY fin_grupos_movimento_write ON public.fin_grupos_movimento
  FOR ALL TO authenticated
  USING (public.current_user_module_level('financeiro') >= 3)
  WITH CHECK (public.current_user_module_level('financeiro') >= 3);

CREATE POLICY fin_grupos_movimento_service ON public.fin_grupos_movimento
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Novas colunas em fin_transacoes
ALTER TABLE public.fin_transacoes
  ADD COLUMN IF NOT EXISTS codigo_legado BIGINT UNIQUE,
  ADD COLUMN IF NOT EXISTS grupo_movimento_id UUID REFERENCES public.fin_grupos_movimento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS lancado_por_nome TEXT;

CREATE INDEX IF NOT EXISTS idx_fin_transacoes_codigo_legado
  ON public.fin_transacoes (codigo_legado) WHERE codigo_legado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_transacoes_grupo_mov
  ON public.fin_transacoes (grupo_movimento_id) WHERE grupo_movimento_id IS NOT NULL;

-- 3. Mapeamento username legado -> profiles
CREATE TABLE IF NOT EXISTS public.fin_user_legacy_map (
  username_legacy TEXT PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome_referencia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fin_user_legacy_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_user_legacy_map_read ON public.fin_user_legacy_map
  FOR SELECT TO authenticated USING (true);

CREATE POLICY fin_user_legacy_map_write ON public.fin_user_legacy_map
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY fin_user_legacy_map_service ON public.fin_user_legacy_map
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3a. Seeds (resolve por nome em profiles)
INSERT INTO public.fin_user_legacy_map (username_legacy, profile_id, nome_referencia)
SELECT 'francisco', id, 'Francisco Jose'
  FROM public.profiles WHERE name ILIKE 'Francisco%Jos%' ORDER BY created_at LIMIT 1
ON CONFLICT (username_legacy) DO NOTHING;

INSERT INTO public.fin_user_legacy_map (username_legacy, profile_id, nome_referencia)
SELECT 'yagotc01', id, 'Yago Torres'
  FROM public.profiles WHERE name ILIKE 'Yago%Torres%' ORDER BY created_at LIMIT 1
ON CONFLICT (username_legacy) DO NOTHING;

INSERT INTO public.fin_user_legacy_map (username_legacy, profile_id, nome_referencia)
SELECT 'cristina', id, 'Sonia Cristina'
  FROM public.profiles WHERE name ILIKE '%Sonia%Cristina%' ORDER BY created_at LIMIT 1
ON CONFLICT (username_legacy) DO NOTHING;

INSERT INTO public.fin_user_legacy_map (username_legacy, profile_id, nome_referencia)
SELECT 'juliana', id, 'Juliana Leao'
  FROM public.profiles WHERE name ILIKE 'Juliana%Le%' ORDER BY created_at LIMIT 1
ON CONFLICT (username_legacy) DO NOTHING;

INSERT INTO public.fin_user_legacy_map (username_legacy, profile_id, nome_referencia)
SELECT 'matheus', id, 'Matheus Toscano'
  FROM public.profiles WHERE name ILIKE 'Matheus%Toscano%' ORDER BY created_at LIMIT 1
ON CONFLICT (username_legacy) DO NOTHING;

-- 4. Helpers · resolve-ou-cria por nome
CREATE OR REPLACE FUNCTION public.balanco_get_or_create_plano(p_codigo TEXT, p_nome TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_codigo IS NULL OR length(trim(p_codigo)) = 0 THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM fin_plano_contas WHERE codigo = trim(p_codigo) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO fin_plano_contas (codigo, nome, tipo, aceita_lancamento, ativo)
  VALUES (
    trim(p_codigo),
    COALESCE(NULLIF(trim(p_nome), ''), trim(p_codigo)),
    CASE WHEN trim(p_codigo) LIKE '3.%' THEN 'receita' ELSE 'despesa' END,
    true, true
  )
  ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.balanco_get_or_create_centro(p_codigo TEXT, p_nome TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_codigo IS NULL OR length(trim(p_codigo)) = 0 THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM fin_centros_custo WHERE codigo = trim(p_codigo) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO fin_centros_custo (codigo, nome, aceita_lancamento, ativo)
  VALUES (trim(p_codigo), COALESCE(NULLIF(trim(p_nome), ''), trim(p_codigo)), true, true)
  ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.balanco_get_or_create_grupo(p_nome TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM fin_grupos_movimento WHERE nome = trim(p_nome) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO fin_grupos_movimento (nome) VALUES (trim(p_nome))
  ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.balanco_get_or_create_conta(p_nome TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RETURN NULL; END IF;
  IF lower(trim(p_nome)) LIKE '%santander%' THEN
    SELECT id INTO v_id FROM fin_contas WHERE banco ILIKE '%santander%' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  SELECT id INTO v_id FROM fin_contas WHERE nome = trim(p_nome) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO fin_contas (nome, banco, tipo, saldo, ativa)
  VALUES (
    trim(p_nome),
    CASE
      WHEN lower(p_nome) LIKE '%santander%' THEN 'Santander'
      WHEN lower(p_nome) LIKE '%itau%' OR lower(p_nome) LIKE '%itaú%' THEN 'Itaú'
      WHEN lower(p_nome) LIKE '%mercadopago%' OR lower(p_nome) LIKE '%mercado pago%' THEN 'Mercado Pago'
      WHEN lower(p_nome) LIKE '%bradesco%' THEN 'Bradesco'
      WHEN lower(p_nome) LIKE '%caixa%' THEN 'Caixa'
      WHEN lower(p_nome) LIKE '%nu%' OR lower(p_nome) LIKE '%nubank%' THEN 'Nubank'
      ELSE trim(p_nome)
    END,
    CASE WHEN lower(p_nome) LIKE '%caixa%' THEN 'caixa' ELSE 'corrente' END,
    0, true
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5. Funcao master · importa 1 linha do balanco
-- p_dados = JSONB com: codigo, data, cadastro, tipo (E/S), valor, historico,
--   plano_codigo, plano_nome, centro_codigo, centro_nome, grupo_movimento,
--   origem_destino, forma_pagamento, conta_caixa, username
CREATE OR REPLACE FUNCTION public.balanco_importar_linha(p_dados JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_codigo_legado BIGINT;
  v_plano_id UUID;
  v_centro_id UUID;
  v_grupo_id UUID;
  v_conta_id UUID;
  v_profile_id UUID;
  v_username TEXT;
  v_tipo TEXT;
  v_valor NUMERIC;
BEGIN
  v_codigo_legado := (p_dados->>'codigo')::BIGINT;
  IF v_codigo_legado IS NULL THEN RETURN NULL; END IF;

  -- Idempotente · skip se ja existe
  SELECT id INTO v_id FROM fin_transacoes WHERE codigo_legado = v_codigo_legado;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_plano_id  := balanco_get_or_create_plano(p_dados->>'plano_codigo', p_dados->>'plano_nome');
  v_centro_id := balanco_get_or_create_centro(p_dados->>'centro_codigo', p_dados->>'centro_nome');
  v_grupo_id  := balanco_get_or_create_grupo(p_dados->>'grupo_movimento');
  v_conta_id  := balanco_get_or_create_conta(p_dados->>'conta_caixa');

  v_username := lower(trim(p_dados->>'username'));
  IF v_username IS NOT NULL AND length(v_username) > 0 THEN
    SELECT profile_id INTO v_profile_id FROM fin_user_legacy_map WHERE username_legacy = v_username LIMIT 1;
  END IF;

  v_tipo  := CASE WHEN upper(p_dados->>'tipo') = 'E' THEN 'receita' ELSE 'despesa' END;
  v_valor := abs((p_dados->>'valor')::NUMERIC);

  INSERT INTO fin_transacoes (
    codigo_legado, tipo, valor, descricao, data_competencia,
    plano_contas_id, centro_custo_id, grupo_movimento_id, conta_id,
    forma_pagamento, referencia, lancado_por_nome, created_by,
    status, created_at
  )
  VALUES (
    v_codigo_legado, v_tipo, v_valor,
    COALESCE(p_dados->>'historico', p_dados->>'origem_destino', '(sem descricao)'),
    (p_dados->>'data')::date,
    v_plano_id, v_centro_id, v_grupo_id, v_conta_id,
    p_dados->>'forma_pagamento', p_dados->>'origem_destino',
    v_username, v_profile_id,
    'conciliado',
    COALESCE((p_dados->>'cadastro')::timestamptz, now())
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

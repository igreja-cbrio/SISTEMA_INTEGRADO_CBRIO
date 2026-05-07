-- ============================================================================
-- MINISTERIOS · permissao dual (area vs processo) · validacao de dados
--
-- Modelo de responsabilidade dual:
--   - Lider de AREA  → dono do RESULTADO (cobrado quando KPI fora da meta)
--   - Lider/Assistente de MINISTERIO → dono do PROCESSO (cobrado quando dado
--     nao foi preenchido)
--
-- Validacao: lider de area valida (da OK final) os dados da sua area que
-- foram preenchidos pelo ministerio. Garantia de qualidade.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela ministerios
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ministerios (
  id              text PRIMARY KEY,
  nome            text NOT NULL,
  valor_jornada   text NOT NULL CHECK (valor_jornada IN ('seguir', 'conectar', 'investir', 'servir', 'generosidade')),
  descricao       text,
  ordem           int NOT NULL DEFAULT 99,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ministerios ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "ministerios_read" ON public.ministerios FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "ministerios_write_admin" ON public.ministerios FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.ministerios (id, nome, valor_jornada, descricao, ordem) VALUES
  ('integracao',     'Integração',           'seguir',       'Cuida de frequência, conversões, batismos e NEXT (porta de entrada)', 1),
  ('grupos',         'Grupos',               'conectar',     'Cuida dos grupos de conexão e líderes',                                  2),
  ('cuidados',       'Cuidados',             'investir',     'Capelania, aconselhamento, devocionais e Jornada 180',                   3),
  ('voluntariado',   'Voluntariado',         'servir',       'Voluntários ativos, check-ins, treinamento e alocação',                  4),
  ('adm_financeiro', 'Adm / Financeiro',     'generosidade', 'Doações, dizimistas e indicadores de generosidade',                      5)
ON CONFLICT (id) DO UPDATE
  SET nome = EXCLUDED.nome,
      valor_jornada = EXCLUDED.valor_jornada,
      descricao = EXCLUDED.descricao,
      ordem = EXCLUDED.ordem;

-- ----------------------------------------------------------------------------
-- 2. tipos_dado_bruto.ministerio_id
-- ----------------------------------------------------------------------------
ALTER TABLE public.tipos_dado_bruto
  ADD COLUMN IF NOT EXISTS ministerio_id text REFERENCES public.ministerios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tipos_dado_ministerio ON public.tipos_dado_bruto (ministerio_id) WHERE ativo = true;

-- Mapear cada tipo ao ministerio responsavel pela coleta
UPDATE public.tipos_dado_bruto SET ministerio_id = 'integracao'
 WHERE id IN ('frequencia_culto', 'frequencia_next', 'conversoes', 'batismos', 'nps_next', 'novos_convertidos_atend', 'nps_geral');

UPDATE public.tipos_dado_bruto SET ministerio_id = 'grupos'
 WHERE id IN ('frequencia_grupos', 'grupos_ativos', 'lideres_grupos', 'lideres_treinados', 'lideres_acompanhados', 'nps_lideres');

UPDATE public.tipos_dado_bruto SET ministerio_id = 'cuidados'
 WHERE id IN ('devocionais', 'inscricoes_jornada180', 'solicitacoes_capelania', 'solicitacoes_aconselh', 'solicitacoes_capelania_recebidas', 'solicitacoes_aconselhamento_recebidas');

UPDATE public.tipos_dado_bruto SET ministerio_id = 'voluntariado'
 WHERE id IN ('voluntarios_ativos', 'voluntarios_checkin', 'voluntarios_treinamento', 'voluntarios_inativos', 'voluntarios_inativos_3m', 'voluntarios_recuperados', 'voluntarios_alocados', 'nps_voluntarios', 'solicitacoes_servir_recebidas', 'solicitacoes_servir_alocadas');

UPDATE public.tipos_dado_bruto SET ministerio_id = 'adm_financeiro'
 WHERE id IN ('doacoes_valor', 'doadores_count', 'doadores_recorrentes', 'doacoes_qualidade');

-- ----------------------------------------------------------------------------
-- 3. profiles.ministerio_id + ministerio_papel
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ministerio_id text REFERENCES public.ministerios(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ministerio_papel text CHECK (ministerio_papel IS NULL OR ministerio_papel IN ('lider', 'assistente'));

CREATE INDEX IF NOT EXISTS idx_profiles_ministerio ON public.profiles (ministerio_id) WHERE ministerio_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.ministerio_id IS 'Ministerio que a pessoa coordena (lidera ou assiste). Permite preencher dados desse ministerio em todas as areas.';
COMMENT ON COLUMN public.profiles.ministerio_papel IS 'lider ou assistente. Lider e o responsavel principal; assistente tambem pode preencher dados.';

-- ----------------------------------------------------------------------------
-- 4. dados_brutos.validado_por_user_id + validado_em
--    Valida = lider de area dando OK no fim do ciclo
-- ----------------------------------------------------------------------------
ALTER TABLE public.dados_brutos
  ADD COLUMN IF NOT EXISTS validado_por_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.dados_brutos
  ADD COLUMN IF NOT EXISTS validado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_dados_brutos_validacao ON public.dados_brutos (validado_em) WHERE validado_em IS NOT NULL;

COMMENT ON COLUMN public.dados_brutos.validado_por_user_id IS 'Lider de area que validou (deu OK final) este dado.';
COMMENT ON COLUMN public.dados_brutos.validado_em IS 'Quando foi validado. Null = ainda nao validado.';

-- ----------------------------------------------------------------------------
-- 5. Funcao can_edit_dado_bruto: permite edicao se admin OU lider area OU
--    lider/assistente do ministerio do tipo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_dado_bruto(p_area text, p_tipo_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.active = true
       AND (
         -- Admin/diretor: tudo
         p.role IN ('admin', 'diretor')
         OR
         -- Lider de area: dado da sua area
         lower(p_area) = ANY(p.kpi_areas)
         OR
         -- Lider/assistente de ministerio: dado do seu ministerio (qualquer area)
         (p.ministerio_id IS NOT NULL AND p.ministerio_id = (
            SELECT ministerio_id FROM public.tipos_dado_bruto WHERE id = p_tipo_id
         ))
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_dado_bruto(text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Funcao can_validate_dado_bruto: apenas admin/diretor ou lider de area
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_validate_dado_bruto(p_area text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.active = true
       AND (
         p.role IN ('admin', 'diretor')
         OR lower(p_area) = ANY(p.kpi_areas)
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_validate_dado_bruto(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Atualizar RLS de dados_brutos pra usar nova funcao
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  DROP POLICY IF EXISTS "dados_brutos_write_by_area" ON public.dados_brutos;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE POLICY "dados_brutos_write_dual"
  ON public.dados_brutos
  FOR ALL
  TO authenticated
  USING (public.can_edit_dado_bruto(area, tipo_id))
  WITH CHECK (public.can_edit_dado_bruto(area, tipo_id));

-- ----------------------------------------------------------------------------
-- 8. Helper pra atribuir lider/assistente de ministerio por nome
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atribuir_ministerio(
  p_busca_nome text,
  p_ministerio_id text,
  p_papel text
) RETURNS TABLE (
  profile_id uuid,
  nome_encontrado text,
  email_encontrado text,
  resultado text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_profile RECORD;
  v_min_existe boolean;
BEGIN
  IF p_papel NOT IN ('lider', 'assistente') THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text,
      ('papel deve ser "lider" ou "assistente"')::text;
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.ministerios WHERE id = p_ministerio_id AND ativo = true) INTO v_min_existe;
  IF NOT v_min_existe THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text,
      ('Ministerio "' || p_ministerio_id || '" nao existe ou esta inativo')::text;
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.profiles
   WHERE active = true
     AND lower(name) LIKE '%' || lower(p_busca_nome) || '%';

  IF v_count = 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text,
      ('Nenhum profile ativo encontrado com nome contendo "' || p_busca_nome || '"')::text;
    RETURN;
  END IF;

  IF v_count > 1 THEN
    FOR v_profile IN
      SELECT id, name, email FROM public.profiles
       WHERE active = true AND lower(name) LIKE '%' || lower(p_busca_nome) || '%'
       ORDER BY name
    LOOP
      RETURN QUERY SELECT v_profile.id, v_profile.name, v_profile.email,
        ('AMBIGUO: ' || v_count::text || ' profiles — refine a busca')::text;
    END LOOP;
    RETURN;
  END IF;

  SELECT id, name, email INTO v_profile
    FROM public.profiles
   WHERE active = true AND lower(name) LIKE '%' || lower(p_busca_nome) || '%';

  UPDATE public.profiles
     SET ministerio_id = p_ministerio_id,
         ministerio_papel = p_papel
   WHERE id = v_profile.id;

  RETURN QUERY SELECT v_profile.id, v_profile.name, v_profile.email,
    ('OK · ' || p_papel || ' do ministerio ' || p_ministerio_id)::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atribuir_ministerio(text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.atribuir_ministerio IS
  'Helper: marca profile como lider/assistente de ministerio buscando por nome (case insensitive).';

-- ----------------------------------------------------------------------------
-- USO (exemplos):
--
--   SELECT * FROM atribuir_ministerio('NOME_LIDER_INTEGRACAO', 'integracao', 'lider');
--   SELECT * FROM atribuir_ministerio('NOME_ASSIST_INTEGRACAO', 'integracao', 'assistente');
--   SELECT * FROM atribuir_ministerio('Nelio', 'grupos', 'lider');
--   SELECT * FROM atribuir_ministerio('NOME_ASSIST_GRUPOS', 'grupos', 'assistente');
--   ... (10 chamadas total: 1 lider + 1 assistente por ministerio)
--
-- Conferir:
--   SELECT p.name, p.email, m.nome AS ministerio, p.ministerio_papel
--     FROM profiles p
--     JOIN ministerios m ON m.id = p.ministerio_id
--    WHERE p.ministerio_id IS NOT NULL
--    ORDER BY m.ordem, p.ministerio_papel;
-- ----------------------------------------------------------------------------

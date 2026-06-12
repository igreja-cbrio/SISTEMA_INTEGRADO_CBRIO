-- ============================================================================
-- ESCALA 50k · indices, view materializada, statement-level trigger
--
-- Marcos: visao 5 anos · 5 campus · 50k vidas. Preparando o banco pra evitar
-- gargalos que aparecem em volume alto:
--   1. Cruzamento de pessoas hoje carrega 50k linhas em memoria backend ·
--      vira query SQL unica sobre view materializada
--   2. vw_pessoas_papeis recalcula 5 EXISTS toda chamada · vira materializada
--      com refresh horario
--   3. Triggers row-level em dados_brutos podem disparar 100s de recalculos
--      em batch inserts · vira statement-level com transition table
--   4. Indices parciais e compostos onde scan completo aparece
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VIEW MATERIALIZADA · vw_pessoas_papeis_mat
--    Substitui vw_pessoas_papeis (que recalcula a cada SELECT)
--    Mantida a vw original para backward compat (pode dropar dps)
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.vw_pessoas_papeis_mat;

CREATE MATERIALIZED VIEW public.vw_pessoas_papeis_mat AS
SELECT
  m.id AS membresia_id,
  m.nome,
  m.email,
  m.telefone,
  m.cpf,
  m.status,
  m.foto_url,
  m.familia_id,
  m.active,
  -- Papeis (booleanos)
  EXISTS (SELECT 1 FROM public.vol_profiles vp WHERE vp.membresia_id = m.id) AS is_voluntario,
  (SELECT id FROM public.vol_profiles vp WHERE vp.membresia_id = m.id LIMIT 1) AS vol_profile_id,
  EXISTS (SELECT 1 FROM public.int_visitantes iv WHERE iv.membresia_id = m.id) AS is_visitante,
  (SELECT id FROM public.int_visitantes iv WHERE iv.membresia_id = m.id ORDER BY data_visita DESC LIMIT 1) AS visitante_id,
  EXISTS (SELECT 1 FROM public.next_inscricoes ni WHERE ni.membro_id = m.id) AS is_inscrito_next,
  (SELECT count(*) FROM public.next_inscricoes ni WHERE ni.membro_id = m.id) AS total_inscricoes_next,
  EXISTS (SELECT 1 FROM public.mem_grupo_membros gm WHERE gm.membro_id = m.id AND gm.saiu_em IS NULL) AS in_grupo_ativo,
  EXISTS (SELECT 1 FROM public.mem_contribuicoes mc WHERE mc.membro_id = m.id AND mc.data >= (CURRENT_DATE - INTERVAL '90 days')) AS is_contribuinte,

  -- Valores da Jornada (booleanos pre-calculados · usados no /admin/cruzamentos)
  EXISTS (
    SELECT 1 FROM public.mem_trilha_valores tv
     WHERE tv.membro_id = m.id
       AND tv.concluida = true
       AND tv.etapa IN ('conversao', 'primeiro_contato', 'batismo')
  ) AS valor_seguir,
  EXISTS (SELECT 1 FROM public.mem_grupo_membros gm WHERE gm.membro_id = m.id AND gm.saiu_em IS NULL) AS valor_conectar,
  EXISTS (
    SELECT 1 FROM public.cui_jornada180 j
     WHERE j.membro_id = m.id
       AND j.data_encontro >= (CURRENT_DATE - INTERVAL '90 days')
  ) AS valor_investir,
  EXISTS (SELECT 1 FROM public.mem_voluntarios v WHERE v.membro_id = m.id AND v.ate IS NULL) AS valor_servir,
  EXISTS (
    SELECT 1 FROM public.mem_contribuicoes c
     WHERE c.membro_id = m.id AND c.data >= (CURRENT_DATE - INTERVAL '90 days')
  ) AS valor_generosidade,

  now() AS atualizado_em
FROM public.mem_membros m
WHERE m.active = true;

CREATE UNIQUE INDEX idx_vppm_id ON public.vw_pessoas_papeis_mat (membresia_id);
CREATE INDEX idx_vppm_nome ON public.vw_pessoas_papeis_mat (nome);
-- Indices nos booleanos pra filtros (cada filtro do /cruzamentos vira AND nesses)
CREATE INDEX idx_vppm_seguir       ON public.vw_pessoas_papeis_mat (valor_seguir)       WHERE valor_seguir = true;
CREATE INDEX idx_vppm_conectar     ON public.vw_pessoas_papeis_mat (valor_conectar)     WHERE valor_conectar = true;
CREATE INDEX idx_vppm_investir     ON public.vw_pessoas_papeis_mat (valor_investir)     WHERE valor_investir = true;
CREATE INDEX idx_vppm_servir       ON public.vw_pessoas_papeis_mat (valor_servir)       WHERE valor_servir = true;
CREATE INDEX idx_vppm_generosidade ON public.vw_pessoas_papeis_mat (valor_generosidade) WHERE valor_generosidade = true;
CREATE INDEX idx_vppm_voluntario   ON public.vw_pessoas_papeis_mat (is_voluntario)      WHERE is_voluntario = true;
CREATE INDEX idx_vppm_next         ON public.vw_pessoas_papeis_mat (is_inscrito_next)   WHERE is_inscrito_next = true;
CREATE INDEX idx_vppm_visitante    ON public.vw_pessoas_papeis_mat (is_visitante)       WHERE is_visitante = true;

GRANT SELECT ON public.vw_pessoas_papeis_mat TO authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.vw_pessoas_papeis_mat IS
  'Materializada · todos os papeis + 5 valores da Jornada por pessoa. Refresh via cron horario (POST /api/cron/refresh-papeis).';

-- ----------------------------------------------------------------------------
-- 2. Funcao para refresh (chamada pelo cron Vercel)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_vw_pessoas_papeis_mat()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio timestamptz := now();
  v_total int;
BEGIN
  -- CONCURRENTLY · nao bloqueia SELECTs concorrentes (precisa do unique index acima)
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_pessoas_papeis_mat;
  SELECT count(*) INTO v_total FROM public.vw_pessoas_papeis_mat;
  RETURN jsonb_build_object(
    'total', v_total,
    'duracao_ms', extract(epoch from (now() - v_inicio)) * 1000
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_vw_pessoas_papeis_mat() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. INDICES PARCIAIS · cobrem queries do _kpi_agregar_dado e similares
-- ----------------------------------------------------------------------------

-- mem_contribuicoes · maior tabela em volume · queries quase sempre filtram por data
CREATE INDEX IF NOT EXISTS idx_contribuicoes_data_desc
  ON public.mem_contribuicoes (data DESC, membro_id);

-- mem_voluntarios · queries usam .is('ate', null) + membro_id
CREATE INDEX IF NOT EXISTS idx_voluntarios_ativos
  ON public.mem_voluntarios (membro_id) WHERE ate IS NULL;

-- mem_grupo_membros · queries usam .is('saiu_em', null)
CREATE INDEX IF NOT EXISTS idx_grupo_membros_ativos
  ON public.mem_grupo_membros (membro_id) WHERE saiu_em IS NULL;

-- cui_jornada180 · queries usam .gte('data_encontro', X)
CREATE INDEX IF NOT EXISTS idx_jornada180_data_membro
  ON public.cui_jornada180 (data_encontro DESC, membro_id);

-- cultos · queries pelo nome (segmentacao kids/ami/bridge) E data
CREATE INDEX IF NOT EXISTS idx_cultos_data
  ON public.cultos (data DESC);

-- dados_brutos · queries vem com WHERE tipo_id=X AND area=Y AND data BETWEEN
CREATE INDEX IF NOT EXISTS idx_dados_brutos_tipo_area_data
  ON public.dados_brutos (tipo_id, area, data DESC);

-- batismo_inscricoes · WHERE status='realizado' AND data_batismo BETWEEN
CREATE INDEX IF NOT EXISTS idx_batismos_realizados
  ON public.batismo_inscricoes (data_batismo DESC) WHERE status = 'realizado';

-- mem_trilha_valores · usada em valor_seguir
CREATE INDEX IF NOT EXISTS idx_trilha_concluida
  ON public.mem_trilha_valores (membro_id, etapa) WHERE concluida = true;

-- ----------------------------------------------------------------------------
-- 4. STATEMENT-LEVEL TRIGGER em dados_brutos
--    Antes: FOR EACH ROW · 500 inserts = 500 chamadas a recalcular_kpi
--    Agora: FOR EACH STATEMENT · 1 chamada que faz dedup
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_dados_brutos_recalc ON public.dados_brutos;

CREATE OR REPLACE FUNCTION public.tg_dados_brutos_recalcular_kpis_statement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_combo RECORD;
  v_total int := 0;
BEGIN
  -- Pega combos unicos (tipo_id, area, data) das linhas afetadas
  -- e roda recalcular_kpis_por_dado uma vez por combo
  FOR v_combo IN
    SELECT DISTINCT tipo_id, area, data FROM (
      SELECT tipo_id, area, data FROM inserted_rows
      UNION
      SELECT tipo_id, area, data FROM deleted_rows
    ) sub
    WHERE tipo_id IS NOT NULL AND area IS NOT NULL AND data IS NOT NULL
  LOOP
    PERFORM public.recalcular_kpis_por_dado(v_combo.tipo_id, v_combo.area, v_combo.data);
    v_total := v_total + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER tg_dados_brutos_recalc_ins
  AFTER INSERT ON public.dados_brutos
  REFERENCING NEW TABLE AS inserted_rows OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_dados_brutos_recalcular_kpis_statement();

CREATE TRIGGER tg_dados_brutos_recalc_upd
  AFTER UPDATE ON public.dados_brutos
  REFERENCING NEW TABLE AS inserted_rows OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_dados_brutos_recalcular_kpis_statement();

CREATE TRIGGER tg_dados_brutos_recalc_del
  AFTER DELETE ON public.dados_brutos
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_dados_brutos_recalcular_kpis_statement();

-- Trigger DELETE precisa de versao que so usa deleted_rows (nao tem inserted)
CREATE OR REPLACE FUNCTION public.tg_dados_brutos_recalcular_kpis_del()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_combo RECORD;
BEGIN
  FOR v_combo IN
    SELECT DISTINCT tipo_id, area, data FROM deleted_rows
    WHERE tipo_id IS NOT NULL AND area IS NOT NULL AND data IS NOT NULL
  LOOP
    PERFORM public.recalcular_kpis_por_dado(v_combo.tipo_id, v_combo.area, v_combo.data);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_dados_brutos_recalc_del ON public.dados_brutos;
CREATE TRIGGER tg_dados_brutos_recalc_del
  AFTER DELETE ON public.dados_brutos
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_dados_brutos_recalcular_kpis_del();

-- ----------------------------------------------------------------------------
-- 5. Funcao SQL pura · cruzar pessoas por papeis/valores em 1 query
--    Substitui a logica JavaScript em /api/jornada/cruzar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cruzar_pessoas(
  p_criterios jsonb,    -- {"seguir": "tem", "servir": "tem", ...}
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_where text := 'true';
  v_keys text[] := ARRAY[
    'seguir', 'conectar', 'investir', 'servir', 'generosidade',
    'voluntario', 'visitante', 'inscrito_next', 'grupo_ativo', 'contribuinte'
  ];
  v_key text;
  v_val text;
  v_col text;
  v_total_geral int;
  v_total_match int;
  v_membros jsonb;
BEGIN
  -- Constroi WHERE dinamico baseado nos criterios
  FOREACH v_key IN ARRAY v_keys LOOP
    v_val := p_criterios ->> v_key;
    IF v_val NOT IN ('tem', 'nao_tem') OR v_val IS NULL THEN CONTINUE; END IF;

    v_col := CASE v_key
      WHEN 'seguir'        THEN 'valor_seguir'
      WHEN 'conectar'      THEN 'valor_conectar'
      WHEN 'investir'      THEN 'valor_investir'
      WHEN 'servir'        THEN 'valor_servir'
      WHEN 'generosidade'  THEN 'valor_generosidade'
      WHEN 'voluntario'    THEN 'is_voluntario'
      WHEN 'visitante'     THEN 'is_visitante'
      WHEN 'inscrito_next' THEN 'is_inscrito_next'
      WHEN 'grupo_ativo'   THEN 'in_grupo_ativo'
      WHEN 'contribuinte'  THEN 'is_contribuinte'
    END;

    IF v_val = 'tem' THEN
      v_where := v_where || ' AND ' || v_col || ' = true';
    ELSE
      v_where := v_where || ' AND ' || v_col || ' = false';
    END IF;
  END LOOP;

  -- Total geral (sempre todos ativos)
  SELECT count(*) INTO v_total_geral FROM public.vw_pessoas_papeis_mat;

  -- Total match (com filtros)
  EXECUTE 'SELECT count(*) FROM public.vw_pessoas_papeis_mat WHERE ' || v_where
    INTO v_total_match;

  -- Lista paginada (top p_limit)
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM ('
    'SELECT membresia_id AS id, nome, email, telefone, status, foto_url '
    'FROM public.vw_pessoas_papeis_mat WHERE %s '
    'ORDER BY nome LIMIT %s OFFSET %s) t',
    v_where, p_limit, p_offset
  ) INTO v_membros;

  RETURN jsonb_build_object(
    'total_geral', v_total_geral,
    'total_match', v_total_match,
    'percentual', CASE WHEN v_total_geral > 0
                       THEN round((v_total_match::numeric / v_total_geral) * 1000) / 10
                       ELSE 0 END,
    'membros', v_membros
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cruzar_pessoas(jsonb, int, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.cruzar_pessoas(jsonb, int, int) IS
  'Cruzamento de pessoas por papeis/valores · usado pelo /admin/cruzamentos. Le da vw_pessoas_papeis_mat (refresh horario). 1 query · escala ate 100k+.';

-- ----------------------------------------------------------------------------
-- 6. Rodar o primeiro refresh
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_total int;
BEGIN
  -- Nao usa CONCURRENTLY no primeiro (precisa de dados pra usar CONCURRENT)
  REFRESH MATERIALIZED VIEW public.vw_pessoas_papeis_mat;
  SELECT count(*) INTO v_total FROM public.vw_pessoas_papeis_mat;
  RAISE NOTICE 'vw_pessoas_papeis_mat refresh inicial · % linhas', v_total;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------
-- SELECT * FROM cruzar_pessoas('{"servir":"tem","generosidade":"tem"}'::jsonb);
-- SELECT count(*) FROM vw_pessoas_papeis_mat WHERE valor_servir AND valor_generosidade;

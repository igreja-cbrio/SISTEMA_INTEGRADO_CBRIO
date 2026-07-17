-- ============================================================================
-- Conserta os objetos SQL dos crons que falham com 500 todo dia desde 04/07
-- (investigação 2026-07-17 · telemetria app_erros_servidor)
--
--   1. /api/jornada/cron/refresh-papeis · a MATVIEW vw_pessoas_papeis_mat e a
--      função cruzar_pessoas NÃO EXISTEM mais em prod (dropadas fora das
--      migrations ~04/07 · drift git↔prod). Sem elas: o cron falha diário e a
--      tela /admin/cruzamentos está quebrada. Recriação com dois ajustes de
--      modernização: filtro deleted_at IS NULL (o soft-delete nasceu DEPOIS da
--      versão original de 20260511) e vol_profiles/int_visitantes idem quando
--      aplicável.
--   2. /api/financeiro/alertas/cron-gerar · gerar_alertas_financeiros usa
--      severidade 'alerta' (saldo projetado baixo · 20260522190000:93), mas o
--      CHECK de fin_alertas só aceitava info/aviso/critico — o INSERT estoura
--      23514 sempre que a condição de dado é verdadeira (virou verdade em
--      04/07 e ficou). O autor da função desenhou escala de 4 níveis (o CASE
--      de ranking já conhece 'alerta'=3) → o CHECK é que estava desalinhado.
--
-- (Os outros crons quebrados eram bugs de JS — consertados no mesmo PR — e a
-- API do Santander devolvendo 404, que é externa.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1a. Matview de papéis/valores por pessoa (consumida por cruzar_pessoas ·
--     /admin/cruzamentos · refresh diário via cron)
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
  -- Papéis (booleanos)
  EXISTS (SELECT 1 FROM public.vol_profiles vp WHERE vp.membresia_id = m.id) AS is_voluntario,
  (SELECT id FROM public.vol_profiles vp WHERE vp.membresia_id = m.id LIMIT 1) AS vol_profile_id,
  EXISTS (SELECT 1 FROM public.int_visitantes iv WHERE iv.membresia_id = m.id AND iv.deleted_at IS NULL) AS is_visitante,
  (SELECT id FROM public.int_visitantes iv WHERE iv.membresia_id = m.id AND iv.deleted_at IS NULL ORDER BY data_visita DESC LIMIT 1) AS visitante_id,
  EXISTS (SELECT 1 FROM public.next_inscricoes ni WHERE ni.membro_id = m.id) AS is_inscrito_next,
  (SELECT count(*) FROM public.next_inscricoes ni WHERE ni.membro_id = m.id) AS total_inscricoes_next,
  EXISTS (SELECT 1 FROM public.mem_grupo_membros gm WHERE gm.membro_id = m.id AND gm.saiu_em IS NULL AND gm.deleted_at IS NULL) AS in_grupo_ativo,
  EXISTS (SELECT 1 FROM public.mem_contribuicoes mc WHERE mc.membro_id = m.id AND mc.deleted_at IS NULL AND mc.data >= (CURRENT_DATE - INTERVAL '90 days')) AS is_contribuinte,

  -- Valores da Jornada (booleanos pré-calculados · usados no /admin/cruzamentos)
  EXISTS (
    SELECT 1 FROM public.mem_trilha_valores tv
     WHERE tv.membro_id = m.id
       AND tv.concluida = true
       AND tv.deleted_at IS NULL
       AND tv.etapa IN ('conversao', 'primeiro_contato', 'batismo')
  ) AS valor_seguir,
  EXISTS (SELECT 1 FROM public.mem_grupo_membros gm WHERE gm.membro_id = m.id AND gm.saiu_em IS NULL AND gm.deleted_at IS NULL) AS valor_conectar,
  EXISTS (
    SELECT 1 FROM public.cui_jornada180 j
     WHERE j.membro_id = m.id
       AND j.deleted_at IS NULL
       AND j.data_encontro >= (CURRENT_DATE - INTERVAL '90 days')
  ) AS valor_investir,
  EXISTS (SELECT 1 FROM public.mem_voluntarios v WHERE v.membro_id = m.id AND v.ate IS NULL AND v.deleted_at IS NULL) AS valor_servir,
  EXISTS (
    SELECT 1 FROM public.mem_contribuicoes c
     WHERE c.membro_id = m.id AND c.deleted_at IS NULL AND c.data >= (CURRENT_DATE - INTERVAL '90 days')
  ) AS valor_generosidade,

  now() AS atualizado_em
FROM public.mem_membros m
WHERE m.active = true
  AND m.deleted_at IS NULL;

CREATE UNIQUE INDEX idx_vppm_id ON public.vw_pessoas_papeis_mat (membresia_id);
CREATE INDEX idx_vppm_nome ON public.vw_pessoas_papeis_mat (nome);
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
  'Materializada · papéis + 5 valores da Jornada por pessoa VIVA (deleted_at IS NULL desde 20260717170000). Refresh diário via cron /api/jornada/cron/refresh-papeis. Consumida por cruzar_pessoas (/admin/cruzamentos).';

-- Função de refresh (já existia, recriada por segurança)
CREATE OR REPLACE FUNCTION public.refresh_vw_pessoas_papeis_mat()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio timestamptz := now();
  v_total int;
BEGIN
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
-- 1b. cruzar_pessoas · cruzamento em 1 query (consumida por /admin/cruzamentos)
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

  SELECT count(*) INTO v_total_geral FROM public.vw_pessoas_papeis_mat;

  EXECUTE 'SELECT count(*) FROM public.vw_pessoas_papeis_mat WHERE ' || v_where
    INTO v_total_match;

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
  'Cruzamento de pessoas por papéis/valores · usado pelo /admin/cruzamentos. Lê da vw_pessoas_papeis_mat (refresh diário). Recriada em 20260717170000 (havia sido dropada de prod fora das migrations).';

-- ----------------------------------------------------------------------------
-- 2. fin_alertas · CHECK de severidade alinhado à escala de 4 níveis da função
--    geradora (info < aviso < alerta < critico · o CASE de ranking da
--    20260522190000 já conhecia 'alerta'; só o CHECK estava desalinhado)
-- ----------------------------------------------------------------------------
ALTER TABLE public.fin_alertas
  DROP CONSTRAINT IF EXISTS fin_alertas_severidade_check;
ALTER TABLE public.fin_alertas
  ADD CONSTRAINT fin_alertas_severidade_check
  CHECK (severidade IN ('info', 'aviso', 'alerta', 'critico'));

-- ----------------------------------------------------------------------------
-- 3. Primeiro refresh da matview (sem CONCURRENTLY na primeira carga)
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_total int;
BEGIN
  REFRESH MATERIALIZED VIEW public.vw_pessoas_papeis_mat;
  SELECT count(*) INTO v_total FROM public.vw_pessoas_papeis_mat;
  RAISE NOTICE 'vw_pessoas_papeis_mat recriada · % linhas', v_total;
END $$;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT count(*) FROM vw_pessoas_papeis_mat;               -- ~3.7k vivos
--   SELECT cruzar_pessoas('{"servir":"tem"}'::jsonb, 5, 0);   -- JSON com membros
--   SELECT gerar_alertas_financeiros();                       -- sem erro 23514
-- ============================================================================

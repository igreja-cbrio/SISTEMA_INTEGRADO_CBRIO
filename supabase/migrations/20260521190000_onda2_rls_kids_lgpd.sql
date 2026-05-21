-- =====================================================================
-- Onda 2 · RLS contextual Kids (LGPD menores)
-- =====================================================================
-- Resolve achados de auditoria · 2026-05-21:
--   kids_criancas, kids_responsaveis, kids_checkins, kids_sessoes,
--   kids_salas, kids_estacoes, kids_etiquetas_log tinham policies
--   USING(true) WITH CHECK(true) · qualquer authenticated lia dados
--   de menores (nome, foto, observações médicas, telefone do
--   responsável, código de segurança).
--
-- LGPD com menores é o maior risco legal · prioridade máxima.
--
-- Estratégia:
--   - Helpers reutilizáveis (current_user_*, user_module_level)
--   - Replica lógica do middleware backend (resolveEffectivePerms +
--     AREA_MODULO_BOOST) dentro do banco
--   - Policies contextuais: responsável vê o próprio + cargo Kids
--     com nível adequado + super-admin
--   - Soft-delete obrigatório (DELETE = super-admin only)
-- =====================================================================

-- =====================================================================
-- ETAPA 0 · Hotfix · módulos kids/ami/bridge faltantes em prod
--
-- Auditoria de 2026-05-21 descobriu que a migration
-- `20260520140000_modulos_area_culto.sql` não foi aplicada em prod
-- (cargos coord-kids/ami/bridge foram criados pela `20260520150000`,
-- mas os módulos não foram inseridos · falha silenciosa no histórico
-- de aplicação de migrations).
--
-- Sem esses módulos, current_user_module_level('kids') retorna 0
-- (early return em `IF v_modulo_id IS NULL`), e Mariane Gaia
-- (coord-kids) não vê Kids no menu.
--
-- Idempotente · `INSERT ... WHERE NOT EXISTS`.
-- =====================================================================
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'kids', 'Kids', '/kids', 'ministerial', 131,
       'Indicadores Kids (read-only) · totem de check-in', true
 WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'kids');

INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'ami', 'AMI', '/ami', 'ministerial', 132,
       'Indicadores AMI (read-only)', true
 WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'ami');

INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'bridge', 'Bridge', '/bridge', 'ministerial', 133,
       'Indicadores Bridge (read-only)', true
 WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'bridge');

-- Copia matriz default do modulo `online` (que ja existe) pra cada
-- cargo × novo modulo. Mesmo padrao da migration original.
DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'online';
  IF base_modulo_id IS NULL THEN
    RAISE EXCEPTION 'modulo `online` nao encontrado · seed inicial nao rodou?';
  END IF;

  INSERT INTO public.cargo_modulo_permissao
    (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_modulo_id
     AND novo.slug IN ('kids', 'ami', 'bridge')
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;

-- Garante nivel 1 pra TODOS os cargos ativos nos 3 modulos novos
-- (qualquer cargo pode visualizar · sem export, sem aprovar)
INSERT INTO public.cargo_modulo_permissao
  (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT c.id, m.id, 1, false, false, false
  FROM public.cargos c
 CROSS JOIN public.modulos m
 WHERE c.ativo = true AND c.slug IS NOT NULL
   AND m.slug IN ('kids', 'ami', 'bridge')
ON CONFLICT (cargo_id, modulo_id) DO NOTHING;

-- Nivel 3 default pro cargo titular de cada area (escala via AREA_MODULO_BOOST
-- pra 5 automatico se o titular tiver a area correspondente em usuario_areas)
DO $$
DECLARE v_pair RECORD;
BEGIN
  FOR v_pair IN
    SELECT * FROM (VALUES
      ('coordenador-kids',   'kids'),
      ('coordenador-ami',    'ami'),
      ('coordenador-bridge', 'bridge')
    ) AS p(cargo_slug, modulo_slug)
  LOOP
    INSERT INTO public.cargo_modulo_permissao
      (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT c.id, m.id, 3, false, true, false
      FROM public.cargos c, public.modulos m
     WHERE c.slug = v_pair.cargo_slug AND m.slug = v_pair.modulo_slug
    ON CONFLICT (cargo_id, modulo_id) DO UPDATE
       SET nivel = GREATEST(public.cargo_modulo_permissao.nivel, 3),
           pode_aprovar = true,
           updated_at = now();
  END LOOP;
END $$;

-- =====================================================================
-- ETAPA 1 · Extension unaccent (pra normalizar área sem acentos)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =====================================================================
-- ETAPA 2 · Helper · current_user_membro_id()
-- Retorna mem_membros.id do user logado, via:
--   1. profiles.membro_id (link direto · preferido)
--   2. Fallback: match por email lowercase + unaccent
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_user_membro_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    -- Caminho 1: profiles.membro_id (direto)
    (SELECT p.membro_id
     FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.membro_id IS NOT NULL),
    -- Caminho 2: fallback por email
    (SELECT m.id
     FROM public.profiles p
     JOIN public.mem_membros m
       ON LOWER(m.email) = LOWER(p.email)
     WHERE p.id = auth.uid()
       AND p.email IS NOT NULL
       AND m.email IS NOT NULL
       AND m.deleted_at IS NULL
     LIMIT 1)
  )
$$;

COMMENT ON FUNCTION public.current_user_membro_id() IS
  'Retorna mem_membros.id do auth.uid() · via profiles.membro_id ou fallback email LOWER. STABLE+SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.current_user_membro_id() TO authenticated, anon;

-- =====================================================================
-- ETAPA 3 · Helper · current_user_module_level(slug)
-- Replica resolveEffectivePerms() do backend/middleware/auth.js
-- - Super-admin sempre 5
-- - Override individual (permissoes_modulo) com expiracao
-- - Default da matriz (cargo_modulo_permissao via vw_permissao_efetiva)
-- - Boost por area (AREA_MODULO_BOOST · 9 mapeamentos)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_user_module_level(p_module_slug TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_modulo_id UUID;
  v_nivel INTEGER := 0;
  v_override INTEGER;
  v_default INTEGER;
  v_areas_normalizadas TEXT[];
BEGIN
  -- Super-admin curto-circuita
  IF public.is_super_admin() THEN
    RETURN 5;
  END IF;

  -- Email do user logado (chave de match com usuarios)
  SELECT au.email INTO v_user_email
  FROM auth.users au
  WHERE au.id = auth.uid();

  IF v_user_email IS NULL THEN
    RETURN 0;
  END IF;

  -- Resolve usuario row
  SELECT u.id INTO v_user_id
  FROM public.usuarios u
  WHERE LOWER(u.email) = LOWER(v_user_email)
    AND u.ativo = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Resolve modulo row
  SELECT m.id INTO v_modulo_id
  FROM public.modulos m
  WHERE m.slug = p_module_slug
    AND m.ativo = true
  LIMIT 1;

  IF v_modulo_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Override individual (com expiracao)
  SELECT GREATEST(
           COALESCE(pm.nivel_leitura, 0),
           COALESCE(pm.nivel_escrita, 0)
         )
    INTO v_override
  FROM public.permissoes_modulo pm
  WHERE pm.usuario_id = v_user_id
    AND pm.modulo_id  = v_modulo_id
    AND (pm.expira_em IS NULL OR pm.expira_em > now())
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    v_nivel := v_override;
  ELSE
    -- Default da matriz cargo × modulo
    SELECT cmp.nivel INTO v_default
    FROM public.usuarios u
    JOIN public.cargo_modulo_permissao cmp ON cmp.cargo_id = u.cargo_id
    WHERE u.id = v_user_id
      AND cmp.modulo_id = v_modulo_id
    LIMIT 1;

    v_nivel := COALESCE(v_default, 0);
  END IF;

  -- AREA_MODULO_BOOST · replica auth.js:92-103
  -- Se o modulo é um dos 9 com boost E o user tem area correspondente,
  -- promove pra nivel 5 (Math.max)
  -- NOTA: usuario_areas.area_id FK areas.id · nome real vem do JOIN
  IF p_module_slug IN ('kids','ami','bridge','online','cuidados',
                        'grupos','integracao','voluntariado','next') THEN
    SELECT ARRAY_AGG(LOWER(unaccent(a.nome))) INTO v_areas_normalizadas
    FROM public.usuario_areas ua
    JOIN public.areas a ON a.id = ua.area_id
    WHERE ua.usuario_id = v_user_id;

    IF v_areas_normalizadas IS NOT NULL
       AND p_module_slug = ANY(v_areas_normalizadas)
    THEN
      v_nivel := GREATEST(v_nivel, 5);
    END IF;
  END IF;

  RETURN v_nivel;
END
$$;

COMMENT ON FUNCTION public.current_user_module_level(TEXT) IS
  'Replica resolveEffectivePerms() do middleware: super-admin>override>matriz>boost-area. STABLE+SECURITY DEFINER pra bypass RLS interno.';

GRANT EXECUTE ON FUNCTION public.current_user_module_level(TEXT) TO authenticated, anon;

-- =====================================================================
-- ETAPA 4 · Helper · user_is_kids_responsavel(crianca_id)
-- TRUE se o user logado é responsável da criança (kids_responsaveis)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_is_kids_responsavel(p_crianca_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kids_responsaveis kr
    WHERE kr.crianca_id = p_crianca_id
      AND kr.membro_id  = public.current_user_membro_id()
  )
$$;

COMMENT ON FUNCTION public.user_is_kids_responsavel(UUID) IS
  'TRUE se auth.uid() bate com algum responsavel da criança. Usa current_user_membro_id().';

GRANT EXECUTE ON FUNCTION public.user_is_kids_responsavel(UUID) TO authenticated, anon;

-- =====================================================================
-- ETAPA 5 · LOCKDOWN · kids_criancas
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read kids_criancas"   ON public.kids_criancas;
DROP POLICY IF EXISTS "Authenticated write kids_criancas"  ON public.kids_criancas;
DROP POLICY IF EXISTS "Authenticated update kids_criancas" ON public.kids_criancas;
DROP POLICY IF EXISTS "Authenticated delete kids_criancas" ON public.kids_criancas;
DROP POLICY IF EXISTS kids_criancas_read     ON public.kids_criancas;
DROP POLICY IF EXISTS kids_criancas_select   ON public.kids_criancas;
DROP POLICY IF EXISTS kids_criancas_insert   ON public.kids_criancas;
DROP POLICY IF EXISTS kids_criancas_update   ON public.kids_criancas;
DROP POLICY IF EXISTS kids_criancas_delete   ON public.kids_criancas;
DROP POLICY IF EXISTS kids_criancas_service  ON public.kids_criancas;

-- READ: responsável da criança OR cargo Kids nivel >= 1 OR super-admin
CREATE POLICY kids_criancas_select ON public.kids_criancas
  FOR SELECT TO authenticated
  USING (
    public.user_is_kids_responsavel(id)
    OR public.current_user_module_level('kids') >= 1
  );

-- INSERT: cargo Kids nivel >= 3 OR super-admin
CREATE POLICY kids_criancas_insert ON public.kids_criancas
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);

-- UPDATE: cargo Kids nivel >= 3 OR super-admin
CREATE POLICY kids_criancas_update ON public.kids_criancas
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

-- DELETE: SO super-admin (LGPD · use app_soft_delete pra resto)
CREATE POLICY kids_criancas_delete ON public.kids_criancas
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Service role bypass (backend total access)
CREATE POLICY kids_criancas_service ON public.kids_criancas
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 6 · LOCKDOWN · kids_responsaveis
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read kids_responsaveis"   ON public.kids_responsaveis;
DROP POLICY IF EXISTS "Authenticated write kids_responsaveis"  ON public.kids_responsaveis;
DROP POLICY IF EXISTS "Authenticated update kids_responsaveis" ON public.kids_responsaveis;
DROP POLICY IF EXISTS "Authenticated delete kids_responsaveis" ON public.kids_responsaveis;
DROP POLICY IF EXISTS kids_responsaveis_read     ON public.kids_responsaveis;
DROP POLICY IF EXISTS kids_responsaveis_select   ON public.kids_responsaveis;
DROP POLICY IF EXISTS kids_responsaveis_insert   ON public.kids_responsaveis;
DROP POLICY IF EXISTS kids_responsaveis_update   ON public.kids_responsaveis;
DROP POLICY IF EXISTS kids_responsaveis_delete   ON public.kids_responsaveis;
DROP POLICY IF EXISTS kids_responsaveis_service  ON public.kids_responsaveis;

CREATE POLICY kids_responsaveis_select ON public.kids_responsaveis
  FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('kids') >= 1
  );

CREATE POLICY kids_responsaveis_insert ON public.kids_responsaveis
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);

CREATE POLICY kids_responsaveis_update ON public.kids_responsaveis
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

CREATE POLICY kids_responsaveis_delete ON public.kids_responsaveis
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY kids_responsaveis_service ON public.kids_responsaveis
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 7 · LOCKDOWN · kids_checkins
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read kids_checkins"   ON public.kids_checkins;
DROP POLICY IF EXISTS "Authenticated write kids_checkins"  ON public.kids_checkins;
DROP POLICY IF EXISTS "Authenticated update kids_checkins" ON public.kids_checkins;
DROP POLICY IF EXISTS "Authenticated delete kids_checkins" ON public.kids_checkins;
DROP POLICY IF EXISTS kids_checkins_read     ON public.kids_checkins;
DROP POLICY IF EXISTS kids_checkins_select   ON public.kids_checkins;
DROP POLICY IF EXISTS kids_checkins_insert   ON public.kids_checkins;
DROP POLICY IF EXISTS kids_checkins_update   ON public.kids_checkins;
DROP POLICY IF EXISTS kids_checkins_delete   ON public.kids_checkins;
DROP POLICY IF EXISTS kids_checkins_service  ON public.kids_checkins;

-- READ: responsável da criança OR cargo Kids nivel >= 1
CREATE POLICY kids_checkins_select ON public.kids_checkins
  FOR SELECT TO authenticated
  USING (
    public.user_is_kids_responsavel(crianca_id)
    OR public.current_user_module_level('kids') >= 1
  );

-- INSERT: cargo Kids nivel >= 2 (preencher dado · voluntários Kids podem)
CREATE POLICY kids_checkins_insert ON public.kids_checkins
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 2);

-- UPDATE: cargo Kids nivel >= 3 (override de checkout requer maior nivel)
CREATE POLICY kids_checkins_update ON public.kids_checkins
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

-- DELETE: SO super-admin
CREATE POLICY kids_checkins_delete ON public.kids_checkins
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY kids_checkins_service ON public.kids_checkins
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 8 · LOCKDOWN · kids_sessoes / kids_salas / kids_estacoes
-- (Operacional · sem PII direta, mas só Kids opera)
-- =====================================================================
-- kids_sessoes
DROP POLICY IF EXISTS "Authenticated read kids_sessoes"   ON public.kids_sessoes;
DROP POLICY IF EXISTS "Authenticated write kids_sessoes"  ON public.kids_sessoes;
DROP POLICY IF EXISTS "Authenticated update kids_sessoes" ON public.kids_sessoes;
DROP POLICY IF EXISTS "Authenticated delete kids_sessoes" ON public.kids_sessoes;
DROP POLICY IF EXISTS kids_sessoes_read     ON public.kids_sessoes;
DROP POLICY IF EXISTS kids_sessoes_select   ON public.kids_sessoes;
DROP POLICY IF EXISTS kids_sessoes_write    ON public.kids_sessoes;
DROP POLICY IF EXISTS kids_sessoes_service  ON public.kids_sessoes;

CREATE POLICY kids_sessoes_select ON public.kids_sessoes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1);

CREATE POLICY kids_sessoes_write ON public.kids_sessoes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);

CREATE POLICY kids_sessoes_update ON public.kids_sessoes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

CREATE POLICY kids_sessoes_delete ON public.kids_sessoes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY kids_sessoes_service ON public.kids_sessoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- kids_salas
DROP POLICY IF EXISTS "Authenticated read kids_salas"   ON public.kids_salas;
DROP POLICY IF EXISTS "Authenticated write kids_salas"  ON public.kids_salas;
DROP POLICY IF EXISTS "Authenticated update kids_salas" ON public.kids_salas;
DROP POLICY IF EXISTS "Authenticated delete kids_salas" ON public.kids_salas;
DROP POLICY IF EXISTS kids_salas_read     ON public.kids_salas;
DROP POLICY IF EXISTS kids_salas_select   ON public.kids_salas;
DROP POLICY IF EXISTS kids_salas_write    ON public.kids_salas;
DROP POLICY IF EXISTS kids_salas_update   ON public.kids_salas;
DROP POLICY IF EXISTS kids_salas_delete   ON public.kids_salas;
DROP POLICY IF EXISTS kids_salas_service  ON public.kids_salas;

CREATE POLICY kids_salas_select ON public.kids_salas
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1);

CREATE POLICY kids_salas_write ON public.kids_salas
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 5);

CREATE POLICY kids_salas_update ON public.kids_salas
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 5)
  WITH CHECK (public.current_user_module_level('kids') >= 5);

CREATE POLICY kids_salas_delete ON public.kids_salas
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY kids_salas_service ON public.kids_salas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- kids_estacoes
DROP POLICY IF EXISTS "Authenticated read kids_estacoes"   ON public.kids_estacoes;
DROP POLICY IF EXISTS "Authenticated write kids_estacoes"  ON public.kids_estacoes;
DROP POLICY IF EXISTS "Authenticated update kids_estacoes" ON public.kids_estacoes;
DROP POLICY IF EXISTS "Authenticated delete kids_estacoes" ON public.kids_estacoes;
DROP POLICY IF EXISTS kids_estacoes_read     ON public.kids_estacoes;
DROP POLICY IF EXISTS kids_estacoes_select   ON public.kids_estacoes;
DROP POLICY IF EXISTS kids_estacoes_write    ON public.kids_estacoes;
DROP POLICY IF EXISTS kids_estacoes_update   ON public.kids_estacoes;
DROP POLICY IF EXISTS kids_estacoes_delete   ON public.kids_estacoes;
DROP POLICY IF EXISTS kids_estacoes_service  ON public.kids_estacoes;

CREATE POLICY kids_estacoes_select ON public.kids_estacoes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1);

CREATE POLICY kids_estacoes_write ON public.kids_estacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 5);

CREATE POLICY kids_estacoes_update ON public.kids_estacoes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 5)
  WITH CHECK (public.current_user_module_level('kids') >= 5);

CREATE POLICY kids_estacoes_delete ON public.kids_estacoes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY kids_estacoes_service ON public.kids_estacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 9 · LOCKDOWN · kids_etiquetas_log (audit log)
-- READ: cargo Kids nivel >= 3 (admin/coord) OR super-admin
-- INSERT: cargo Kids nivel >= 1 (qualquer Kids registra impressão)
-- UPDATE/DELETE: NUNCA (audit log imutável · só super-admin desfaz)
-- =====================================================================
DROP POLICY IF EXISTS "Authenticated read kids_etiquetas_log"   ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS "Authenticated write kids_etiquetas_log"  ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS "Authenticated update kids_etiquetas_log" ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS "Authenticated delete kids_etiquetas_log" ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS kids_etiquetas_log_read     ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS kids_etiquetas_log_select   ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS kids_etiquetas_log_insert   ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS kids_etiquetas_log_update   ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS kids_etiquetas_log_delete   ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS kids_etiquetas_log_service  ON public.kids_etiquetas_log;

CREATE POLICY kids_etiquetas_log_select ON public.kids_etiquetas_log
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 3);

CREATE POLICY kids_etiquetas_log_insert ON public.kids_etiquetas_log
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 1);

-- Audit log imutavel · UPDATE/DELETE só super-admin
CREATE POLICY kids_etiquetas_log_update ON public.kids_etiquetas_log
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY kids_etiquetas_log_delete ON public.kids_etiquetas_log
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY kids_etiquetas_log_service ON public.kids_etiquetas_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================
-- ETAPA 10 · Comentários documentando policies
-- =====================================================================
COMMENT ON TABLE public.kids_criancas IS
  'Dados de crianças (menores LGPD). RLS: responsável (kids_responsaveis) lê só os filhos; cargo Kids nivel 1+ lê tudo; nivel 3+ escreve; super-admin deleta. Backend (service_role) bypassa.';

COMMENT ON TABLE public.kids_responsaveis IS
  'Vínculo M:N criança × responsável (mem_membros). RLS: responsável vê só os próprios; cargo Kids nivel 1+ vê tudo; 3+ escreve. Delete via super-admin (LGPD).';

COMMENT ON TABLE public.kids_checkins IS
  'Check-in/checkout de criança (LGPD · código de segurança + telefone responsável). RLS: responsável vê só da criança; cargo Kids 1+ vê tudo, 2+ preenche, 3+ edita.';

COMMENT ON TABLE public.kids_etiquetas_log IS
  'Audit log de impressões de etiqueta. RLS: imutável (UPDATE/DELETE só super-admin). Cargo Kids 1+ insere, 3+ lê.';

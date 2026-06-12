-- ============================================================================
-- Produção de Culto · Fundação (Fase 1)
--
-- Marcos: criar uma aba para a área de Produção de Culto com (A) KPIs
-- específicos preenchidos POR CULTO (espelhando a aba de Integração) e (B)
-- os KPIs gerais que já existem (SLA de solicitações + NPS interno).
--
-- DECISÕES (2026-06-02):
-- - Ocorrências: log unificado (tipo técnica/estrutura · descrição = rastro
--   · severidade) em vez de 2 campos soltos.
-- - Checklist: itemizado (template editável + marcação por culto) · "% executado".
-- - Pontualidade: duração-alvo 60 min (configurável por tipo) · observação
--   SEMPRE opcional (nunca bloqueia o salvar, mesmo passando do tempo).
-- - KPIs por culto são ESPECÍFICOS: aparecem no painel da área, mas NÃO entram
--   na cascata de OKR (objetivo_geral_id NULL · is_okr false) nem na matriz
--   NSM (valores '{}'). Separados de ADM-C-*-PRODUCAO (SLA/NPS, que cascateiam).
--
-- ADITIVA · idempotente. Reaproveita a tabela `cultos` (satélite 1:1 por
-- culto_id) · NUNCA duplica a lista de cultos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Módulo `producao` no catálogo + matriz default (copiada de `kids`)
--    (padrão documentado no CLAUDE.md · read universal nível 1; titular
--     vira admin nível 5 via AREA_MODULO_BOOST da área "Produção")
-- ----------------------------------------------------------------------------
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'producao', 'Produção de Culto', '/producao', 'ministerial', 395,
       'KPIs técnicos por culto (falhas, estabilidade, pontualidade, checklist) + SLA e NPS da Produção',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'producao');

DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'kids';
  IF base_modulo_id IS NULL THEN
    RAISE NOTICE 'Módulo base kids não encontrado · matriz de producao não seedada';
  ELSE
    INSERT INTO public.cargo_modulo_permissao
      (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
      CROSS JOIN public.modulos novo
     WHERE cmp.modulo_id = base_modulo_id
       AND novo.slug = 'producao'
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Duração-alvo por tipo de culto (pontualidade) · default 60 min
-- ----------------------------------------------------------------------------
ALTER TABLE public.vol_service_types
  ADD COLUMN IF NOT EXISTS meta_duracao_min integer NOT NULL DEFAULT 60;

-- ----------------------------------------------------------------------------
-- 3. Satélite 1:1 do culto · dados de produção (duração + meta)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.culto_producao (
  culto_id            uuid PRIMARY KEY REFERENCES public.cultos(id) ON DELETE CASCADE,
  duracao_minutos     integer CHECK (duracao_minutos IS NULL OR duracao_minutos >= 0),
  pontualidade_obs    text,                 -- opcional, mesmo passando do alvo
  observacoes         text,
  preenchido_por      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  preenchido_em       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. Log de ocorrências por culto (falhas técnicas + estabilidade estrutura)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.culto_producao_ocorrencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id        uuid NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('tecnica', 'estrutura')),
  descricao       text NOT NULL,            -- o rastro
  severidade      text NOT NULL DEFAULT 'media'
                    CHECK (severidade IN ('baixa', 'media', 'alta', 'critica')),
  momento         text,                     -- ex: "pré-culto", "louvor", "pregação"
  registrado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_culto_prod_ocorr_culto
  ON public.culto_producao_ocorrencias (culto_id);
CREATE INDEX IF NOT EXISTS idx_culto_prod_ocorr_tipo
  ON public.culto_producao_ocorrencias (tipo, created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. Template do checklist técnico (aba admin · catálogo · usa `ativo`)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.producao_checklist_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          text NOT NULL,
  descricao       text,
  -- NULL = vale pra todos os tipos de culto; senão, específico de um tipo
  service_type_id uuid REFERENCES public.vol_service_types(id) ON DELETE CASCADE,
  ordem           integer NOT NULL DEFAULT 0,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prod_checklist_itens_ativo
  ON public.producao_checklist_itens (ativo, ordem);

-- ----------------------------------------------------------------------------
-- 6. Marcação do checklist por culto (deriva o "% executado")
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.culto_producao_checklist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id    uuid NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  item_id     uuid NOT NULL REFERENCES public.producao_checklist_itens(id) ON DELETE CASCADE,
  feito       boolean NOT NULL DEFAULT false,
  observacao  text,
  marcado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  marcado_em  timestamptz,
  UNIQUE (culto_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_culto_prod_checklist_culto
  ON public.culto_producao_checklist (culto_id);

-- ----------------------------------------------------------------------------
-- 7. RLS · leitura nível 1 / escrita nível 2 (preencher) / template nível 3
--    (não há PII · gate por nível do módulo `producao` + service_role bypass)
-- ----------------------------------------------------------------------------
ALTER TABLE public.culto_producao              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culto_producao_ocorrencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producao_checklist_itens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culto_producao_checklist    ENABLE ROW LEVEL SECURITY;

-- culto_producao
DROP POLICY IF EXISTS culto_producao_select ON public.culto_producao;
CREATE POLICY culto_producao_select ON public.culto_producao
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('producao') >= 1);
DROP POLICY IF EXISTS culto_producao_write ON public.culto_producao;
CREATE POLICY culto_producao_write ON public.culto_producao
  FOR ALL TO authenticated
  USING (public.current_user_module_level('producao') >= 2)
  WITH CHECK (public.current_user_module_level('producao') >= 2);
DROP POLICY IF EXISTS culto_producao_service ON public.culto_producao;
CREATE POLICY culto_producao_service ON public.culto_producao
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- culto_producao_ocorrencias
DROP POLICY IF EXISTS culto_prod_ocorr_select ON public.culto_producao_ocorrencias;
CREATE POLICY culto_prod_ocorr_select ON public.culto_producao_ocorrencias
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('producao') >= 1);
DROP POLICY IF EXISTS culto_prod_ocorr_write ON public.culto_producao_ocorrencias;
CREATE POLICY culto_prod_ocorr_write ON public.culto_producao_ocorrencias
  FOR ALL TO authenticated
  USING (public.current_user_module_level('producao') >= 2)
  WITH CHECK (public.current_user_module_level('producao') >= 2);
DROP POLICY IF EXISTS culto_prod_ocorr_service ON public.culto_producao_ocorrencias;
CREATE POLICY culto_prod_ocorr_service ON public.culto_producao_ocorrencias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- producao_checklist_itens (template · ler nível 1, editar nível 3)
DROP POLICY IF EXISTS prod_checklist_itens_select ON public.producao_checklist_itens;
CREATE POLICY prod_checklist_itens_select ON public.producao_checklist_itens
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('producao') >= 1);
DROP POLICY IF EXISTS prod_checklist_itens_write ON public.producao_checklist_itens;
CREATE POLICY prod_checklist_itens_write ON public.producao_checklist_itens
  FOR ALL TO authenticated
  USING (public.current_user_module_level('producao') >= 3)
  WITH CHECK (public.current_user_module_level('producao') >= 3);
DROP POLICY IF EXISTS prod_checklist_itens_service ON public.producao_checklist_itens;
CREATE POLICY prod_checklist_itens_service ON public.producao_checklist_itens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- culto_producao_checklist (marcação)
DROP POLICY IF EXISTS culto_prod_checklist_select ON public.culto_producao_checklist;
CREATE POLICY culto_prod_checklist_select ON public.culto_producao_checklist
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('producao') >= 1);
DROP POLICY IF EXISTS culto_prod_checklist_write ON public.culto_producao_checklist;
CREATE POLICY culto_prod_checklist_write ON public.culto_producao_checklist
  FOR ALL TO authenticated
  USING (public.current_user_module_level('producao') >= 2)
  WITH CHECK (public.current_user_module_level('producao') >= 2);
DROP POLICY IF EXISTS culto_prod_checklist_service ON public.culto_producao_checklist;
CREATE POLICY culto_prod_checklist_service ON public.culto_producao_checklist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 8. KPIs ESPECÍFICOS da Produção (NÃO cascateiam)
--    is_okr=false · valores='{}' (fora da matriz NSM) · objetivo_geral_id NULL
--    (fora da cascata OKR) · tipo_calculo='manual' (view lê de kpi_registros,
--    onde o trigger SQL grava o valor auto) · fonte_auto='producao.*'
-- ----------------------------------------------------------------------------
INSERT INTO public.kpi_indicadores_taticos (
  id, indicador, descricao, area, valores, periodicidade,
  meta_descricao, meta_valor, unidade, is_okr, ativo,
  objetivo_geral_id, tipo_kpi, tipo_calculo, fonte_auto
) VALUES
  ('PROD-CULTO-PONTUAL', '% cultos no horário · Produção',
   'Cultos cuja duração ficou dentro da meta (60 min ou meta do tipo de culto)',
   'producao', ARRAY[]::text[], 'mensal', '>=90%', 90, '%', false, true,
   NULL, 'operacional', 'manual', 'producao.pontualidade_pct'),
  ('PROD-CULTO-CHECKLIST', '% checklist técnico executado · Produção',
   'Itens de checklist técnico marcados como feitos sobre o total previsto',
   'producao', ARRAY[]::text[], 'mensal', '>=95%', 95, '%', false, true,
   NULL, 'operacional', 'manual', 'producao.checklist_pct'),
  ('PROD-CULTO-FALHAS', 'Falhas técnicas · Produção',
   'Número de ocorrências técnicas registradas nos cultos do mês',
   'producao', ARRAY[]::text[], 'mensal', '<=3', 3, 'ocorrências', false, true,
   NULL, 'operacional', 'manual', 'producao.falhas_total'),
  ('PROD-CULTO-ESTAB', 'Ocorrências de estrutura · Produção',
   'Número de ocorrências de instabilidade de estrutura nos cultos do mês',
   'producao', ARRAY[]::text[], 'mensal', '<=2', 2, 'ocorrências', false, true,
   NULL, 'operacional', 'manual', 'producao.estrutura_total')
ON CONFLICT (id) DO UPDATE SET
  indicador      = EXCLUDED.indicador,
  descricao      = EXCLUDED.descricao,
  area           = EXCLUDED.area,
  periodicidade  = EXCLUDED.periodicidade,
  meta_descricao = EXCLUDED.meta_descricao,
  meta_valor     = EXCLUDED.meta_valor,
  unidade        = EXCLUDED.unidade,
  is_okr         = false,
  objetivo_geral_id = NULL,
  fonte_auto     = EXCLUDED.fonte_auto,
  ativo          = true;

-- ----------------------------------------------------------------------------
-- 9. Estende o motor de cálculo auto (kpi_calcular_valor_auto) com producao.*
--    Recriação completa do CASE · mantém TODOS os ramos cultos/batismos
--    existentes e adiciona os 4 ramos de producao.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_calcular_valor_auto(
  p_fonte text, p_inicio date, p_fim date
) RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE v integer;
BEGIN
  CASE p_fonte
    -- Cultos · AMI
    WHEN 'cultos.ami_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'ami' AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.ami_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'ami' AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Bridge
    WHEN 'cultos.bridge_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'bridge' AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.bridge_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) = 'bridge' AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Sede (Domingos + Quarta com Deus)
    WHEN 'cultos.sede_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE (LOWER(vst.name) LIKE 'domingo%' OR LOWER(vst.name) = 'quarta com deus')
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.sede_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE (LOWER(vst.name) LIKE 'domingo%' OR LOWER(vst.name) = 'quarta com deus')
         AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Kids
    WHEN 'cultos.kids_freq' THEN
      SELECT COALESCE(SUM(c.presencial_kids), 0)::int INTO v
        FROM public.cultos c
       WHERE c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · Online
    WHEN 'cultos.online_freq' THEN
      SELECT COALESCE(SUM(c.online_pico), 0)::int INTO v
        FROM public.cultos c
       WHERE c.online_pico IS NOT NULL AND c.online_pico > 0
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_online), 0)::int INTO v
        FROM public.cultos c
       WHERE c.decisoes_online IS NOT NULL
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_pico_avg' THEN
      SELECT COALESCE(ROUND(AVG(c.online_pico))::int, 0) INTO v
        FROM public.cultos c
       WHERE c.online_pico IS NOT NULL AND c.online_pico > 0
         AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_ds_total' THEN
      SELECT COALESCE(SUM(c.online_ds), 0)::int INTO v
        FROM public.cultos c
       WHERE c.online_ds IS NOT NULL AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.online_ddus_total' THEN
      SELECT COALESCE(SUM(c.online_ddus), 0)::int INTO v
        FROM public.cultos c
       WHERE c.online_ddus IS NOT NULL AND c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · conversoes globais (legado)
    WHEN 'cultos.conv_visit' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
       WHERE c.data >= p_inicio AND c.data < p_fim;

    -- Cultos · AMI+Bridge (DEPRECATED)
    WHEN 'cultos.amibridge_freq' THEN
      SELECT COALESCE(SUM(c.presencial_adulto), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) IN ('ami', 'bridge') AND c.data >= p_inicio AND c.data < p_fim;
    WHEN 'cultos.amibridge_conv' THEN
      SELECT COALESCE(SUM(c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)), 0)::int INTO v
        FROM public.cultos c
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE LOWER(vst.name) IN ('ami', 'bridge') AND c.data >= p_inicio AND c.data < p_fim;

    -- Batismos por area
    WHEN 'batismos.kids' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'kids'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.sede' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'sede'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.bridge' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'bridge'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.ami' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'ami'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;
    WHEN 'batismos.online' THEN
      SELECT COUNT(*)::int INTO v FROM public.batismo_inscricoes
       WHERE status = 'realizado' AND area_kpi = 'online'
         AND COALESCE(data_batismo, created_at::date) >= p_inicio
         AND COALESCE(data_batismo, created_at::date) <  p_fim;

    -- ===== Produção de Culto (novo) ============================================
    -- % de cultos preenchidos cuja duração <= meta (do tipo · default 60)
    WHEN 'producao.pontualidade_pct' THEN
      SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                  ELSE ROUND(100.0 * SUM(
                         CASE WHEN cp.duracao_minutos <=
                                   COALESCE(vst.meta_duracao_min, 60)
                              THEN 1 ELSE 0 END
                       ) / COUNT(*))::int END INTO v
        FROM public.culto_producao cp
        JOIN public.cultos c ON c.id = cp.culto_id
        LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
       WHERE cp.duracao_minutos IS NOT NULL
         AND c.data >= p_inicio AND c.data < p_fim;

    -- % de itens de checklist marcados como feitos sobre o total previsto
    WHEN 'producao.checklist_pct' THEN
      SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                  ELSE ROUND(100.0 * SUM(CASE WHEN cpc.feito THEN 1 ELSE 0 END)
                                    / COUNT(*))::int END INTO v
        FROM public.culto_producao_checklist cpc
        JOIN public.cultos c ON c.id = cpc.culto_id
       WHERE c.data >= p_inicio AND c.data < p_fim;

    -- nº de ocorrências técnicas no período
    WHEN 'producao.falhas_total' THEN
      SELECT COUNT(*)::int INTO v
        FROM public.culto_producao_ocorrencias o
        JOIN public.cultos c ON c.id = o.culto_id
       WHERE o.tipo = 'tecnica'
         AND c.data >= p_inicio AND c.data < p_fim;

    -- nº de ocorrências de estrutura no período
    WHEN 'producao.estrutura_total' THEN
      SELECT COUNT(*)::int INTO v
        FROM public.culto_producao_ocorrencias o
        JOIN public.cultos c ON c.id = o.culto_id
       WHERE o.tipo = 'estrutura'
         AND c.data >= p_inicio AND c.data < p_fim;

    ELSE
      v := NULL;
  END CASE;
  RETURN v;
END $$;

-- ----------------------------------------------------------------------------
-- 10. kpi_recalcular_para_data passa a cobrir também fonte_auto producao.*
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_recalcular_para_data(p_data date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  k record;
  v_periodo text;
  v_range   record;
  v_valor   integer;
BEGIN
  IF p_data IS NULL THEN RETURN; END IF;

  FOR k IN
    SELECT id, fonte_auto, periodicidade
      FROM public.kpi_indicadores_taticos
     WHERE ativo = true
       AND (fonte_auto LIKE 'cultos.%'
            OR fonte_auto LIKE 'batismos.%'
            OR fonte_auto LIKE 'producao.%')
  LOOP
    v_periodo := kpi_periodo_da_data(p_data, k.periodicidade);
    SELECT inicio, fim INTO v_range FROM kpi_periodo_range(v_periodo, k.periodicidade);
    v_valor   := kpi_calcular_valor_auto(k.fonte_auto, v_range.inicio, v_range.fim);
    IF v_valor IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.kpi_registros
      (indicador_id, periodo_referencia, valor_realizado, origem, responsavel, data_preenchimento, updated_at)
    VALUES
      (k.id, v_periodo, v_valor, 'auto', 'sistema', now(), now())
    ON CONFLICT (indicador_id, periodo_referencia) DO UPDATE
      SET valor_realizado = EXCLUDED.valor_realizado,
          origem          = 'auto',
          data_preenchimento = now(),
          updated_at      = now()
      WHERE kpi_registros.origem IS NULL OR kpi_registros.origem = 'auto';
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 11. Triggers · recalculam os KPIs de produção quando o satélite muda
--     (resolvem a data do culto via lookup · AFTER ROW como em cultos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_kpi_recalcular_producao()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_culto_id uuid;
  v_data     date;
BEGIN
  v_culto_id := COALESCE(NEW.culto_id, OLD.culto_id);
  SELECT data INTO v_data FROM public.cultos WHERE id = v_culto_id;
  IF v_data IS NOT NULL THEN
    PERFORM public.kpi_recalcular_para_data(v_data);
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS culto_producao_recalc_kpis ON public.culto_producao;
CREATE TRIGGER culto_producao_recalc_kpis
  AFTER INSERT OR UPDATE OR DELETE ON public.culto_producao
  FOR EACH ROW EXECUTE FUNCTION public.trg_kpi_recalcular_producao();

DROP TRIGGER IF EXISTS culto_prod_ocorr_recalc_kpis ON public.culto_producao_ocorrencias;
CREATE TRIGGER culto_prod_ocorr_recalc_kpis
  AFTER INSERT OR UPDATE OR DELETE ON public.culto_producao_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.trg_kpi_recalcular_producao();

DROP TRIGGER IF EXISTS culto_prod_checklist_recalc_kpis ON public.culto_producao_checklist;
CREATE TRIGGER culto_prod_checklist_recalc_kpis
  AFTER INSERT OR UPDATE OR DELETE ON public.culto_producao_checklist
  FOR EACH ROW EXECUTE FUNCTION public.trg_kpi_recalcular_producao();

-- ----------------------------------------------------------------------------
-- 12. Seed inicial do checklist técnico (genérico · service_type_id NULL)
--     Pedro/equipe edita depois pela aba Checklists.
-- ----------------------------------------------------------------------------
INSERT INTO public.producao_checklist_itens (titulo, descricao, ordem, ativo)
SELECT * FROM (VALUES
  ('Áudio testado (mesa + retornos)', 'Passagem de som e monitores conferidos', 1, true),
  ('Transmissão online no ar',        'Stream iniciado e estável antes do início', 2, true),
  ('Projeção / telão funcionando',    'Slides, letras e vídeos carregados', 3, true),
  ('Iluminação configurada',          'Cenas de luz prontas para a liturgia', 4, true),
  ('Gravação iniciada',               'Captação de vídeo/áudio para registro', 5, true),
  ('Energia / no-break conferidos',   'Estrutura elétrica e contingência checadas', 6, true)
) AS t(titulo, descricao, ordem, ativo)
WHERE NOT EXISTS (SELECT 1 FROM public.producao_checklist_itens);

-- ----------------------------------------------------------------------------
-- Conferência (descomenta no Studio):
--   SELECT id FROM modulos WHERE slug='producao';
--   SELECT id, indicador, area, is_okr, valores, objetivo_geral_id
--     FROM kpi_indicadores_taticos WHERE id LIKE 'PROD-CULTO-%';
--   -- Espera: 4 KPIs · is_okr=false · valores='{}' · objetivo_geral_id NULL
--
-- PÓS-MIGRATION (manual · Marcos):
--   1) Atribuir a área "Produção" ao Pedro Fernandes em /admin/permissoes
--      (aba Usuários) → boost dá nível 5 no módulo producao.
--   2) POST /api/permissoes/cache/bust (ou botão em /admin/permissoes).
--   3) Pedro faz logout/login pra renovar o JWT.
-- ============================================================================

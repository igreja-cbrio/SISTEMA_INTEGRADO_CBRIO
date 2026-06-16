-- ============================================================================
-- Produção de Culto · Cronograma por etapas (momentos do culto)
--
-- Marcos (2026-06-16): a equipe de Produção controla o tempo do culto POR
-- MOMENTO (Música 1, Música 2, … Pregação, Apelo, Pós-Culto), com Previsto ×
-- Executado em mm:ss, e a SOMA dos executados é o tempo total do culto — como
-- na planilha "Cronograma Culto". Trocar o campo único de "duração (min)" por
-- esse roteiro de etapas e enriquecer a análise (previsto × executado · estouro
-- por etapa).
--
-- DECISÕES (2026-06-16):
-- - Tempo em SEGUNDOS (mm:ss) · a precisão importa (Pregação 30:00 vs 36:19).
-- - "Previsto" vem de um ROTEIRO padrão por tipo de culto (template editável,
--   espelha o padrão do checklist) · "Executado" a equipe preenche no culto.
-- - Pós-culto é uma SEÇÃO à parte (a planilha separa "TEMPO DE CULTO" de
--   "TOTAL + PÓS CULTO") · a pontualidade conta só a seção 'culto'.
-- - A `culto_producao.duracao_minutos` continua sendo o TOTAL (agora derivado
--   da soma dos executados da seção 'culto'), escrito pelo backend → o KPI
--   PROD-CULTO-PONTUAL e o trigger de recálculo seguem FUNCIONANDO SEM MUDANÇA.
-- - NÃO mexe em `kpi_calcular_valor_auto` (preserva ramos novos do funil) · a
--   análise previsto×executado / estouro por etapa é computada nos endpoints.
--
-- ADITIVA · idempotente. Reaproveita `cultos` (satélite por culto_id).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Roteiro padrão (cronograma) por tipo de culto · "Previsto" de cada etapa
--    service_type_id NULL = roteiro geral (vale pra qualquer tipo sem roteiro
--    próprio). Editável na aba admin (nível 3), igual ao template do checklist.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.producao_roteiro_etapas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id uuid REFERENCES public.vol_service_types(id) ON DELETE CASCADE,
  ordem           integer NOT NULL DEFAULT 0,
  titulo          text NOT NULL,
  previsto_seg    integer NOT NULL DEFAULT 0 CHECK (previsto_seg >= 0),
  secao           text NOT NULL DEFAULT 'culto'
                    CHECK (secao IN ('culto', 'pos_culto')),
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prod_roteiro_etapas_tipo
  ON public.producao_roteiro_etapas (service_type_id, ordem) WHERE ativo;

-- ----------------------------------------------------------------------------
-- 2. Etapas executadas POR CULTO (Item · Etapa · Previsto · Executado · Obs)
--    Ad-hoc por culto: nasce pré-carregada do roteiro, mas a equipe pode
--    adicionar/remover/ajustar (ex.: "Apresentação de Criança" no culto das 10h).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.culto_producao_etapas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id      uuid NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  ordem         integer NOT NULL DEFAULT 0,
  titulo        text NOT NULL,
  previsto_seg  integer CHECK (previsto_seg IS NULL OR previsto_seg >= 0),
  executado_seg integer CHECK (executado_seg IS NULL OR executado_seg >= 0),
  observacao    text,
  secao         text NOT NULL DEFAULT 'culto'
                  CHECK (secao IN ('culto', 'pos_culto')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_culto_prod_etapas_culto
  ON public.culto_producao_etapas (culto_id, ordem);

-- ----------------------------------------------------------------------------
-- 3. Totais derivados no satélite (escritos pelo backend ao salvar as etapas).
--    duracao_minutos (já existente) continua = total executado da seção 'culto'
--    arredondado → KPI/trigger/calendário intactos. Os _seg dão a precisão
--    mm:ss e o previsto pra análise de aderência ao roteiro.
-- ----------------------------------------------------------------------------
ALTER TABLE public.culto_producao
  ADD COLUMN IF NOT EXISTS duracao_segundos       integer
    CHECK (duracao_segundos IS NULL OR duracao_segundos >= 0),
  ADD COLUMN IF NOT EXISTS duracao_prevista_seg   integer
    CHECK (duracao_prevista_seg IS NULL OR duracao_prevista_seg >= 0),
  ADD COLUMN IF NOT EXISTS pos_culto_segundos     integer
    CHECK (pos_culto_segundos IS NULL OR pos_culto_segundos >= 0),
  ADD COLUMN IF NOT EXISTS pos_culto_previsto_seg integer
    CHECK (pos_culto_previsto_seg IS NULL OR pos_culto_previsto_seg >= 0);

-- ----------------------------------------------------------------------------
-- 4. RLS · espelha as tabelas de produção (select≥1; etapas write≥2; roteiro
--    write≥3; service_role bypass). Sem PII.
-- ----------------------------------------------------------------------------
ALTER TABLE public.producao_roteiro_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culto_producao_etapas   ENABLE ROW LEVEL SECURITY;

-- roteiro (template · ler nível 1, editar nível 3)
DROP POLICY IF EXISTS prod_roteiro_etapas_select ON public.producao_roteiro_etapas;
CREATE POLICY prod_roteiro_etapas_select ON public.producao_roteiro_etapas
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('producao') >= 1);
DROP POLICY IF EXISTS prod_roteiro_etapas_write ON public.producao_roteiro_etapas;
CREATE POLICY prod_roteiro_etapas_write ON public.producao_roteiro_etapas
  FOR ALL TO authenticated
  USING (public.current_user_module_level('producao') >= 3)
  WITH CHECK (public.current_user_module_level('producao') >= 3);
DROP POLICY IF EXISTS prod_roteiro_etapas_service ON public.producao_roteiro_etapas;
CREATE POLICY prod_roteiro_etapas_service ON public.producao_roteiro_etapas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- etapas por culto (preencher · ler nível 1, editar nível 2)
DROP POLICY IF EXISTS culto_prod_etapas_select ON public.culto_producao_etapas;
CREATE POLICY culto_prod_etapas_select ON public.culto_producao_etapas
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('producao') >= 1);
DROP POLICY IF EXISTS culto_prod_etapas_write ON public.culto_producao_etapas;
CREATE POLICY culto_prod_etapas_write ON public.culto_producao_etapas
  FOR ALL TO authenticated
  USING (public.current_user_module_level('producao') >= 2)
  WITH CHECK (public.current_user_module_level('producao') >= 2);
DROP POLICY IF EXISTS culto_prod_etapas_service ON public.culto_producao_etapas;
CREATE POLICY culto_prod_etapas_service ON public.culto_producao_etapas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. Seed do roteiro geral (a partir da planilha "Cronograma Culto" · cultos de
--    domingo). service_type_id NULL = vale pra todos até a equipe criar um
--    roteiro por tipo. Soma da seção 'culto' = 3660s = 61:00 (= "TEMPO DE
--    CULTO" da planilha) · + Pós-Culto 180s = 64:00 ("TOTAL").
--    Só semeia se a tabela estiver vazia (idempotente).
-- ----------------------------------------------------------------------------
INSERT INTO public.producao_roteiro_etapas (service_type_id, ordem, titulo, previsto_seg, secao, ativo)
SELECT NULL, t.ordem, t.titulo, t.previsto_seg, t.secao, true
  FROM (VALUES
    (1,  'Música 1',            345,  'culto'),
    (2,  'Música 2',            404,  'culto'),
    (3,  'Música 3',            344,  'culto'),
    (4,  'Intercessão',          60,  'culto'),
    (5,  'Vídeo Pré-Pregação',  107,  'culto'),
    (6,  'Pregação',           1800,  'culto'),
    (7,  'Apelo',               300,  'culto'),
    (8,  'Dízimos e Ofertas',   180,  'culto'),
    (9,  'Avisos / Benção',     120,  'culto'),
    (10, 'Pós-Culto',           180,  'pos_culto')
  ) AS t(ordem, titulo, previsto_seg, secao)
WHERE NOT EXISTS (SELECT 1 FROM public.producao_roteiro_etapas);

-- ----------------------------------------------------------------------------
-- Conferência (descomenta no Studio):
--   SELECT secao, SUM(previsto_seg) FROM producao_roteiro_etapas
--    WHERE service_type_id IS NULL GROUP BY secao;  -- culto=3660, pos_culto=180
--
-- NÃO requer bust de cache nem mudança de permissão (módulo `producao` já
-- existe). Aplicar antes do merge — o backend chama as 2 tabelas novas.
-- ============================================================================

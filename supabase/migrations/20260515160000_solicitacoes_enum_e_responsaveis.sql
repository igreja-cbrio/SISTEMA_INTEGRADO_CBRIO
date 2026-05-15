-- ============================================================================
-- Solicitacoes · extensao do roteamento por area
--
-- 1. Conserta bug critico: backend ja mapeava categoria 'reserva_espaco' -> area
--    'reserva_espaco' mas o enum area_adm_resp nao tinha esse valor -> falhava
--    no INSERT silenciosamente.
-- 2. Adiciona area 'marketing' (Pedro Paiva eh lider · solicitacoes de design,
--    redes sociais, video, peca grafica).
-- 3. Cria tabela area_solicitacoes_responsaveis para roteamento por pessoa
--    (N:M area <-> profile). Solicitacao chega na fila da area + notifica
--    cada responsável cadastrado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Adiciona valores ao enum
--    OBS: em Postgres 12+ ADD VALUE roda em transacao, mas o valor nao pode
--    ser USADO ate commit. Por isso seeds de SLA vao em migration separada.
-- ----------------------------------------------------------------------------
ALTER TYPE public.area_adm_resp ADD VALUE IF NOT EXISTS 'reserva_espaco';
ALTER TYPE public.area_adm_resp ADD VALUE IF NOT EXISTS 'marketing';

-- ----------------------------------------------------------------------------
-- 2. Tabela: area_solicitacoes_responsaveis
--    Configurada via /admin/solicitacoes-config (lider/admin)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.area_solicitacoes_responsaveis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area        public.area_adm_resp NOT NULL,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (area, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_area_sol_resp_area    ON public.area_solicitacoes_responsaveis (area);
CREATE INDEX IF NOT EXISTS idx_area_sol_resp_profile ON public.area_solicitacoes_responsaveis (profile_id);

COMMENT ON TABLE public.area_solicitacoes_responsaveis IS
  'Quem eh responsavel por cada area de solicitacao. 1 pessoa pode ser responsavel por varias areas (N:M).';

-- RLS
ALTER TABLE public.area_solicitacoes_responsaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asr_service_role ON public.area_solicitacoes_responsaveis;
CREATE POLICY asr_service_role ON public.area_solicitacoes_responsaveis
  FOR ALL TO service_role USING (true);

-- Leitura aberta a qualquer autenticado (pra UI mostrar quem responde por que area)
DROP POLICY IF EXISTS asr_read ON public.area_solicitacoes_responsaveis;
CREATE POLICY asr_read ON public.area_solicitacoes_responsaveis
  FOR SELECT TO authenticated USING (true);

-- Escrita restrita a admin/diretor (config sensivel)
DROP POLICY IF EXISTS asr_admin_write ON public.area_solicitacoes_responsaveis;
CREATE POLICY asr_admin_write ON public.area_solicitacoes_responsaveis
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','diretor')));

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT enum_range(NULL::area_adm_resp);
--     -> deve incluir reserva_espaco e marketing
--   SELECT * FROM area_solicitacoes_responsaveis;  -- vazio inicialmente
-- ============================================================================

-- ============================================================================
-- Totem Kids · integracao com PAGERS (pulseira/coaster da familia) · 2026-06-02
-- ============================================================================
-- Marcos/Eduardo: integrar os pagers fisicos que a igreja ja usa (transmissor
-- LRS Freedom T7470 via rede RJ-45 · protocolo LRSN XML sobre TCP) ao fluxo de
-- pickup do Totem Kids. No check-in o voluntario entrega um pager numerado a
-- familia; no pickup (mesma chamada que aciona a TV da sala) o sistema enfileira
-- um "envio" que um AGENTE LOCAL na recepcao consome e dispara pro transmissor,
-- fazendo o pager da familia vibrar ("caso vibre, suba para ver sua crianca").
--
-- ADITIVA · nao muda comportamento existente (o backend liga os usos):
--   - kids_pagers           · catalogo de cada pager fisico (numero LRS + cor)
--   - kids_checkins.pager_id· qual pager a familia levou naquele check-in
--   - kids_pager_envios      · fila de saida que o agente local consome
--
-- Decisao de arquitetura: o agente local fala com o BACKEND (bearer token) e o
-- backend usa service_role · o PC da recepcao NAO carrega service_role key nem
-- abre porta de entrada. O agente so faz TCP de saida pro IP do transmissor.
-- ============================================================================

-- ─── 1. Catalogo de pagers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kids_pagers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  igreja_id        uuid REFERENCES public.igrejas(id)
                     DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  numero           int  NOT NULL,                 -- ID do pager no sistema LRS (ex: 21)
  rotulo           text,                          -- apelido livre (ex: "Pulseira 21")
  cor              text NOT NULL DEFAULT 'R'       -- caractere de cor LRS: R B G Y O P W
                     CHECK (cor ~ '^[RBGYOPW]{1,3}$'),
  tipo_lrs         int  NOT NULL DEFAULT 2,        -- 2 = LRS Guest pager (formato curto LRSN)
  responsavel_padrao_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  ativo            boolean NOT NULL DEFAULT true,
  observacao       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

-- 1 pager por numero por igreja (entre os nao deletados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_kids_pagers_numero
  ON public.kids_pagers (igreja_id, numero) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_pagers_ativos
  ON public.kids_pagers (id) WHERE deleted_at IS NULL AND ativo = true;

-- ─── 2. Vinculo do pager ao check-in ────────────────────────────────────────
ALTER TABLE public.kids_checkins
  ADD COLUMN IF NOT EXISTS pager_id uuid REFERENCES public.kids_pagers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_kids_checkins_pager
  ON public.kids_checkins (pager_id) WHERE pager_id IS NOT NULL AND checkout_at IS NULL;

-- ─── 3. Fila de saida (o agente local consome) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.kids_pager_envios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamada_id   uuid REFERENCES public.kids_chamadas(id) ON DELETE CASCADE,
  checkin_id   uuid REFERENCES public.kids_checkins(id) ON DELETE SET NULL,
  pager_id     uuid REFERENCES public.kids_pagers(id)   ON DELETE SET NULL,
  pager_numero int  NOT NULL,                     -- snapshot (sobrevive a edicao/delete do pager)
  cor          text NOT NULL DEFAULT 'R',
  tipo_lrs     int  NOT NULL DEFAULT 2,
  origem       text NOT NULL DEFAULT 'chamada'
                 CHECK (origem IN ('chamada','rechamada','teste','manual')),
  status       text NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente','enviado','erro','cancelado')),
  tentativas   int  NOT NULL DEFAULT 0,
  erro         text,
  criado_por   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  enviado_em   timestamptz
);

-- poll do agente: pega os pendentes mais antigos primeiro
CREATE INDEX IF NOT EXISTS idx_kids_pager_envios_pendentes
  ON public.kids_pager_envios (created_at) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_kids_pager_envios_checkin
  ON public.kids_pager_envios (checkin_id);

-- ─── 4. Cancela envios pendentes quando a crianca ja saiu (checkout) ─────────
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_cancela_pager()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.checkout_at IS NOT NULL AND OLD.checkout_at IS NULL THEN
    UPDATE public.kids_pager_envios
       SET status = 'cancelado'
     WHERE checkin_id = NEW.id AND status = 'pendente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kids_checkout_cancela_pager ON public.kids_checkins;
CREATE TRIGGER trg_kids_checkout_cancela_pager
  AFTER UPDATE OF checkout_at ON public.kids_checkins
  FOR EACH ROW EXECUTE FUNCTION public.fn_kids_checkout_cancela_pager();

-- updated_at automatico no catalogo (reusa o helper do modulo)
DROP TRIGGER IF EXISTS trg_kids_pagers_updated ON public.kids_pagers;
CREATE TRIGGER trg_kids_pagers_updated
  BEFORE UPDATE ON public.kids_pagers
  FOR EACH ROW EXECUTE FUNCTION public.fn_kids_set_updated_at();

-- ─── 5. Whitelist de soft-delete (acrescenta kids_pagers) ────────────────────
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'mem_membros','mem_familias','mem_grupos','mem_grupo_membros','mem_voluntarios',
    'mem_contribuicoes','mem_trilha_valores','mem_devocionais','mem_historico',
    'mem_grupo_encontros','mem_grupo_pedidos','cultos','cultos_decisoes_pessoas',
    'batismo_inscricoes','nsm_eventos','kids_criancas','kids_checkins','kids_sessoes',
    'cui_jornada180','cui_acompanhamentos','cui_convertidos','int_visitantes',
    'kpi_indicadores_taticos','kpi_metas','rh_funcionarios',
    'rh_documentos','pcs_progressoes','projects','solicitacoes','usuarios',
    -- Marketing (Spec 002 · 2026-05-28)
    'marketing_membros','marketing_kanban_cards','marketing_entregaveis',
    'marketing_capacidade_override','marketing_compromissos_recorrentes',
    -- Totem Kids pagers (2026-06-02)
    'kids_pagers'
  ]::TEXT[]
$$;

-- ─── 6. RLS contextual (mesmo padrao das tabelas kids · Onda 2 LGPD) ─────────
ALTER TABLE public.kids_pagers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kids_pager_envios ENABLE ROW LEVEL SECURITY;

-- kids_pagers · catalogo (read kids>=1 · write kids>=3 · delete super-admin)
DROP POLICY IF EXISTS kids_pagers_select  ON public.kids_pagers;
CREATE POLICY kids_pagers_select ON public.kids_pagers
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_pagers_insert  ON public.kids_pagers;
CREATE POLICY kids_pagers_insert ON public.kids_pagers
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);

DROP POLICY IF EXISTS kids_pagers_update  ON public.kids_pagers;
CREATE POLICY kids_pagers_update ON public.kids_pagers
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

DROP POLICY IF EXISTS kids_pagers_delete  ON public.kids_pagers;
CREATE POLICY kids_pagers_delete ON public.kids_pagers
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS kids_pagers_service ON public.kids_pagers;
CREATE POLICY kids_pagers_service ON public.kids_pagers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- kids_pager_envios · fila (read kids>=1 · write kids>=3 · delete super-admin ·
-- o agente local opera via backend/service_role)
DROP POLICY IF EXISTS kids_pager_envios_select  ON public.kids_pager_envios;
CREATE POLICY kids_pager_envios_select ON public.kids_pager_envios
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_pager_envios_insert  ON public.kids_pager_envios;
CREATE POLICY kids_pager_envios_insert ON public.kids_pager_envios
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);

DROP POLICY IF EXISTS kids_pager_envios_update  ON public.kids_pager_envios;
CREATE POLICY kids_pager_envios_update ON public.kids_pager_envios
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

DROP POLICY IF EXISTS kids_pager_envios_delete  ON public.kids_pager_envios;
CREATE POLICY kids_pager_envios_delete ON public.kids_pager_envios
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS kids_pager_envios_service ON public.kids_pager_envios;
CREATE POLICY kids_pager_envios_service ON public.kids_pager_envios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.kids_pagers IS
  'Catalogo de pagers fisicos do Totem Kids (numero LRS + cor). Integracao com transmissor LRS Freedom via agente local (2026-06-02).';
COMMENT ON TABLE public.kids_pager_envios IS
  'Fila de saida de chamadas de pager · consumida pelo agente local da recepcao (pager-bridge) que dispara via LRSN/TCP.';

-- ============================================================================
-- Governança · IA — memória acumulada + insumos (Fase C)   (2026-06-26)
-- ============================================================================
-- Liga a inteligência do ciclo: transcrição do Plaud (upload) + atas/
-- deliberações + dados vivos do sistema -> MEMÓRIA ACUMULADA por tema (1 doc
-- vivo por type×ano) + pauta da próxima reunião gerada por IA. Tudo markdown.
--
-- Aditiva · idempotente. Reusa RLS/soft-delete já existentes do módulo.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. governance_meeting_docs · tipos de IA + texto in-app + metadados.
--    'transcricao' = export do Plaud (insumo) · 'pauta_ia' = pauta gerada.
-- ----------------------------------------------------------------------------
ALTER TABLE public.governance_meeting_docs
  ADD COLUMN IF NOT EXISTS conteudo_md   text,
  ADD COLUMN IF NOT EXISTS gerado_por_ia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modelo        text,
  ADD COLUMN IF NOT EXISTS fonte_docs    uuid[];

ALTER TABLE public.governance_meeting_docs
  DROP CONSTRAINT IF EXISTS governance_meeting_docs_tipo_check;
ALTER TABLE public.governance_meeting_docs
  ADD CONSTRAINT governance_meeting_docs_tipo_check
  CHECK (tipo IN ('entrada','ata','apoio','transcricao','pauta_ia'));

-- ----------------------------------------------------------------------------
-- 2. governance_memoria · memória acumulada por tema × ano (markdown vivo).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_memoria (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id            uuid NOT NULL REFERENCES public.governance_meeting_types(id) ON DELETE CASCADE,
  ano                int NOT NULL,
  conteudo_md        text,
  modelo             text,
  sharepoint_path    text,
  sharepoint_item_id text,
  sharepoint_url     text,
  gerado_por         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  UNIQUE (type_id, ano)
);

CREATE INDEX IF NOT EXISTS idx_gov_memoria_tipo_ano
  ON public.governance_memoria (type_id, ano) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.governance_memoria IS
  'Memória acumulada do tema de governança (1 por tipo×ano) · markdown gerado por IA + .md no SharePoint';

-- ----------------------------------------------------------------------------
-- 3. RLS na governance_memoria (mesmo padrão do módulo · dado sensível).
-- ----------------------------------------------------------------------------
ALTER TABLE public.governance_memoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS governance_memoria_select ON public.governance_memoria;
CREATE POLICY governance_memoria_select ON public.governance_memoria
  FOR SELECT TO authenticated USING (public.current_user_module_level('governanca') >= 1);
DROP POLICY IF EXISTS governance_memoria_insert ON public.governance_memoria;
CREATE POLICY governance_memoria_insert ON public.governance_memoria
  FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level('governanca') >= 3);
DROP POLICY IF EXISTS governance_memoria_update ON public.governance_memoria;
CREATE POLICY governance_memoria_update ON public.governance_memoria
  FOR UPDATE TO authenticated USING (public.current_user_module_level('governanca') >= 3) WITH CHECK (public.current_user_module_level('governanca') >= 3);
DROP POLICY IF EXISTS governance_memoria_delete ON public.governance_memoria;
CREATE POLICY governance_memoria_delete ON public.governance_memoria
  FOR DELETE TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS governance_memoria_service ON public.governance_memoria;
CREATE POLICY governance_memoria_service ON public.governance_memoria
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. Whitelist soft-delete · anexa governance_memoria (não-destrutivo · lê a
--    lista viva e só acrescenta).
-- ----------------------------------------------------------------------------
DO $$
DECLARE cur text[] := public.app_soft_deletable_tables(); lit text;
BEGIN
  IF NOT ('governance_memoria' = ANY(cur)) THEN
    cur := array_append(cur, 'governance_memoria');
  END IF;
  SELECT string_agg(quote_literal(x), ',') INTO lit FROM unnest(cur) AS x;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT ARRAY[%s]::TEXT[] $f$', lit);
END $$;

COMMIT;

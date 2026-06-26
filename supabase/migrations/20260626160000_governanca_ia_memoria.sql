BEGIN;

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

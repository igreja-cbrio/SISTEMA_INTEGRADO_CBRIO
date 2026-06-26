-- ============================================================================
-- Governança · Fundação (F0) — RLS + anexos + matriz   (2026-06-26)
-- ============================================================================
-- Reviver o módulo Governança (ciclo de reuniões de diretoria · pedido do
-- Eduardo, via Marcos). O schema 20260424220000_governanca.sql já modela
-- ciclo -> reunião (pauta/ata/deliberações/participantes/quórum) -> tarefas
-- -> templates, MAS: (a) foi criado SEM RLS; (b) não tem anexo de documentos;
-- (c) a matriz seedou a diretoria como ADMIN (nível 5).
--
-- Esta migration (aditiva · idempotente):
--   1. Soft-delete em governance_meetings (atas são sensíveis · reversível).
--   2. Tabela nova governance_meeting_docs (documentos de entrada + atas,
--      guardados no SharePoint via Graph · supabase_path = fallback).
--   3. Whitelist soft-delete: ANEXA as 2 tabelas SEM reescrever a lista fixa
--      (lê a lista viva e só acrescenta) -> robusto ao drift git<->prod, que
--      já derrubou jornada_encaminhamentos/whatsapp_* numa migration anterior.
--   4. RLS contextual nas 5 tabelas governance_* + governance_meeting_docs
--      (current_user_module_level('governanca'): ler >=1 · editar >=3 ·
--       deletar só super-admin · service_role tudo).
--   5. Audit log em governance_meetings (ata/deliberações/pauta/status/del).
--   6. Matriz: rebaixa a diretoria de nível 5 -> 1 (LEITURA). Quem OPERA é o
--      super-admin (Marcos) + quem ganhar override. "Você opera, diretoria lê".
--
-- ⚠️ Pós-aplicação (obrigatório):
--    a) bust de cache de permissões (botão em /admin/permissoes OU
--       POST /api/permissoes/cache/bust);
--    b) a diretoria (Eduardo, Pedro Menezes, Arthur, Juninho, Pedrão e o
--       coordenador de estratégia) faz logout/login pra renovar o JWT.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Soft-delete em governance_meetings (reversível · ata é sensível)
-- ----------------------------------------------------------------------------
ALTER TABLE public.governance_meetings
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_gov_meetings_active
  ON public.governance_meetings (cycle_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. governance_meeting_docs · anexos da reunião
--    tipo: 'entrada' (documentos pra diretoria analisar ANTES) ·
--          'ata' (o registro final) · 'apoio' (material de suporte).
--    Reusa o pipeline SharePoint/Graph (storageService) · supabase_path
--    fica como fallback (mesmo padrão de event_task_attachments/marketing).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.governance_meeting_docs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id         uuid NOT NULL
                       REFERENCES public.governance_meetings(id) ON DELETE CASCADE,
  tipo               text NOT NULL DEFAULT 'entrada'
                       CHECK (tipo IN ('entrada','ata','apoio')),
  nome_arquivo       text NOT NULL,
  mime_type          text,
  tamanho_bytes      bigint,
  sharepoint_path    text,
  sharepoint_item_id text,
  sharepoint_url     text,
  supabase_path      text,
  enviado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_por_nome   text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_gov_meeting_docs_meeting
  ON public.governance_meeting_docs (meeting_id, tipo) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.governance_meeting_docs IS
  'Documentos da reunião de governança · entrada (pré-reunião) / ata / apoio · arquivo no SharePoint';

-- ----------------------------------------------------------------------------
-- 3. Whitelist soft-delete · ANEXA (não reescreve) as 2 tabelas novas.
--    Lê a lista viva de app_soft_deletable_tables() e só acrescenta o que
--    falta — robusto ao drift git<->prod (a 20260609120000 reescreveu a lista
--    com um base antigo e derrubou jornada_encaminhamentos/whatsapp_*).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  cur   text[] := public.app_soft_deletable_tables();
  novas text[] := ARRAY['governance_meetings','governance_meeting_docs'];
  t     text;
  lit   text;
BEGIN
  FOREACH t IN ARRAY novas LOOP
    IF NOT (t = ANY(cur)) THEN
      cur := array_append(cur, t);
    END IF;
  END LOOP;
  SELECT string_agg(quote_literal(x), ',') INTO lit FROM unnest(cur) AS x;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT ARRAY[%s]::TEXT[] $f$',
    lit
  );
END $$;

-- ----------------------------------------------------------------------------
-- 4. RLS contextual · 5 tabelas governance_* + governance_meeting_docs.
--    Acesso pelo módulo 'governanca' (matriz/override/super-admin):
--    ler >=1 · inserir/editar >=3 · deletar só super-admin · service_role tudo.
--    O backend usa service_role (bypassa) · isto trava o acesso direto via
--    anon key do frontend (dado sensível: atas/deliberações).
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'governance_cycles','governance_meeting_types','governance_meetings',
    'governance_tasks','governance_task_templates','governance_meeting_docs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.current_user_module_level(''governanca'') >= 1)', t||'_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.current_user_module_level(''governanca'') >= 3)', t||'_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.current_user_module_level(''governanca'') >= 3) WITH CHECK (public.current_user_module_level(''governanca'') >= 3)', t||'_update', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_super_admin())', t||'_delete', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_service', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t||'_service', t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Audit log em governance_meetings (mudanças sensíveis).
--    Guardado por existência da função (core · onda3) pra não falhar.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_log_changes') THEN
    DROP TRIGGER IF EXISTS trg_audit_governance_meetings ON public.governance_meetings;
    CREATE TRIGGER trg_audit_governance_meetings
      AFTER INSERT OR UPDATE OR DELETE ON public.governance_meetings
      FOR EACH ROW EXECUTE FUNCTION
      public.audit_log_changes('ata,deliberacoes,pauta,status,deleted_at');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Matriz · "você opera, diretoria lê".
--    Rebaixa a diretoria (que o seed 20260518200000 pôs em nível 5) para 1
--    (leitura). Operador = super-admin (Marcos) + override por pessoa.
--    Idempotente (só age em quem ainda está > 1).
-- ----------------------------------------------------------------------------
UPDATE public.cargo_modulo_permissao cmp
   SET nivel = 1, pode_exportar = false, pode_aprovar = false, updated_at = now()
  FROM public.cargos c, public.modulos m
 WHERE cmp.cargo_id = c.id
   AND cmp.modulo_id = m.id
   AND m.slug = 'governanca'
   AND c.slug IN (
     'coordenador-estrategia','diretor-administrativo','diretor-criativo',
     'diretor-ministerial','pastor-presidente','pastor-senior'
   )
   AND cmp.nivel <> 1;

COMMIT;

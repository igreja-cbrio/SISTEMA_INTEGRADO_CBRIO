-- ============================================================
-- App · Modo Culto · fila de revisão de DECISÕES DE FÉ pelo app (2026-06-17)
-- O membro registra no app que tomou uma decisão no culto; a INTEGRAÇÃO
-- confirma antes de virar decisão oficial (cultos_decisoes_pessoas) e entrar
-- na NSM. Padrão revisar-antes-de-aplicar (igual totem/WhatsApp). Decisão da
-- liderança: NUNCA entra direto na NSM (protege o número contra teste/spam).
-- ============================================================

-- 1. Fila (PII: linka membro) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_decisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  culto_id uuid REFERENCES public.cultos(id) ON DELETE SET NULL,
  ambiente text NOT NULL DEFAULT 'presencial' CHECK (ambiente IN ('presencial','online')),
  tipo text CHECK (tipo IN ('aceitar','reconciliacao','rededicacao','batismo','outro')),
  observacao text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada','descartada')),
  decisao_id uuid REFERENCES public.cultos_decisoes_pessoas(id) ON DELETE SET NULL,
  criada_em timestamptz NOT NULL DEFAULT now(),
  revisada_em timestamptz,
  revisada_por uuid,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_app_decisoes_active ON public.app_decisoes (status, criada_em DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_app_decisoes_membro ON public.app_decisoes (membro_id) WHERE deleted_at IS NULL;

-- 2. Whitelist de soft-delete (append app_decisoes) --------------------------
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $function$
  SELECT '{app_decisoes,app_inscricoes,batismo_inscricoes,cui_acompanhamentos,cui_convertidos,cui_jornada180,cultos,cultos_decisoes_pessoas,int_visitantes,kids_checkins,kids_criancas,kids_pagers,kids_sessoes,kids_vinculo_solicitacoes,kpi_indicadores_taticos,kpi_metas,marketing_capacidade_override,marketing_compromissos_recorrentes,marketing_entregaveis,marketing_kanban_cards,marketing_membros,mem_contribuicoes,mem_devocionais,mem_familias,mem_grupo_encontros,mem_grupo_membros,mem_grupo_pedidos,mem_grupos,mem_historico,mem_membros,mem_trilha_valores,mem_voluntarios,next_matriculas,next_turmas,nsm_eventos,pcs_progressoes,projects,rh_documentos,rh_funcionarios,solicitacoes,usuarios,vol_background_checks,wifi_conexoes,wifi_visitantes}'::text[]
$function$;

-- 3. RLS contextual ----------------------------------------------------------
ALTER TABLE public.app_decisoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_decisoes_select ON public.app_decisoes FOR SELECT TO authenticated
  USING (
    membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('integracao') >= 1
    OR public.is_super_admin()
  );
CREATE POLICY app_decisoes_insert ON public.app_decisoes FOR INSERT TO authenticated
  WITH CHECK (membro_id = public.current_user_membro_id());
CREATE POLICY app_decisoes_update ON public.app_decisoes FOR UPDATE TO authenticated
  USING (public.current_user_module_level('integracao') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('integracao') >= 3 OR public.is_super_admin());
CREATE POLICY app_decisoes_delete ON public.app_decisoes FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY app_decisoes_service ON public.app_decisoes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. Permitir fonte='app' nas decisões oficiais ------------------------------
ALTER TABLE public.cultos_decisoes_pessoas DROP CONSTRAINT IF EXISTS cultos_decisoes_pessoas_fonte_check;
ALTER TABLE public.cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_fonte_check
  CHECK (fonte = ANY (ARRAY['manual'::text, 'form_publico'::text, 'chat'::text, 'app'::text]));

-- ============================================================
-- Kids — Solicitação de vínculo criança↔responsável pelo app
-- O responsável pede pelo app pra ser vinculado a uma criança e envia
-- documentos de identidade (da criança + do pai e/ou da mãe). A equipe
-- Kids confere os documentos e APROVA (cria a criança se nova + cria o
-- vínculo kids_responsaveis) ou REJEITA. NUNCA é vínculo automático —
-- segurança de menor exige conferência humana.
--
-- PII SENSÍVEL DE MENOR: documentos vão num bucket PRIVADO; nada é
-- público. A equipe só vê via signed URL gerada pelo backend.
-- ============================================================

-- 1. Tabela (PII · segue o padrão: deleted_at + índice parcial + RLS)
CREATE TABLE IF NOT EXISTS public.kids_vinculo_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitante_membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  solicitante_nome text NOT NULL,
  solicitante_telefone text,
  solicitante_parentesco text NOT NULL DEFAULT 'outro'
    CHECK (solicitante_parentesco IN ('mae','pai','avo_a','tio_a','tutor','outro')),
  -- criança (pode apontar uma existente, mas normalmente é nova)
  crianca_id uuid REFERENCES public.kids_criancas(id) ON DELETE SET NULL,
  crianca_nome text NOT NULL,
  crianca_data_nascimento date,
  -- documentos (paths no bucket privado kids-documentos · nunca URL pública)
  crianca_doc_path text NOT NULL,
  doc_pai_path text,
  doc_mae_path text,
  observacao text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','rejeitado','cancelado')),
  decidido_por uuid REFERENCES auth.users(id),
  decidido_por_nome text,
  decidido_em timestamptz,
  motivo_rejeicao text,
  crianca_criada_id uuid REFERENCES public.kids_criancas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- pelo menos o documento de um responsável (pai e/ou mãe)
  CONSTRAINT kids_vinc_doc_resp CHECK (doc_pai_path IS NOT NULL OR doc_mae_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_kids_vinc_active
  ON public.kids_vinculo_solicitacoes (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_vinc_solicitante
  ON public.kids_vinculo_solicitacoes (solicitante_membro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kids_vinc_pendente
  ON public.kids_vinculo_solicitacoes (status, created_at DESC) WHERE status = 'pendente';

-- 2. RLS contextual
ALTER TABLE public.kids_vinculo_solicitacoes ENABLE ROW LEVEL SECURITY;

-- Solicitante vê só os próprios pedidos.
DROP POLICY IF EXISTS kids_vinc_proprio_select ON public.kids_vinculo_solicitacoes;
CREATE POLICY kids_vinc_proprio_select ON public.kids_vinculo_solicitacoes
  FOR SELECT TO authenticated
  USING (solicitante_membro_id = public.current_user_membro_id());

-- Solicitante cria só pra si.
DROP POLICY IF EXISTS kids_vinc_proprio_insert ON public.kids_vinculo_solicitacoes;
CREATE POLICY kids_vinc_proprio_insert ON public.kids_vinculo_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_membro_id = public.current_user_membro_id());

-- Equipe Kids (>=1) lê pra triar.
DROP POLICY IF EXISTS kids_vinc_staff_select ON public.kids_vinculo_solicitacoes;
CREATE POLICY kids_vinc_staff_select ON public.kids_vinculo_solicitacoes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1);

-- Equipe Kids (>=3) decide.
DROP POLICY IF EXISTS kids_vinc_staff_update ON public.kids_vinculo_solicitacoes;
CREATE POLICY kids_vinc_staff_update ON public.kids_vinculo_solicitacoes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

-- Delete só super-admin.
DROP POLICY IF EXISTS kids_vinc_delete ON public.kids_vinculo_solicitacoes;
CREATE POLICY kids_vinc_delete ON public.kids_vinculo_solicitacoes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Service role (backend) faz todo o fluxo.
DROP POLICY IF EXISTS kids_vinc_service ON public.kids_vinculo_solicitacoes;
CREATE POLICY kids_vinc_service ON public.kids_vinculo_solicitacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Soft-delete: registra na whitelist (lista canônica + a nova tabela)
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'mem_membros','mem_familias','mem_grupos','mem_grupo_membros','mem_voluntarios',
    'mem_contribuicoes','mem_trilha_valores','mem_devocionais','mem_historico',
    'mem_grupo_encontros','mem_grupo_pedidos','cultos','cultos_decisoes_pessoas',
    'batismo_inscricoes','nsm_eventos','kids_criancas','kids_checkins','kids_sessoes',
    'cui_jornada180','cui_acompanhamentos','cui_convertidos','int_visitantes',
    'kpi_indicadores_taticos','kpi_metas','rh_funcionarios','rh_documentos',
    'pcs_progressoes','projects','solicitacoes','usuarios','marketing_membros',
    'marketing_kanban_cards','marketing_entregaveis','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','kids_pagers',
    'wifi_visitantes','wifi_conexoes','app_inscricoes',
    'kids_vinculo_solicitacoes'
  ]::TEXT[]
$$;

-- 4. Audit (PII de menor · rastreia decisões e mudanças sensíveis)
DROP TRIGGER IF EXISTS trg_audit_kids_vinc ON public.kids_vinculo_solicitacoes;
CREATE TRIGGER trg_audit_kids_vinc
AFTER INSERT OR UPDATE OR DELETE ON public.kids_vinculo_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,crianca_id,crianca_criada_id,decidido_por,motivo_rejeicao,deleted_at'
);

-- 5. Bucket PRIVADO pros documentos de identidade
INSERT INTO storage.buckets (id, name, public)
VALUES ('kids-documentos', 'kids-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- O membro logado só pode SUBIR arquivos na PRÓPRIA pasta ({auth.uid}/...).
-- Nada de leitura via client: quem confere é a equipe Kids, via signed URL
-- gerada pelo backend (service_role bypassa a RLS de storage).
DROP POLICY IF EXISTS kids_docs_insert_own ON storage.objects;
CREATE POLICY kids_docs_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kids-documentos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON TABLE public.kids_vinculo_solicitacoes IS
  'Solicitações de vínculo criança↔responsável feitas pelo app, com documentos de identidade (bucket privado kids-documentos). Aprovação humana obrigatória pela equipe Kids. PII de menor.';

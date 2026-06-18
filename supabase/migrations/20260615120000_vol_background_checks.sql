-- ============================================================
-- Voluntariado — Triagem de antecedentes criminais (Kids/Bridge)
-- ------------------------------------------------------------
-- No Kids/Bridge a segurança vem antes: todo voluntário que se inscreve
-- pra servir com crianças/adolescentes passa por uma triagem de
-- antecedentes criminais ANTES de ser integrado ao time.
--
-- A consulta automática (Polícia Federal · SINIC) é feita via provedor
-- comercial (Infosimples) — a API oficial do gov.br é restrita a órgãos
-- públicos. O dado de antecedente é PII SENSÍVEL: segue o padrão do
-- projeto (deleted_at + índice parcial + whitelist de soft-delete + RLS
-- contextual + audit trigger). O resultado bruto fica restrito a quem
-- triagem (nível >=3 em voluntariado/kids/bridge) ou super-admin.
--
-- IMPORTANTE: a tabela + a trava de integração funcionam mesmo SEM o token
-- da Infosimples configurado — nesse caso a triagem é manual (a equipe
-- confere a certidão e aprova). O token só liga a consulta automática.
-- ============================================================

-- 1. Tabela (PII sensível · deleted_at + índice parcial + RLS)
CREATE TABLE IF NOT EXISTS public.vol_background_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_id uuid REFERENCES public.vol_inscricoes(id) ON DELETE SET NULL,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  area text,                              -- 'kids' | 'bridge' (área que exige a triagem)
  -- identificação usada na consulta (snapshot do que o voluntário informou)
  nome_completo text,
  cpf text,
  nome_mae text,
  nome_pai text,
  data_nascimento date,
  uf_nascimento text,
  -- consentimento LGPD (dado sensível exige base legal + consentimento)
  consentimento boolean NOT NULL DEFAULT false,
  consentimento_em timestamptz,
  consentimento_origem text,              -- ex.: 'formulario_publico'
  -- estado da triagem
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN (
      'pendente',          -- aguardando consulta/conferência
      'consultando',       -- consulta automática em andamento
      'nada_consta',       -- certidão negativa emitida (liberado)
      'possivel_registro', -- não foi possível emitir negativa → conferência humana
      'erro',              -- falha na consulta automática
      'aprovado_manual',   -- equipe conferiu e liberou manualmente
      'reprovado',         -- equipe reprovou
      'dispensado'         -- triagem dispensada por decisão registrada
    )),
  fonte text,                             -- 'infosimples_pf' | 'manual'
  resultado text CHECK (resultado IN ('nada_consta','consta','indeterminado')),
  -- evidências da consulta automática
  certidao_url text,                      -- recibo/certidão externa (Infosimples)
  consulta_raw jsonb,                     -- resposta crua do provedor (sensível)
  consulta_em timestamptz,
  consulta_erro text,
  -- revisão humana
  revisado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revisado_por_nome text,
  revisado_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vol_bgcheck_active
  ON public.vol_background_checks (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vol_bgcheck_inscricao
  ON public.vol_background_checks (inscricao_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vol_bgcheck_pendente
  ON public.vol_background_checks (status, created_at DESC)
  WHERE deleted_at IS NULL AND status IN ('pendente','possivel_registro','erro');

-- 2. RLS contextual (dado sensível · só quem triagem lê)
ALTER TABLE public.vol_background_checks ENABLE ROW LEVEL SECURITY;

-- Leitura restrita a quem triagem (voluntariado/kids/bridge >=3) ou super-admin.
DROP POLICY IF EXISTS vol_bgcheck_select ON public.vol_background_checks;
CREATE POLICY vol_bgcheck_select ON public.vol_background_checks
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('voluntariado') >= 3
    OR public.current_user_module_level('kids') >= 3
    OR public.current_user_module_level('bridge') >= 3
  );

DROP POLICY IF EXISTS vol_bgcheck_insert ON public.vol_background_checks;
CREATE POLICY vol_bgcheck_insert ON public.vol_background_checks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('voluntariado') >= 3
    OR public.current_user_module_level('kids') >= 3
    OR public.current_user_module_level('bridge') >= 3
  );

DROP POLICY IF EXISTS vol_bgcheck_update ON public.vol_background_checks;
CREATE POLICY vol_bgcheck_update ON public.vol_background_checks
  FOR UPDATE TO authenticated
  USING (
    public.current_user_module_level('voluntariado') >= 3
    OR public.current_user_module_level('kids') >= 3
    OR public.current_user_module_level('bridge') >= 3
  )
  WITH CHECK (
    public.current_user_module_level('voluntariado') >= 3
    OR public.current_user_module_level('kids') >= 3
    OR public.current_user_module_level('bridge') >= 3
  );

-- Delete só super-admin (use app_soft_delete no backend).
DROP POLICY IF EXISTS vol_bgcheck_delete ON public.vol_background_checks;
CREATE POLICY vol_bgcheck_delete ON public.vol_background_checks
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Service role (backend · faz o fluxo público de inscrição + consulta + triagem).
DROP POLICY IF EXISTS vol_bgcheck_service ON public.vol_background_checks;
CREATE POLICY vol_bgcheck_service ON public.vol_background_checks
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
    'kids_vinculo_solicitacoes',
    'vol_background_checks'
  ]::TEXT[]
$$;

-- 4. Audit (PII sensível · rastreia consulta, resultado e decisões)
DROP TRIGGER IF EXISTS trg_audit_vol_bgcheck ON public.vol_background_checks;
CREATE TRIGGER trg_audit_vol_bgcheck
AFTER INSERT OR UPDATE OR DELETE ON public.vol_background_checks
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,resultado,consentimento,revisado_por,deleted_at'
);

COMMENT ON TABLE public.vol_background_checks IS
  'Triagem de antecedentes criminais de voluntários Kids/Bridge. Consulta automática via provedor comercial (PF/SINIC) + revisão humana. PII sensível · consentimento LGPD obrigatório · resultado restrito a quem triagem.';

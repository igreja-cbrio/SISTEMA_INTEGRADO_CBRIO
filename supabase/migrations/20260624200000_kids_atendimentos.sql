-- Kids · Atendimentos por criança + inativação (2026-06-24)
-- Histórico de atendimentos/contatos da equipe Kids com cada criança (ex.:
-- "ligamos, está doente"), e campos pra registrar a inativação (age-out aos 13
-- ou desativação manual). PII de menor → deleted_at + whitelist + RLS contextual.

CREATE TABLE IF NOT EXISTS public.kids_atendimentos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crianca_id           uuid NOT NULL REFERENCES public.kids_criancas(id) ON DELETE CASCADE,
  tipo                 text NOT NULL DEFAULT 'contato',  -- contato | ausencia | saude | observacao | outro
  descricao            text NOT NULL,
  data                 date NOT NULL DEFAULT CURRENT_DATE,
  registrado_por       uuid,
  registrado_por_nome  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kids_atendimentos_crianca
  ON public.kids_atendimentos (crianca_id) WHERE deleted_at IS NULL;

ALTER TABLE public.kids_atendimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_atendimentos_select ON public.kids_atendimentos;
CREATE POLICY kids_atendimentos_select ON public.kids_atendimentos
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_atendimentos_insert ON public.kids_atendimentos;
CREATE POLICY kids_atendimentos_insert ON public.kids_atendimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 2);

DROP POLICY IF EXISTS kids_atendimentos_update ON public.kids_atendimentos;
CREATE POLICY kids_atendimentos_update ON public.kids_atendimentos
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

DROP POLICY IF EXISTS kids_atendimentos_delete ON public.kids_atendimentos;
CREATE POLICY kids_atendimentos_delete ON public.kids_atendimentos
  FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS kids_atendimentos_service ON public.kids_atendimentos;
CREATE POLICY kids_atendimentos_service ON public.kids_atendimentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Rastro da inativação (age-out aos 13 / desativação manual).
ALTER TABLE public.kids_criancas
  ADD COLUMN IF NOT EXISTS inativado_em      timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_inativacao text;

-- Whitelist de soft-delete (rule #4) · lista atual + kids_atendimentos.
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kpi_indicadores_taticos','kpi_metas',
    'marketing_capacidade_override','marketing_compromissos_recorrentes','marketing_entregaveis',
    'marketing_kanban_cards','marketing_membros','mem_contribuicoes','mem_devocionais',
    'mem_familias','mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios','next_matriculas',
    'next_turmas','nsm_eventos','pcs_progressoes','projects','rh_documentos','rh_funcionarios',
    'solicitacoes','usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes',
    'log_compras','fin_contas_pagar'
  ]::text[]
$$;

COMMENT ON TABLE public.kids_atendimentos IS 'Histórico de atendimentos/contatos da equipe Kids com cada criança.';

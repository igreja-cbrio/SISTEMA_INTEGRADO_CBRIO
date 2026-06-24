-- Kids · Voluntários responsáveis por sala (2026-06-24)
-- A Mari Gaia define quais voluntários são responsáveis por cada sala (as salas
-- são por faixa etária). Liga ao registro de voluntários (vol_profiles) e ao
-- membro (mem_membros) pra abrir a ficha. PII-leve (telefone snapshot) →
-- deleted_at + whitelist + RLS por módulo kids.

CREATE TABLE IF NOT EXISTS public.kids_sala_voluntarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id         uuid NOT NULL REFERENCES public.kids_salas(id) ON DELETE CASCADE,
  vol_profile_id  uuid REFERENCES public.vol_profiles(id) ON DELETE SET NULL,
  membro_id       uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome            text NOT NULL,
  telefone        text,
  papel           text NOT NULL DEFAULT 'voluntario',  -- responsavel | voluntario | auxiliar
  observacao      text,
  ativo           boolean NOT NULL DEFAULT true,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kids_sala_vol_sala
  ON public.kids_sala_voluntarios (sala_id) WHERE deleted_at IS NULL;
-- Evita o mesmo voluntário duplicado na mesma sala (ativos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_kids_sala_vol
  ON public.kids_sala_voluntarios (sala_id, vol_profile_id)
  WHERE deleted_at IS NULL AND vol_profile_id IS NOT NULL;

ALTER TABLE public.kids_sala_voluntarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_sala_vol_select ON public.kids_sala_voluntarios;
CREATE POLICY kids_sala_vol_select ON public.kids_sala_voluntarios
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS kids_sala_vol_insert ON public.kids_sala_voluntarios;
CREATE POLICY kids_sala_vol_insert ON public.kids_sala_voluntarios
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('kids') >= 3);

DROP POLICY IF EXISTS kids_sala_vol_update ON public.kids_sala_voluntarios;
CREATE POLICY kids_sala_vol_update ON public.kids_sala_voluntarios
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3)
  WITH CHECK (public.current_user_module_level('kids') >= 3);

DROP POLICY IF EXISTS kids_sala_vol_delete ON public.kids_sala_voluntarios;
CREATE POLICY kids_sala_vol_delete ON public.kids_sala_voluntarios
  FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS kids_sala_vol_service ON public.kids_sala_voluntarios;
CREATE POLICY kids_sala_vol_service ON public.kids_sala_voluntarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Whitelist de soft-delete (rule #4) · lista viva + kids_sala_voluntarios.
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios',
    'kpi_indicadores_taticos','kpi_metas',
    'marketing_capacidade_override','marketing_compromissos_recorrentes','marketing_entregaveis',
    'marketing_kanban_cards','marketing_membros','mem_contribuicoes','mem_devocionais',
    'mem_familias','mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios','next_matriculas',
    'next_turmas','nsm_eventos','pcs_progressoes','projects','rh_documentos','rh_funcionarios',
    'solicitacoes','usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes',
    'log_compras','fin_contas_pagar'
  ]::text[]
$$;

COMMENT ON TABLE public.kids_sala_voluntarios IS 'Voluntários responsáveis por sala do Kids (por faixa etária).';

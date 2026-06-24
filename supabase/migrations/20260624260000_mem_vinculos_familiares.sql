-- Membresia · vínculos familiares explícitos (2026-06-24)
-- Relações entre pessoas: "X é filho de Y", "X é irmão de Y", etc. Diferente de
-- mem_familias (agrupamento de domicílio): aqui é o GRAFO de parentesco. Cada
-- relação é gravada nos dois sentidos (A→B com o tipo, B→A com o inverso),
-- ligados por par_id, pra aparecer no detalhe das duas pessoas e apagar juntos.
CREATE TABLE IF NOT EXISTS public.mem_vinculos_familiares (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id      uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  relacionado_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  tipo           text NOT NULL,   -- filho|pai_mae|irmao|conjuge|avo|neto|tio|sobrinho|primo|responsavel|dependente|outro
  par_id         uuid,            -- id do registro recíproco
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT mem_vinc_nao_self CHECK (pessoa_id <> relacionado_id)
);
-- CASCADE justificado: um vínculo é um PAR · sem sentido sem as duas pessoas
-- (mesma lógica de mem_duplicados_ignorados). mem_membros usa soft-delete, então
-- na prática quase nunca dispara.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mem_vinc
  ON public.mem_vinculos_familiares (pessoa_id, relacionado_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_vinc_pessoa
  ON public.mem_vinculos_familiares (pessoa_id) WHERE deleted_at IS NULL;

ALTER TABLE public.mem_vinculos_familiares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mem_vinc_select ON public.mem_vinculos_familiares;
CREATE POLICY mem_vinc_select ON public.mem_vinculos_familiares
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('membresia') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS mem_vinc_insert ON public.mem_vinculos_familiares;
CREATE POLICY mem_vinc_insert ON public.mem_vinculos_familiares
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('membresia') >= 3);

DROP POLICY IF EXISTS mem_vinc_update ON public.mem_vinculos_familiares;
CREATE POLICY mem_vinc_update ON public.mem_vinculos_familiares
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('membresia') >= 3)
  WITH CHECK (public.current_user_module_level('membresia') >= 3);

DROP POLICY IF EXISTS mem_vinc_delete ON public.mem_vinculos_familiares;
CREATE POLICY mem_vinc_delete ON public.mem_vinculos_familiares
  FOR DELETE TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS mem_vinc_service ON public.mem_vinculos_familiares;
CREATE POLICY mem_vinc_service ON public.mem_vinculos_familiares
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Whitelist de soft-delete (rule #4) · lista viva + mem_vinculos_familiares.
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios','kids_estoque',
    'kpi_indicadores_taticos','kpi_metas',
    'marketing_capacidade_override','marketing_compromissos_recorrentes','marketing_entregaveis',
    'marketing_kanban_cards','marketing_membros','mem_contribuicoes','mem_devocionais',
    'mem_familias','mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios','mem_vinculos_familiares',
    'next_matriculas','next_turmas','nsm_eventos','pcs_progressoes','projects','rh_documentos',
    'rh_funcionarios','solicitacoes','usuarios','vol_background_checks','wifi_conexoes',
    'wifi_visitantes','log_compras','fin_contas_pagar'
  ]::text[]
$$;

COMMENT ON TABLE public.mem_vinculos_familiares IS 'Grafo de parentesco entre pessoas (X é filho/irmão/cônjuge de Y) · gravado nos dois sentidos.';

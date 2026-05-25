-- ============================================================================
-- Apresentacao de Bebes · sempre 2 domingo do mes
--
-- Pai/mae usa o totem para agendar apresentacao do bebe. Sistema calcula
-- automaticamente o proximo segundo domingo do mes e vincula ao culto de
-- domingo (quando ja existe). Dados sao PII de menor · LGPD pede cuidado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.apresentacao_bebes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Responsavel (pai ou mae que esta agendando)
  responsavel_membro_id UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  responsavel_nome TEXT NOT NULL,
  responsavel_telefone TEXT NOT NULL,  -- 11 digitos normalizados
  responsavel_email TEXT,

  -- Dados do bebe
  bebe_nome TEXT NOT NULL,
  bebe_data_nascimento DATE NOT NULL,
  bebe_sexo TEXT CHECK (bebe_sexo IN ('M', 'F', 'outro')),

  -- Pais (para a cerimonia)
  nome_pai TEXT,
  nome_mae TEXT,

  -- Data da cerimonia · sempre 2 domingo do mes (validado no backend)
  data_apresentacao DATE NOT NULL,
  culto_id UUID REFERENCES public.cultos(id) ON DELETE SET NULL,

  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada', 'confirmada', 'realizada', 'cancelada')),

  registrado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_apresentacao_bebes_data
  ON public.apresentacao_bebes (data_apresentacao DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apresentacao_bebes_responsavel
  ON public.apresentacao_bebes (responsavel_membro_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apresentacao_bebes_culto
  ON public.apresentacao_bebes (culto_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_apresentacao_bebes_active
  ON public.apresentacao_bebes (id) WHERE deleted_at IS NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public._tg_apresentacao_bebes_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apresentacao_bebes_updated ON public.apresentacao_bebes;
CREATE TRIGGER trg_apresentacao_bebes_updated
  BEFORE UPDATE ON public.apresentacao_bebes
  FOR EACH ROW EXECUTE FUNCTION public._tg_apresentacao_bebes_updated();

-- ----------------------------------------------------------------------------
-- Whitelist soft-delete (extende app_soft_deletable_tables)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'mem_membros', 'mem_familias', 'mem_grupos', 'mem_grupo_membros',
    'mem_voluntarios', 'mem_contribuicoes', 'mem_trilha_valores',
    'mem_devocionais', 'mem_historico', 'mem_grupo_encontros',
    'mem_grupo_pedidos',
    'cultos', 'cultos_decisoes_pessoas', 'batismo_inscricoes', 'nsm_eventos',
    'kids_criancas', 'kids_checkins', 'kids_sessoes',
    'cui_jornada180', 'cui_acompanhamentos', 'cui_convertidos', 'int_visitantes',
    'kpi_indicadores_taticos', 'kpi_metas',
    'rh_funcionarios', 'rh_documentos', 'pcs_progressoes',
    'projects', 'solicitacoes', 'usuarios',
    'apresentacao_bebes'
  ]::TEXT[]
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.apresentacao_bebes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apresentacao_bebes_select ON public.apresentacao_bebes;
CREATE POLICY apresentacao_bebes_select ON public.apresentacao_bebes
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      responsavel_membro_id = public.current_user_membro_id()
      OR public.current_user_module_level('membresia') >= 1
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS apresentacao_bebes_insert ON public.apresentacao_bebes;
CREATE POLICY apresentacao_bebes_insert ON public.apresentacao_bebes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_module_level('membresia') >= 2
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS apresentacao_bebes_update ON public.apresentacao_bebes
;
CREATE POLICY apresentacao_bebes_update ON public.apresentacao_bebes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('membresia') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('membresia') >= 3 OR public.is_super_admin());

DROP POLICY IF EXISTS apresentacao_bebes_delete ON public.apresentacao_bebes;
CREATE POLICY apresentacao_bebes_delete ON public.apresentacao_bebes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS apresentacao_bebes_service ON public.apresentacao_bebes;
CREATE POLICY apresentacao_bebes_service ON public.apresentacao_bebes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Audit log · PII de menor
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_apresentacao_bebes ON public.apresentacao_bebes;
CREATE TRIGGER trg_audit_apresentacao_bebes
AFTER INSERT OR UPDATE OR DELETE ON public.apresentacao_bebes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'bebe_nome,bebe_data_nascimento,responsavel_telefone,responsavel_email,nome_pai,nome_mae,status,deleted_at'
);

COMMENT ON TABLE public.apresentacao_bebes IS
  'Apresentacao de bebes · sempre 2 domingo do mes · PII de menor · LGPD';

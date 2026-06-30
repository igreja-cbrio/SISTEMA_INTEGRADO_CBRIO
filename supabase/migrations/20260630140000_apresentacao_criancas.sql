-- Apresentação de Crianças · formulário próprio (substitui o Google Forms).
-- Acontece sempre no 2º domingo do mês. As respostas aparecem numa aba do Kids,
-- agrupadas por turma (data_apresentacao), estilo batismo. PII de menor (LGPD).
--
-- Form (público) coleta: nome do pai, nome da mãe, nome(s) da criança, idade(s),
-- telefone. A criança é cadastrada (mínimo) em kids_criancas no envio.

CREATE TABLE IF NOT EXISTS public.apresentacao_criancas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_pai        text,
  nome_mae        text,
  crianca_nome    text NOT NULL,
  crianca_idade   text,
  telefone        text,
  data_apresentacao date NOT NULL,
  status          text NOT NULL DEFAULT 'pendente',  -- pendente|confirmado|realizado|cancelado
  observacoes     text,
  origem          text NOT NULL DEFAULT 'publico',    -- publico|manual
  crianca_id      uuid REFERENCES public.kids_criancas(id) ON DELETE SET NULL,
  registrado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_apresentacao_criancas_active
  ON public.apresentacao_criancas (data_apresentacao) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.apresentacao_criancas IS
  'Inscrições de apresentação de crianças (form público · 2º domingo do mês). PII de menor · LGPD. 2026-06-30.';

-- Soft-delete whitelist · lista vigente + a nova tabela.
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios','kids_estoque',
    'kpi_indicadores_taticos','kpi_metas','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','marketing_entregaveis','marketing_kanban_cards',
    'marketing_membros','mem_contribuicoes','mem_devocionais','mem_familias',
    'mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios',
    'mem_vinculos_familiares','next_matriculas','next_turmas','nsm_eventos',
    'pcs_progressoes','projects','rh_documentos','rh_funcionarios','solicitacoes',
    'usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes','log_compras',
    'fin_contas_pagar','cui_primeiro_contato_fila','cui_batismo_next_fila',
    'governance_meetings','governance_meeting_docs','governance_memoria',
    'apresentacao_criancas'
  ]::TEXT[]
$$;

-- RLS · backend (service_role) é o gate; defesa em profundidade pra anon/authenticated.
ALTER TABLE public.apresentacao_criancas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apresentacao_criancas_select ON public.apresentacao_criancas;
CREATE POLICY apresentacao_criancas_select ON public.apresentacao_criancas
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS apresentacao_criancas_service ON public.apresentacao_criancas;
CREATE POLICY apresentacao_criancas_service ON public.apresentacao_criancas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

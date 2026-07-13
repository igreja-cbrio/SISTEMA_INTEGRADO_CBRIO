-- Excluir NPS de verdade = soft-delete (respostas ligadas guardam PII; nunca
-- hard-delete · lei do projeto). Aditivo e idempotente. APLICADA em prod 2026-07-13.
ALTER TABLE public.nps_pesquisas
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_nps_pesquisas_active
  ON public.nps_pesquisas (id) WHERE deleted_at IS NULL;

-- Acrescenta nps_pesquisas à whitelist de soft-delete.
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $function$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios',
    'kids_estoque','kpi_indicadores_taticos','kpi_metas','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','marketing_entregaveis','marketing_kanban_cards',
    'marketing_membros','mem_contribuicoes','mem_devocionais','mem_familias',
    'mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios',
    'mem_vinculos_familiares','next_matriculas','next_turmas','nsm_eventos',
    'pcs_progressoes','projects','rh_documentos','rh_funcionarios','solicitacoes',
    'usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes','log_compras',
    'fin_contas_pagar','cui_primeiro_contato_fila','cui_batismo_next_fila',
    'governance_meetings','governance_meeting_docs','governance_memoria',
    'apresentacao_criancas','ext_eventos','ext_inscricoes',
    'vol_email_disparos','vol_email_disparo_destinatarios',
    'nps_pesquisas'
  ]::TEXT[]
$function$;

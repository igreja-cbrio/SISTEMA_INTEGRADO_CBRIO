-- =====================================================================
-- app_inscricoes · pedidos de Cuidados pelo app (aconselhamento/oração/SOS)
-- + correção do bug que descartava silenciosamente TODAS as inscrições
-- (2026-06-09)
-- =====================================================================
-- DIAGNÓSTICO:
--   O fan-out (fn_app_inscricoes_fanout · migrations 20260604030000 e
--   20260604070000) termina com:
--     UPDATE app_inscricoes SET status = 'processado' ...
--   (e 'duplicado' no ramo de dedup de voluntariado). MAS o CHECK de
--   status só aceitava ('pendente','em_analise','aprovado','recusado').
--   Como é trigger AFTER INSERT, a violação de CHECK abortava e fazia
--   ROLLBACK do INSERT inteiro → o app recebia 201 mas NADA persistia.
--   Isso quebrava qualquer gravação em app_inscricoes (não só Cuidados).
--
-- O QUE ESTA MIGRATION FAZ (aditiva · idempotente):
--   1. Amplia o CHECK de status pra incluir 'processado'/'duplicado'.
--   2. Adiciona colunas pros pedidos de Cuidados: vínculo com membro +
--      status de tratamento pastoral próprio (pendente/em_andamento/
--      concluido), separado do status do pipeline de fan-out.
--   3. Soft-delete (PII · pedido de oração/aconselhamento é sensível).
--   4. Política RLS explícita pro backend (service_role).
--   5. Backfill: revincula membro_id em pedidos de Cuidados já gravados
--      (recupera pedidos que tenham ficado "órfãos" na tabela).
-- =====================================================================

-- 1) CHECK de status · inclui os estados que o fan-out já grava ---------
ALTER TABLE public.app_inscricoes DROP CONSTRAINT IF EXISTS app_inscricoes_status_check;
ALTER TABLE public.app_inscricoes
  ADD CONSTRAINT app_inscricoes_status_check
  CHECK (status IN ('pendente','em_analise','aprovado','recusado','processado','duplicado'));

-- 2) Colunas pros pedidos de Cuidados ----------------------------------
ALTER TABLE public.app_inscricoes
  ADD COLUMN IF NOT EXISTS membro_id          uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tratamento_status  text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS tratado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tratado_em         timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at         timestamptz;

ALTER TABLE public.app_inscricoes DROP CONSTRAINT IF EXISTS app_inscricoes_tratamento_status_check;
ALTER TABLE public.app_inscricoes
  ADD CONSTRAINT app_inscricoes_tratamento_status_check
  CHECK (tratamento_status IN ('pendente','em_andamento','concluido'));

-- Índice da fila de pedidos de Cuidados (tipos pastorais · não deletados)
CREATE INDEX IF NOT EXISTS idx_app_inscricoes_cuidados
  ON public.app_inscricoes (created_at DESC)
  WHERE tipo IN ('aconselhamento','oracao','sos') AND deleted_at IS NULL;

-- 3) Soft-delete whitelist · inclui app_inscricoes (PII) ----------------
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
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
    'wifi_visitantes','wifi_conexoes','app_inscricoes'
  ]::TEXT[]
$$;

-- 4) RLS · backend faz todo o fluxo via service_role -------------------
DROP POLICY IF EXISTS "app_inscricoes_service" ON public.app_inscricoes;
CREATE POLICY "app_inscricoes_service" ON public.app_inscricoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) Backfill defensivo · revincula membro nos pedidos de Cuidados -----
--    Recupera pedidos que tenham persistido sem membro_id (ex.: enviados
--    antes desta correção). O backend já resolve o membro no insert daqui
--    pra frente; isto cobre o histórico.
UPDATE public.app_inscricoes ai
   SET membro_id = p.membro_id
  FROM public.profiles p
 WHERE ai.membro_id IS NULL
   AND ai.auth_user_id = p.id
   AND p.membro_id IS NOT NULL
   AND ai.tipo IN ('aconselhamento','oracao','sos');

COMMENT ON COLUMN public.app_inscricoes.tratamento_status IS
  'Status do tratamento pastoral dos pedidos de Cuidados (pendente/em_andamento/concluido). Distinto de status (pipeline de fan-out).';

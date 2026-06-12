-- =====================================================================
-- Bot WhatsApp passivo · coleta de dados de lideres (2026-05-27)
-- =====================================================================
-- Lider manda mensagem livre no WhatsApp -> webhook Meta Cloud API ->
-- backend parseia com Claude Haiku -> grava em whatsapp_coletas (status
-- 'parseado') -> coordenador revisa e aplica no modulo (grupos/integracao).
--
-- Filosofia (decidida com Marcos): WhatsApp eh so mais um CANAL de entrada
-- que cai na MESMA fila de aprovacao do mobile (cultos_dados_submissoes).
-- Nada eh aplicado automaticamente · review-before-apply.
--
-- PII: ambas as tabelas guardam telefone + texto livre · seguem o padrao
-- de seguranca (deleted_at + indice parcial + whitelist + RLS contextual).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. whatsapp_lideres · vinculo telefone -> profile (quem pode reportar)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_lideres (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- telefone normalizado E.164 sem '+' (ex: 5521999998888)
  telefone      text NOT NULL,
  nome_exibicao text,
  -- modulos que esse lider pode reportar · ex: {'grupos','integracao'}
  escopo        text[] NOT NULL DEFAULT '{}',
  -- se lider de um grupo especifico (cobaia grupos) · resolve o destino
  grupo_id      uuid REFERENCES public.mem_grupos(id) ON DELETE SET NULL,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_at    timestamptz
);

-- telefone unico entre os ativos (nao-deletados)
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_lideres_telefone_idx
  ON public.whatsapp_lideres (telefone)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_lideres_profile_idx
  ON public.whatsapp_lideres (profile_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 2. whatsapp_coletas · log de mensagens recebidas + parse + aplicacao
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_coletas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- idempotencia · Meta reentrega o mesmo evento as vezes
  whatsapp_message_id text UNIQUE,
  telefone            text NOT NULL,
  lider_id            uuid REFERENCES public.whatsapp_lideres(id) ON DELETE SET NULL,
  raw_text            text,
  -- { intent, modulo, dados:{...}, confianca:0-1, resumo }
  parsed              jsonb,
  modulo_destino      text,   -- 'grupos' | 'integracao' | 'desconhecido'
  status              text NOT NULL DEFAULT 'recebido'
                       CHECK (status IN ('recebido','parseado','aplicado','rejeitado','ignorado')),
  aplicado_em         timestamptz,
  aplicado_por        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- referencia opcional ao registro criado ao aplicar (submissao/encontro)
  destino_ref         uuid,
  erro                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS whatsapp_coletas_status_idx
  ON public.whatsapp_coletas (status, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS whatsapp_coletas_lider_idx
  ON public.whatsapp_coletas (lider_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 3. Whitelist soft-delete (extende app_soft_deletable_tables)
--    Lista completa atual + as 2 novas no final.
-- ---------------------------------------------------------------------
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
    'apresentacao_bebes',
    'whatsapp_lideres', 'whatsapp_coletas'
  ]::TEXT[]
$$;

-- ---------------------------------------------------------------------
-- 4. RLS · backend escreve via service_role · leitura por modulo
--    (integracao/grupos >= 1) ou super-admin. Write so service_role
--    (todo o fluxo passa pelo backend · webhook + admin endpoints).
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_lideres  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_coletas  ENABLE ROW LEVEL SECURITY;

-- whatsapp_lideres
DROP POLICY IF EXISTS whatsapp_lideres_select ON public.whatsapp_lideres;
CREATE POLICY whatsapp_lideres_select ON public.whatsapp_lideres
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.current_user_module_level('integracao') >= 1
      OR public.current_user_module_level('grupos') >= 1
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS whatsapp_lideres_service ON public.whatsapp_lideres;
CREATE POLICY whatsapp_lideres_service ON public.whatsapp_lideres
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- whatsapp_coletas
DROP POLICY IF EXISTS whatsapp_coletas_select ON public.whatsapp_coletas;
CREATE POLICY whatsapp_coletas_select ON public.whatsapp_coletas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.current_user_module_level('integracao') >= 1
      OR public.current_user_module_level('grupos') >= 1
      OR public.is_super_admin()
    )
  );

DROP POLICY IF EXISTS whatsapp_coletas_service ON public.whatsapp_coletas;
CREATE POLICY whatsapp_coletas_service ON public.whatsapp_coletas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

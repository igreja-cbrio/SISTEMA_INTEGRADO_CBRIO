-- =====================================================================
-- Bot WhatsApp · agente IA conversacional + institucional (2026-05-27)
-- =====================================================================
-- Evolui o bot passivo (migration 20260527120000) pra duas personas:
--   - Lider/assistente reconhecido -> coleta CONVERSACIONAL (pergunta o
--     que faltou, tira duvida de como reportar) · cai na fila pra confirmar
--   - Numero desconhecido -> assistente INSTITUCIONAL (missao/visao/valores/
--     horarios de culto) · NAO coleta dado
--
-- Mudancas:
--   1. status 'aguardando_info' em whatsapp_coletas (coleta multi-turno)
--   2. coluna papel em whatsapp_lideres (lider/assistente · so display)
--   3. tabela whatsapp_config (conteudo institucional editavel + toggle IA)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Novo status 'aguardando_info' · coleta esperando o lider completar
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_coletas
  DROP CONSTRAINT IF EXISTS whatsapp_coletas_status_check;
ALTER TABLE public.whatsapp_coletas
  ADD CONSTRAINT whatsapp_coletas_status_check
  CHECK (status IN ('recebido','aguardando_info','parseado','aplicado','rejeitado','ignorado'));

-- ---------------------------------------------------------------------
-- 2. Papel do remetente (lider/assistente/etc) · so pra exibir/organizar
-- ---------------------------------------------------------------------
ALTER TABLE public.whatsapp_lideres
  ADD COLUMN IF NOT EXISTS papel text;

-- ---------------------------------------------------------------------
-- 3. Config institucional · singleton (1 linha). Editavel no /admin/whatsapp.
--    Nao eh PII · read liberado a quem ve integracao/grupos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ia_ativa    boolean NOT NULL DEFAULT true,
  -- { missao, visao, valores[], horarios, endereco, sobre, instrucoes_extra }
  institucional jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Seed da linha unica · horarios ja preenchidos (sabemos dos vol_service_types),
-- missao/visao/valores ficam pra equipe preencher no painel.
INSERT INTO public.whatsapp_config (id, institucional)
VALUES (1, jsonb_build_object(
  'missao', '',
  'visao', '',
  'valores', '[]'::jsonb,
  'horarios', E'Domingo: 08h30, 10h00, 11h30 e 19h00\nQuarta com Deus: 20h00\nBridge (sabado): 17h00\nAMI (sabado): 20h00',
  'endereco', '',
  'sobre', 'A CBRio (Comunidade Batista do Rio) e uma igreja em expansao no Rio de Janeiro.',
  'instrucoes_extra', ''
))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_config_select ON public.whatsapp_config;
CREATE POLICY whatsapp_config_select ON public.whatsapp_config
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('integracao') >= 1
    OR public.current_user_module_level('grupos') >= 1
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS whatsapp_config_service ON public.whatsapp_config;
CREATE POLICY whatsapp_config_service ON public.whatsapp_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

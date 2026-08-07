-- ============================================================================
-- ONDA 3 · versão mínima do app + identidade de BINÁRIO na telemetria
-- (2026-08-07)
--
-- O achado (auditoria de 06/08, confirmado ao vivo em 07/08): não existe versão
-- mínima em lugar nenhum. `runtimeVersion.policy = appVersion` + `version
-- 1.0.0` significa que, no dia em que a version subir, TODO binário 1.0.0 para
-- de receber OTA — provado com GET no manifesto: `expo-runtime-version: 1.0.0`
-- devolve 200 com bundle; `1.0.1` devolve **HTTP 204**. O app não quebra:
-- CONGELA no último bundle, e o portão de atualização nunca mais dispara
-- (ele só age com `isUpdatePending`).
--
-- ⚠️⚠️ E hoje é IMPOSSÍVEL medir quem está velho: `app_version` é '1.0.0' em
-- 13.231 de 13.231 eventos (é a version do BUNDLE, não do binário) e
-- `build_number` é nulo em 100% deles. A única forma que sobrou foi deduzir
-- por campo AUSENTE — truque que se gasta a cada release e que enviesa pro
-- otimista (quanto mais velho o cliente, menos ele aparece).
--
-- Esta migration entrega as DUAS pontas: onde guardar o piso (parte 1) e como
-- saber quem está onde (parte 2).
--
-- ⚠️ Aditiva e idempotente: pode rodar de novo sem medo. Nenhuma coluna
-- existente é tocada.
-- ============================================================================

-- ── PARTE 1 · a configuração do app (singleton, no padrão da casa) ──────────
-- ⚠️ TABELA, não env: env do Vercel só propaga com REDEPLOY, não tem trilha de
-- quem mudou nem reversão em 1 clique — e este é o interruptor capaz de trancar
-- a base inteira. O padrão do sistema para isso já existe (`batismo_config`,
-- `vol_config`, `whatsapp_config`, `kids_totem_config`).
CREATE TABLE IF NOT EXISTS public.app_config (
  id boolean PRIMARY KEY DEFAULT true,

  -- Versão MÍNIMA aceita, por plataforma (a `version` do app.json / CFBundle).
  versao_minima_ios      text,
  versao_minima_android  text,

  -- ⚠️ O INTERRUPTOR. Nasce FALSE de propósito: hoje NENHUM binário no campo
  -- manda a versão, então ligar agora bloquearia 100% da base. Só vira true
  -- quando a telemetria mostrar que os ativos já se identificam — o mesmo
  -- deploy em 2 etapas que a marca `app_ficha_confirmada_em` exigiu.
  bloqueia boolean NOT NULL DEFAULT false,

  mensagem text,
  url_loja_ios     text,
  url_loja_android text,

  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,

  -- Singleton de verdade: só a linha `true` existe.
  CONSTRAINT app_config_singleton CHECK (id = true)
);

INSERT INTO public.app_config (id, mensagem)
VALUES (true, 'Atualize o app na loja para continuar.')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- ⚠️ Sem policy pra `authenticated`: quem lê é o BACKEND (service_role), porque
-- o endpoint `/api/app/versao` é público e não pode depender de sessão — um app
-- bloqueado por versão pode nem ter conseguido logar.
DROP POLICY IF EXISTS app_config_service ON public.app_config;
CREATE POLICY app_config_service ON public.app_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS app_config_super_admin ON public.app_config;
CREATE POLICY app_config_super_admin ON public.app_config
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMENT ON TABLE  public.app_config IS
  'Config do app de membros (singleton). `bloqueia` é o interruptor da versão mínima — nasce false; ligar sem a frota se identificando tranca todo mundo.';
COMMENT ON COLUMN public.app_config.bloqueia IS
  'Quando false, o servidor apenas INFORMA a versão mínima e o app decide. Quando true, o app novo bloqueia a tela.';

-- Sem PII ⇒ fora da whitelist de soft-delete, de propósito.
-- Quem mudou fica em `atualizado_por` (snapshot, sem FK — a trilha não pode
-- sumir junto com o profile).

-- ── PARTE 2 · identidade do BINÁRIO na telemetria ──────────────────────────
-- ⚠️ `app_version` é a versão do BUNDLE (veio no OTA) — nunca distingue binário.
-- Quem identifica o binário é `runtime_version` (compilada no build, o
-- `EXUpdatesRuntimeVersion` do plist) e `update_id` diz QUAL bundle está
-- rodando. `is_embedded` responde literalmente a pergunta do achado irmão:
-- "esta sessão está rodando o bundle EMBUTIDO do build?" — que é o caso da 1ª
-- abertura de toda instalação nova.
ALTER TABLE public.app_eventos ADD COLUMN IF NOT EXISTS runtime_version text;
ALTER TABLE public.app_eventos ADD COLUMN IF NOT EXISTS update_id       text;
ALTER TABLE public.app_eventos ADD COLUMN IF NOT EXISTS canal           text;
ALTER TABLE public.app_eventos ADD COLUMN IF NOT EXISTS is_embedded     boolean;

-- Índice pra a pergunta que a Onda 3 existe pra responder: "quantos já estão
-- na versão nova?". Parcial porque a esmagadora maioria das linhas antigas tem
-- NULL e não interessa.
CREATE INDEX IF NOT EXISTS app_eventos_runtime_idx
  ON public.app_eventos (runtime_version, created_at DESC)
  WHERE runtime_version IS NOT NULL;

COMMENT ON COLUMN public.app_eventos.runtime_version IS
  'Runtime do BINÁRIO (do plist/meta-data, não do bundle). É o que identifica quem ficaria órfão de OTA num bump de version.';
COMMENT ON COLUMN public.app_eventos.is_embedded IS
  'true = a sessão roda o bundle EMBUTIDO no build (1ª abertura de instalação nova), não um OTA.';

-- ── CONFERÊNCIA (rodar depois; o SQL Editor não mostra RAISE NOTICE) ────────
-- select column_name from information_schema.columns
--  where table_name = 'app_eventos'
--    and column_name in ('runtime_version','update_id','canal','is_embedded');
--   -> esperado: 4 linhas
--
-- select id, bloqueia, versao_minima_ios, versao_minima_android from public.app_config;
--   -> esperado: 1 linha, bloqueia = false
--
-- select policyname, roles from pg_policies where tablename = 'app_config';
--   -> esperado: app_config_service (service_role) e app_config_super_admin

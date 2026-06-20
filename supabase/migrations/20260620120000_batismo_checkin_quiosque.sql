-- ============================================================================
-- Fase 1 · Quiosque de batismo no Totem Membro (2026-06-20)
-- ============================================================================
-- Captura de identidade na ORIGEM no check-in do batismo: CPF deduplicado
-- (membroMatch · backend) + selfie de referência (consentida) + token de
-- acesso às fotos. Spec: docs/quiosque-lounge-identidade.md (§14-§17).
--
-- ADITIVO + IDEMPOTENTE. NÃO altera RLS de batismo_inscricoes (as policies
-- contextuais existentes de 20260521210000 já cobrem as colunas novas), NÃO
-- toca KPIs, NÃO mexe no upload das fotos da cerimônia (batismoFotos.js).
--
-- Segurança (lição account-takeover · senhas-account-takeover-fix):
--   codigo_acesso   = TOKEN FORTE (32 hex · ~122 bits · NÃO enumerável) → QR/auth.
--   codigo_conferencia = código curto legível (6 chars) → só conferência humana
--                        (a líder de Integração vê na janela do batismo). NÃO é
--                        credencial — não dá acesso sozinho.
-- ============================================================================

-- 1. Colunas aditivas em batismo_inscricoes ---------------------------------
ALTER TABLE public.batismo_inscricoes
  ADD COLUMN IF NOT EXISTS codigo_acesso       text,
  ADD COLUMN IF NOT EXISTS codigo_conferencia  text,
  ADD COLUMN IF NOT EXISTS checkin_em          timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_por         uuid,
  ADD COLUMN IF NOT EXISTS foto_referencia_url text,
  ADD COLUMN IF NOT EXISTS consentimento_em    timestamptz;

COMMENT ON COLUMN public.batismo_inscricoes.codigo_acesso IS
  'Token forte (32 hex · ~122 bits) · payload do QR da etiqueta · acesso às fotos · permanente · revogável. NÃO enumerável.';
COMMENT ON COLUMN public.batismo_inscricoes.codigo_conferencia IS
  'Código curto legível (6 chars, sem ambíguos) · só conferência humana (Integração). NÃO é credencial de acesso.';
COMMENT ON COLUMN public.batismo_inscricoes.foto_referencia_url IS
  'Path da selfie de referência no bucket privado batismos-biometria. Chave do rosto para a Fase 2 (face-match). Não é exibida na Fase 1.';

-- 2. Geradores de código (clones do padrão Kids) ----------------------------
-- SECURITY DEFINER para a checagem de unicidade enxergar todas as linhas mesmo
-- quando chamado como DEFAULT por um INSERT sob RLS.
CREATE OR REPLACE FUNCTION public.fn_batismo_gerar_codigo_acesso()
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE codigo text; tentativas int := 0;
BEGIN
  LOOP
    codigo := replace(gen_random_uuid()::text, '-', '');  -- 32 hex, url-safe
    IF NOT EXISTS (SELECT 1 FROM public.batismo_inscricoes WHERE codigo_acesso = codigo) THEN
      RETURN codigo;
    END IF;
    tentativas := tentativas + 1;
    IF tentativas > 20 THEN
      RAISE EXCEPTION 'batismo: não conseguiu gerar codigo_acesso único';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fn_batismo_gerar_codigo_conferencia()
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 chars, sem 0/O/I/1
  codigo text;
  tentativas int := 0;
BEGIN
  LOOP
    codigo := '';
    FOR i IN 1..6 LOOP
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM public.batismo_inscricoes
      WHERE codigo_conferencia = codigo AND deleted_at IS NULL
    ) THEN
      RETURN codigo;
    END IF;
    tentativas := tentativas + 1;
    IF tentativas > 50 THEN
      RAISE EXCEPTION 'batismo: não conseguiu gerar codigo_conferencia único após 50 tentativas';
    END IF;
  END LOOP;
END $$;

-- 3. Backfill das inscrições já existentes ----------------------------------
-- codigo_acesso: UUID-hex (colisão astronomicamente improvável num único UPDATE).
UPDATE public.batismo_inscricoes
   SET codigo_acesso = replace(gen_random_uuid()::text, '-', '')
 WHERE codigo_acesso IS NULL;

-- codigo_conferencia: loop linha-a-linha (a função evita colisão em-statement).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.batismo_inscricoes WHERE codigo_conferencia IS NULL LOOP
    UPDATE public.batismo_inscricoes
       SET codigo_conferencia = public.fn_batismo_gerar_codigo_conferencia()
     WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Defaults para novas inscrições (totem / público / manual todos cobertos) -
ALTER TABLE public.batismo_inscricoes
  ALTER COLUMN codigo_acesso      SET DEFAULT public.fn_batismo_gerar_codigo_acesso(),
  ALTER COLUMN codigo_conferencia SET DEFAULT public.fn_batismo_gerar_codigo_conferencia();

-- 5. Unicidade do token de acesso -------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_batismo_codigo_acesso
  ON public.batismo_inscricoes (codigo_acesso) WHERE codigo_acesso IS NOT NULL;

-- 6. Bucket privado da selfie de referência ---------------------------------
-- Privado: só service_role (backend) escreve/lê. Na Fase 1 a selfie é a chave
-- do rosto para a Fase 2 (face-match) e não é exibida a ninguém.
INSERT INTO storage.buckets (id, name, public)
VALUES ('batismos-biometria', 'batismos-biometria', false)
ON CONFLICT (id) DO NOTHING;

-- ⚠️ FOLLOW-UP OBRIGATÓRIO ANTES DA FASE 2 (acesso por token a /batismo/acesso):
-- A RLS de batismo_inscricoes (20260521210000) tem um ramo de SELECT
-- `current_user_module_level('membresia') >= 3`. Hoje o backend faz strip do
-- codigo_acesso/codigo_conferencia em todas as respostas e nenhum frontend lê a
-- tabela direto pela anon key — então o token é INERTE na Fase 1 (sem consumidor
-- até /batismo/acesso existir). Na Fase 2, ANTES de ligar o acesso por token,
-- revogar a leitura desses 2 campos para os papéis não-service (column-level
-- REVOKE SELECT, validando que select('*') do PostgREST não quebra, ou mover os
-- campos para uma tabela satélite gated só por integração/service_role).

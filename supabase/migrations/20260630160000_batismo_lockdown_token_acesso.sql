-- ============================================================================
-- Lockdown column-level · token de acesso do batismo (Quiosque · PR2 parte 1)
-- 2026-06-30
--
-- Contexto: a Fase 1 do quiosque (migration 20260620120000) criou em
-- batismo_inscricoes os campos:
--   codigo_acesso       = TOKEN FORTE (32 hex · ~122 bits · não enumerável) →
--                         será a porta do /batismo/acesso (QR da etiqueta) na
--                         PR2/Fase 2.
--   codigo_conferencia  = código curto legível (6 chars) → conferência humana
--                         (a Lorena confere com a pessoa).
--
-- A RLS de batismo_inscricoes (20260521210000) permite SELECT a:
--   • a própria pessoa  (membro_id = current_user_membro_id())
--   • quem tem integracao >= 1
--   • quem tem membresia >= 3
-- Como o frontend usa a ANON KEY, qualquer um desses papéis PODERIA consultar
-- a tabela direto (sem passar pelo backend) e COLHER o token — que vira a
-- credencial de acesso às fotos. O backend (service_role) já faz strip do
-- token nas respostas, mas o caminho anon-key direto continua aberto. Este é
-- o follow-up obrigatório documentado no fim da 20260620120000.
--
-- Esta migration fecha o vetor (defesa em profundidade) com segurança a nível
-- de COLUNA: revoga o SELECT amplo de anon/authenticated e regranta o SELECT
-- em TODAS as colunas EXCETO as 2 do token. service_role (backend) mantém
-- acesso total — é ele quem gera, lê e imprime o token.
--
-- ⚠️ Postgres: um "REVOKE SELECT (coluna)" NÃO tem efeito enquanto existir um
-- GRANT SELECT no nível da TABELA (o grant de tabela cobre todas as colunas,
-- inclusive futuras). O padrão correto é: REVOKE SELECT da tabela + GRANT
-- SELECT por coluna (todas menos as 2). É o que fazemos abaixo, montando a
-- lista de colunas dinamicamente (cobre as colunas atuais · idempotente).
--
-- ⚠️ Efeito colateral CONSCIENTE: após esta migration, um `SELECT *`
-- (PostgREST select=*) em batismo_inscricoes pela anon key passa a falhar para
-- authenticated (permission denied na coluna do token) — que é EXATAMENTE o
-- comportamento desejado. Nenhum código do frontend lê esta tabela direto
-- (verificado: zero `from('batismo_inscricoes')` em src) · todo acesso passa
-- pelo backend/service_role. Selects de colunas explícitas seguem funcionando.
--
-- ⚠️ Manutenção: colunas NOVAS adicionadas a batismo_inscricoes no futuro NÃO
-- ganham SELECT automático para authenticated/anon (só as listadas aqui têm).
-- Como nada no frontend lê a tabela direto, o impacto prático é nulo; se algum
-- dia precisar, basta `GRANT SELECT (nova_coluna) ON public.batismo_inscricoes
-- TO authenticated;` na migration que adicionar a coluna. NÃO regrantear
-- `SELECT` no nível de tabela para authenticated/anon — isso reabre o token.
--
-- Aditiva, idempotente e NÃO-destrutiva (não mexe em RLS, policies nem dados).
-- ============================================================================

DO $$
DECLARE
  v_cols text;
BEGIN
  IF to_regclass('public.batismo_inscricoes') IS NULL THEN
    RAISE NOTICE 'batismo_inscricoes não existe — pulando lockdown do token.';
    RETURN;
  END IF;

  -- Lista de colunas da tabela, exceto as 2 do token de acesso.
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'batismo_inscricoes'
     AND column_name NOT IN ('codigo_acesso', 'codigo_conferencia');

  IF v_cols IS NULL THEN
    RAISE NOTICE 'Nenhuma coluna não-token encontrada — pulando.';
    RETURN;
  END IF;

  -- 1. Remove o SELECT amplo (nível de tabela) de authenticated e anon.
  EXECUTE 'REVOKE SELECT ON public.batismo_inscricoes FROM authenticated, anon';

  -- 2. Regranta o SELECT apenas nas colunas permitidas (o token fica de fora).
  EXECUTE format('GRANT SELECT (%s) ON public.batismo_inscricoes TO authenticated', v_cols);
  EXECUTE format('GRANT SELECT (%s) ON public.batismo_inscricoes TO anon', v_cols);
END $$;

-- 3. service_role (backend) mantém acesso TOTAL e explícito ao token
--    (defensivo contra drift de default privileges · idempotente).
GRANT SELECT (codigo_acesso, codigo_conferencia)
  ON public.batismo_inscricoes TO service_role;

COMMENT ON COLUMN public.batismo_inscricoes.codigo_acesso IS
  'TOKEN FORTE de acesso às fotos (QR da etiqueta · será a porta do /batismo/acesso). '
  'Leitura restrita a service_role (backend) via column-level lockdown (20260630160000). '
  'NUNCA expor pela anon key nem regrantear SELECT de tabela a authenticated/anon.';

COMMENT ON COLUMN public.batismo_inscricoes.codigo_conferencia IS
  'Código curto legível para conferência humana. Leitura restrita a service_role '
  '(backend) via column-level lockdown (20260630160000).';

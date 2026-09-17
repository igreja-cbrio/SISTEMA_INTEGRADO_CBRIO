-- ════════════════════════════════════════════════════════════════════════════
-- REM-04 · o apto/bloco dos grupos sai do alcance de quem só está logado
-- 17/09/2026 · MEDIDO com a conta de teste (membro comum, sem cargo):
--   `mem_grupos` devolve 109 grupos com as 36 colunas — inclusive
--   **`complemento` de 12 grupos** (apto e bloco da casa do anfitrião) e
--   `observacoes` (nota interna sobre o grupo).
--
-- ⚠️⚠️ POR QUE ISSO IMPORTA: é exatamente o dado que o PR #2941 (16/09) decidiu
-- que NUNCA sai — ele fechou o vazamento do `complemento` no deep-link do
-- formulário público. A regra estava certa e a porta dos fundos continuava
-- aberta: qualquer conta autenticada lia pelo PostgREST. E como o cadastro do
-- provedor de auth está ABERTO (signup + autoconfirm ligados · AUTH-01),
-- "qualquer conta autenticada" quer dizer qualquer pessoa da internet.
--
-- ⚠️ RUA E NÚMERO CONTINUAM VISÍVEIS, de propósito: a igreja publica o endereço
-- do grupo (decisão da Natasha, #2941). O que sai é o COMPLEMENTO, que é o que
-- leva alguém até a porta do apartamento.
--
-- ⚠️⚠️ POR QUE UM GRANT DE COLUNAS, E NÃO UM REVOKE DE DUAS: no Postgres, o
-- privilégio de TABELA cobre todas as colunas — `REVOKE SELECT (complemento)`
-- com o `GRANT SELECT` de tabela em pé é NO-OP SILENCIOSO. A única forma é
-- tirar o privilégio da tabela e devolver coluna a coluna.
--
-- ⚠️⚠️ A CONTRAPARTIDA, E ELA TEM QUE ESTAR NO CLAUDE.md: coluna NOVA em
-- `mem_grupos` nasce SEM privilégio para `authenticated`. Se o app passar a
-- lê-la sem entrar nesta lista, ele leva 42501 na cara. (Nada quebra hoje: o
-- app pede COLUNAS EXPLÍCITAS em `grupo-detalhe.tsx`, `grupo-editar.tsx` e
-- `lib/jornada.ts` — nunca `select("*")` — e o front web nem lê esta tabela,
-- fala com o backend, que usa `service_role` e não é afetado.)
--
-- ⚠️ `is_lider_grupo()` é `security definer` (ver `supabase/storage_grupos.sql`),
-- então a permissão de subir a foto de capa não depende do privilégio de quem
-- chama. Conferido antes de escrever isto.
-- ════════════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PASSO 0 · CONFERÊNCIA — rode SOZINHO primeiro. Não altera nada.          │
-- │ Fotografa o privilégio de hoje: é a única cópia do estado anterior.      │
-- └──────────────────────────────────────────────────────────────────────────┘
-- SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--  WHERE table_schema = 'public' AND table_name = 'mem_grupos'
--    AND grantee IN ('authenticated','anon')
--  ORDER BY grantee, column_name;
-- -- e o de tabela:
-- SELECT grantee, privilege_type FROM information_schema.table_privileges
--  WHERE table_schema='public' AND table_name='mem_grupos' AND grantee IN ('authenticated','anon');

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ PASSO 1 · A MUDANÇA — uma colagem só. Idempotente.                       │
-- └──────────────────────────────────────────────────────────────────────────┘
SET lock_timeout = '10s';

-- Tabela inteira sai...
REVOKE SELECT ON public.mem_grupos FROM authenticated, anon;

-- ...e volta coluna a coluna, sem `complemento` e sem `observacoes`.
GRANT SELECT (
  id, nome, categoria, lider_id, local, endereco, dia_semana, horario,
  descricao, ativo, created_at, recorrencia, tema, foto_url, grupo_origem_id,
  updated_at, cep, lat, lng, bairro, status_temporada, temporada, codigo,
  supervisor_id, deleted_at, area, igreja_id, faixa_etaria, capacidade,
  aceitando_inscricoes, rede_id, idade_min, idade_max, modo_inscricao
) ON public.mem_grupos TO authenticated;

-- O `anon` não volta: desde o revoke de 06/09 ele não lê nada, e grupo não é
-- catálogo público pelo banco — a porta pública passa pelo backend.

NOTIFY pgrst, 'reload schema';

-- ⚠️ TERMINA NA CONFERÊNCIA (o SQL Editor mostra só o último comando).
-- Esperado: colunas_liberadas = 34 · complemento_liberado = 0 · observacoes_liberado = 0
SELECT
  count(*) FILTER (WHERE privilege_type = 'SELECT')                              AS colunas_liberadas,
  count(*) FILTER (WHERE privilege_type = 'SELECT' AND column_name = 'complemento') AS complemento_liberado,
  count(*) FILTER (WHERE privilege_type = 'SELECT' AND column_name = 'observacoes') AS observacoes_liberado
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'mem_grupos' AND grantee = 'authenticated';

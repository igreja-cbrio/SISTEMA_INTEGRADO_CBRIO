-- ═══════════════════════════════════════════════════════════════════════════
--  CAMPANHAS · marco editável, N responsáveis, ou uma ÁREA inteira
--  2026-08-27 · pedido do Matheus na aba Cronograma
--
--  O que existia: `camp_marcos.responsavel_id` + `responsavel_nome` — UM
--  responsável, e nenhuma tela para preencher. O pedido é (a) editar a tarefa,
--  (b) atribuir a UMA OU VÁRIAS pessoas, (c) ou atribuir a uma ÁREA inteira.
--
--  ⚠️⚠️ N pessoas exige TABELA SATÉLITE, não coluna. Lista de gente em texto
--  (ou em jsonb) é exatamente o que o módulo Cuidados pagou para descobrir: o
--  mesmo pastor apareceu em 4 grafias e o total dele ficou partido em 4 cards.
--  E a LEI nº 3 do projeto proíbe responsável como TEXT livre — é UUID com FK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · ÁREA do marco
--
-- ⚠️ `areas` (19 linhas · id INTEGER) é o vocabulário ORGANIZACIONAL, e é o
-- único que mapeia para PESSOAS (via `usuario_areas`). NÃO usar `areas_kpi`
-- (17 · vocabulário de indicador, tem "Igreja", "Jornada", "Generosidade") nem
-- os slugs de `area_responsaveis` (8 · adm/compras/cozinha/…): os três não são
-- a mesma lista, e escolher o errado faria "atribuir à área" não achar ninguém.
--
-- ⚠️ `ON DELETE SET NULL`, nunca CASCADE: apagar uma área não pode apagar a
-- tarefa da campanha — o trabalho continua existindo, só fica sem dono.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.camp_marcos
  ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES public.areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS camp_marcos_area_idx
  ON public.camp_marcos (area_id) WHERE deleted_at IS NULL AND area_id IS NOT NULL;

COMMENT ON COLUMN public.camp_marcos.area_id IS
  'Área RESPONSÁVEL pela tarefa (areas.id · vocabulário organizacional de 19 áreas). '
  'Pode coexistir com responsáveis nomeados: "Marketing" + "Pedro" é o caso comum '
  '(a área responde, uma pessoa puxa). Área sozinha = a área toda responde.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · OS RESPONSÁVEIS (N por marco)
--
-- ⚠️ CASCADE nos dois lados de propósito: é linha de VÍNCULO, não tem sentido
-- sem o marco nem sem a pessoa. Não é o caso das FKs que viraram SET NULL na
-- Onda 3 (aquelas guardam FATO — contribuição, check-in, decisão).
--
-- ⚠️ SEM `deleted_at` e fora da whitelist de soft-delete: não guarda PII (só
-- dois ponteiros) e "desfazer" aqui é literalmente apagar o vínculo. Soft-delete
-- deixaria a linha viva e todo leitor teria de lembrar de filtrá-la — jeito
-- silencioso de a pessoa seguir atribuída depois de ser removida.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camp_marco_responsaveis (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marco_id   UUID NOT NULL REFERENCES public.camp_marcos(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- ⚠️ UNIQUE SEM PREDICADO: é ele que o `ON CONFLICT DO NOTHING` do backend
-- infere. Índice PARCIAL não é inferível (lei de 04/08 · o bug do
-- `mem_censo_convites`), e a falha seria 42P10 no meio de um save.
CREATE UNIQUE INDEX IF NOT EXISTS camp_marco_responsaveis_unq
  ON public.camp_marco_responsaveis (marco_id, profile_id);
CREATE INDEX IF NOT EXISTS camp_marco_responsaveis_pessoa_idx
  ON public.camp_marco_responsaveis (profile_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3 · `responsavel_id` / `responsavel_nome` ficam DEPRECADOS (não dropados)
--
-- ⚠️ Duas fontes para "quem é o responsável" é a divergência que este projeto
-- já pagou várias vezes. A satélite passa a ser a única, e o backend deixou de
-- aceitar as duas colunas no write path. NÃO foram dropadas porque DROP COLUMN
-- é destrutivo (regra "parar e perguntar") — e são inofensivas vazias.
-- Medido em 27/08: 8 marcos, TODOS com as duas colunas NULAS ⇒ zero a migrar.
-- ⏳ Follow-up: dropar as duas quando o Matheus confirmar.
-- ───────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.camp_marcos.responsavel_id IS
  'DEPRECADO em 27/08/2026 · use camp_marco_responsaveis. O backend não escreve mais aqui.';
COMMENT ON COLUMN public.camp_marcos.responsavel_nome IS
  'DEPRECADO em 27/08/2026 · use camp_marco_responsaveis (LEI nº 3: responsável é UUID com FK, nunca texto).';

-- ───────────────────────────────────────────────────────────────────────────
-- 4 · AS PESSOAS DE UMA ÁREA · régua ÚNICA em SQL
--
-- ⚠️⚠️ A ponte área→pessoa é LEGADA e tem três saltos:
--   areas.id  →  usuario_areas.area_id  →  usuarios (id INTEGER!)  →  profiles
-- e o último salto é por **e-mail normalizado**, porque `usuarios.id` é INTEGER
-- legado e `profiles.id` é UUID (a transição documentada no CLAUDE.md). Deixar
-- essa cadeia solta no JS garantiria que a próxima tela a precisar dela
-- escrevesse a sua própria versão, com um salto de menos.
--
-- ⚠️ Devolve só quem tem login DO ERP: `is_membro_only` (112 contas hoje) é
-- pessoa do app de membros, e `is_servico` são as 8 contas de sistema — mandar
-- tarefa de campanha para elas é aviso que ninguém lê.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_camp_pessoas_da_area(p_area_id INTEGER)
RETURNS TABLE (profile_id UUID, nome TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.name, p.email
    FROM usuario_areas ua
    JOIN usuarios u ON u.id = ua.usuario_id AND u.ativo = true
    JOIN profiles p ON lower(btrim(p.email)) = lower(btrim(u.email))
   WHERE ua.area_id = p_area_id
     AND p.active = true
     AND p.is_membro_only IS NOT TRUE
     AND p.is_servico IS NOT TRUE;
$$;

COMMENT ON FUNCTION public.fn_camp_pessoas_da_area(INTEGER) IS
  'Pessoas com login do ERP de uma área (areas.id). Ponte legada: usuario_areas → '
  'usuarios (id INTEGER) → profiles por e-mail normalizado. Medido em 27/08: as 19 '
  'áreas resolvem entre 1 e 8 pessoas cada. ⚠️ Quem chama é o BACKEND (service_role) — '
  'sem grant para authenticated de propósito.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5 · RLS (o backend usa service_role; isto fecha o acesso direto pelo cliente)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.camp_marco_responsaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS camp_marco_responsaveis_select ON public.camp_marco_responsaveis;
CREATE POLICY camp_marco_responsaveis_select ON public.camp_marco_responsaveis
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('campanhas') >= 1);

DROP POLICY IF EXISTS camp_marco_responsaveis_insert ON public.camp_marco_responsaveis;
CREATE POLICY camp_marco_responsaveis_insert ON public.camp_marco_responsaveis
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('campanhas') >= 3);

DROP POLICY IF EXISTS camp_marco_responsaveis_update ON public.camp_marco_responsaveis;
CREATE POLICY camp_marco_responsaveis_update ON public.camp_marco_responsaveis
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('campanhas') >= 3)
  WITH CHECK (public.current_user_module_level('campanhas') >= 3);

DROP POLICY IF EXISTS camp_marco_responsaveis_delete ON public.camp_marco_responsaveis;
CREATE POLICY camp_marco_responsaveis_delete ON public.camp_marco_responsaveis
  FOR DELETE TO authenticated
  USING (public.current_user_module_level('campanhas') >= 3);

DROP POLICY IF EXISTS camp_marco_responsaveis_service ON public.camp_marco_responsaveis;
CREATE POLICY camp_marco_responsaveis_service ON public.camp_marco_responsaveis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 6 · HISTÓRICO DE DÍGITO da campanha
--
-- ⚠️⚠️ POR QUE ISTO EXISTE: `vw_camp_arrecadacao` casa o caixa por
-- `t.identificador_centavo = c.digito`. Trocar o dígito de 07 para 08 faria TODA
-- doação já identificada com ,07 **desaparecer da barrinha, em silêncio** — o
-- número só ficaria menor, sem erro nenhum.
--
-- A saída NÃO é mudar a view (o balde chaveado no dígito é o que impede a dupla
-- contagem do repasse do PSP · ver a LEI Nº 6): é o backend, ao trocar o dígito,
-- FIXAR o passado em `camp_vinculos` (incluir = true), que a view já soma. Esta
-- tabela é a TRILHA de quando cada dígito valeu — para alguém poder auditar
-- depois por que há inclusão manual em massa naquela data.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camp_digito_historico (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id    UUID NOT NULL REFERENCES public.camp_campanhas(id) ON DELETE CASCADE,
  digito_anterior CHAR(2),
  digito_novo    CHAR(2),
  lancamentos_fixados INTEGER NOT NULL DEFAULT 0,
  motivo         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID
);
CREATE INDEX IF NOT EXISTS camp_digito_historico_campanha_idx
  ON public.camp_digito_historico (campanha_id, created_at DESC);

ALTER TABLE public.camp_digito_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS camp_digito_historico_select ON public.camp_digito_historico;
CREATE POLICY camp_digito_historico_select ON public.camp_digito_historico
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('campanhas') >= 1);

-- ⚠️ Trilha é APPEND-ONLY: nenhuma policy de UPDATE/DELETE para authenticated.
-- Quem escreve é o backend com service_role, no momento da troca.
DROP POLICY IF EXISTS camp_digito_historico_service ON public.camp_digito_historico;
CREATE POLICY camp_digito_historico_service ON public.camp_digito_historico
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

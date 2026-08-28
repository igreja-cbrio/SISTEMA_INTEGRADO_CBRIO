-- ============================================================================
-- BACKFILL DE `mem_membros.genero` — só o que a PRÓPRIA PESSOA declarou
-- (10/08/2026 · pedido do Marcos)
--
-- ⚠️⚠️ POR QUE ISTO EXISTE: a trava de entrada em grupo passou a exigir que o
-- sexo BATA com a categoria (`utils/entradaGrupoApp.js`). O portão de identidade
-- já cobra o dado de quem entra no app, mas há cadastro antigo com a coluna
-- vazia — e a base inteira está vazia nisso: **499 de 4.056 membros vivos têm
-- `genero` (12%)**. Este script recupera o que já foi declarado e se perdeu no
-- caminho, em vez de cobrar de novo de quem já respondeu.
--
-- ⚠️⚠️ A FONTE É DECLARAÇÃO, NUNCA INFERÊNCIA. `mem_cadastros_pendentes.genero`
-- é o que a pessoa marcou no formulário público (campo obrigatório lá). O
-- matcher, ao vincular o cadastro pendente a um `mem_membros` existente,
-- descartava esse campo — é essa perda que se conserta aqui.
--
-- ⚠️⚠️ O QUE ESTE SCRIPT **NÃO** FAZ, E NÃO DEVE FAZER NUNCA: adivinhar sexo a
-- partir do NOME. É pouco confiável (nomes ambíguos, nomes compostos, nomes
-- estrangeiros) e errar isso num cadastro de igreja significa constranger uma
-- pessoa real — que depois vê o erro num grupo, num crachá ou num check-in. Se
-- não há declaração, o campo fica NULO e o app pede na próxima abertura.
--
-- ALCANCE MEDIDO ANTES DE ESCREVER (10/08): 392 cadastros pendentes, 372 com
-- `genero` declarado, 97 já vinculados a um membro, e **51 desses membros estão
-- com `genero` NULO** ⇒ 51 pessoas recuperadas. O resto da base continua vazio
-- de propósito: não há declaração pra elas.
--
-- IDEMPOTENTE: só escreve onde está NULO. Rodar de novo não muda nada.
-- ============================================================================

BEGIN;

-- Confere o vocabulário antes de escrever: a coluna viva usa 'masculino' e
-- 'feminino' (medido: 175 + 324). Qualquer outro valor no pendente é ignorado —
-- não se traduz o que não se reconhece.
WITH declarado AS (
  SELECT DISTINCT ON (p.membro_id)
         p.membro_id,
         lower(btrim(p.genero)) AS genero
  FROM public.mem_cadastros_pendentes p
  WHERE p.membro_id IS NOT NULL
    AND lower(btrim(coalesce(p.genero, ''))) IN ('masculino', 'feminino')
  -- Se a mesma pessoa preencheu 2×, vale a declaração MAIS RECENTE.
  ORDER BY p.membro_id, p.created_at DESC
)
UPDATE public.mem_membros m
   SET genero = d.genero,
       updated_at = now()
  FROM declarado d
 WHERE m.id = d.membro_id
   AND m.genero IS NULL          -- ⚠️ NUNCA sobrescreve o que já existe
   AND m.deleted_at IS NULL;

COMMIT;

-- ── Conferência (rodar depois, é só leitura) ────────────────────────────────
-- Esperado: o número de "com genero" sobe ~51 e nada mais muda.
--
--   SELECT count(*) FILTER (WHERE genero IS NOT NULL) AS com_genero,
--          count(*) FILTER (WHERE genero IS NULL)     AS sem_genero,
--          count(*)                                    AS vivos
--     FROM public.mem_membros WHERE deleted_at IS NULL;
--
-- E pra ver se sobrou declaração não aproveitada (deve dar 0):
--
--   SELECT count(*) FROM public.mem_cadastros_pendentes p
--     JOIN public.mem_membros m ON m.id = p.membro_id
--    WHERE m.genero IS NULL AND m.deleted_at IS NULL
--      AND lower(btrim(coalesce(p.genero,''))) IN ('masculino','feminino');

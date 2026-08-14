-- ============================================================================
-- Grupos · 2ª leva: quem foi ADICIONADO EM LOTE também é participante
-- ============================================================================
-- Continuação da `20260814120000`, que promoveu 387 pessoas mas exigiu **pedido
-- aprovado** — critério conservador de propósito, pra não encostar em quem é
-- visitante de encontro de verdade.
--
-- A conferência devolveu **29 restantes**, e a lista foi olhada uma a uma pelo
-- Matheus (13/08). Nenhum é visitante de encontro:
--
--   · 25 em "Jornada Bíblica 1" e "Jornada Bíblica 2" — TODOS com entrou_em
--     2026-08-10, zero presença: a turma inteira carregada de uma vez.
--   ·  3 em "GRUPO DE MENINAS - JOVENS" — todos em 2026-08-07, mesmo padrão.
--   ·  1 em "GRUPO DE CONEXÃO - RECREIO" (27/07) com pedido NÃO aprovado e
--     vínculo ativo mesmo assim — foi adicionada à mão.
--
-- Todas entraram DEPOIS de 20/06 (quando o default virou 'visitante') e por uma
-- porta que não seta a função: por isso nasceram visitante. É o mesmo caso que
-- a 1ª leva corrigiu, só que sem pedido registrado pra provar.
--
-- ⚠️ A LEI CONTINUA VALENDO: `visitante` é DECLARADO. Quem o líder registrar no
-- encontro (`POST /public/grupos/encontro/visitante`) segue nascendo visitante,
-- hoje e depois desta migration — o endpoint seta a função explicitamente.
--
-- ⚠️ O CORTE POR DATA (`entrou_em <= '2026-08-10'`) é o que impede esta migration
-- de promover visitante de encontro registrado DEPOIS de ela ser escrita. Sem
-- ele, aplicar com atraso varreria gente que o líder acabou de declarar
-- visitante — e o registro dela existe justamente pra dizer que ela não é do
-- grupo ainda. Com o corte, o alvo é EXATAMENTE a lista conferida acima.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Backup ANTES de tocar (rollback no rodapé)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bk_20260814_grupo_funcao_visitante_lote (
  id            uuid PRIMARY KEY,
  grupo_id      uuid,
  membro_id     uuid,
  funcao_antiga text,
  presencas     integer,
  entrou_em     date,
  snapshot_em   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bk_20260814_grupo_funcao_visitante_lote
  (id, grupo_id, membro_id, funcao_antiga, presencas, entrou_em)
SELECT gm.id, gm.grupo_id, gm.membro_id, gm.funcao::text, gm.presencas, gm.entrou_em
  FROM public.mem_grupo_membros gm
 WHERE gm.funcao = 'visitante'
   AND gm.saiu_em   IS NULL
   AND gm.deleted_at IS NULL
   AND gm.entrou_em <= DATE '2026-08-10'   -- ⚠️ ver o porquê no cabeçalho
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Promove exatamente o que foi para o backup
-- ----------------------------------------------------------------------------
UPDATE public.mem_grupo_membros
   SET funcao = 'frequentador'
 WHERE id IN (SELECT id FROM public._bk_20260814_grupo_funcao_visitante_lote)
   AND funcao = 'visitante';

COMMIT;

-- ============================================================================
-- CONFERÊNCIA — esperado: promovidos_lote = 29, visitantes_agora = 0.
--
-- `visitantes_agora` > 0 só deve acontecer se alguém for registrado como
-- visitante de encontro depois de 10/08 — e aí está CERTO que apareça.
-- ============================================================================
SELECT
  (SELECT count(*) FROM public._bk_20260814_grupo_funcao_visitante_lote)         AS promovidos_lote,
  (SELECT count(*) FROM public.mem_grupo_membros
    WHERE funcao = 'visitante' AND saiu_em IS NULL AND deleted_at IS NULL)       AS visitantes_agora,
  (SELECT count(*) FROM public.mem_grupo_membros
    WHERE funcao = 'frequentador' AND saiu_em IS NULL AND deleted_at IS NULL)    AS participantes_agora;

-- ============================================================================
-- ⏳ PENDENTE DE GENTE (não é código · não entra aqui):
--
-- Thatianna Almeida Lage tem vínculo ATIVO em "GRUPO DE CONEXÃO - RECREIO" e o
-- pedido dela nunca foi aprovado. A função foi corrigida acima; o que sobra é a
-- triagem decidir o pedido. Pra ver em que estado ele está:
--
--   SELECT p.status, p.created_at, p.decidido_por_nome, p.observacao
--     FROM public.mem_grupo_pedidos p
--     JOIN public.mem_membros m ON m.id = p.membro_id
--    WHERE m.nome ILIKE '%Thatianna Almeida Lage%';
-- ============================================================================

-- ============================================================================
-- ROLLBACK:
--
--   UPDATE public.mem_grupo_membros gm
--      SET funcao = b.funcao_antiga::public.grupo_funcao
--     FROM public._bk_20260814_grupo_funcao_visitante_lote b
--    WHERE gm.id = b.id;
-- ============================================================================

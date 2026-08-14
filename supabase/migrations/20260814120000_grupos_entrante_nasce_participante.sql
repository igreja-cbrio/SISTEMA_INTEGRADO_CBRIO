-- ============================================================================
-- Grupos · quem ENTRA num grupo nasce PARTICIPANTE, não visitante
-- ============================================================================
-- Pedido do Matheus (13/08/2026), olhando a aba Pessoas: "por que a maioria das
-- pessoas são classificadas como visitantes e não como membros? Se elas estão em
-- grupo de conexão, se inscreveram em grupo de conexão, elas são membros."
--
-- ⚠️⚠️ ISTO REVERTE `20260620150000_grupos_novo_entrante_visitante.sql`, que foi
-- pedido do MARCOS em 20/06 ("quem entra num grupo começa como visitante e vira
-- membro no 4º check-in"). O Matheus foi avisado disso e reafirmou. Registrado
-- aqui pra ninguém tratar como bug e reverter de volta sem falar com os dois.
--
-- POR QUE o sintoma apareceu agora: a promoção visitante → frequentador só
-- acontece quando alguém LANÇA CHAMADA (`fn_grupo_auto_membro`, presencas >= 1).
-- A T2 abriu em 01/08 e quase nenhum grupo lançou chamada ainda — então todo
-- vínculo criado depois de 20/06 continua 'visitante' até hoje. Na aba Pessoas
-- isso aparece como "Visitante" na coluna Função E como "Sem chamada ainda" na
-- coluna Status: dois sintomas da MESMA causa.
--
-- ⚠️ O SINAL NÃO SE PERDE. "Quais grupos não estão lançando chamada" continua
-- visível — é a coluna Status de frequência, que é onde essa pergunta mora. O
-- que muda é parar de responder essa pergunta na coluna de PAPEL, que é sobre
-- outra coisa.
--
-- Semântica nova: `visitante` passa a ser DECLARADO, nunca presumido. Só nasce
-- visitante quem o líder registra como visitante do encontro (o
-- `POST /public/grupos/encontro/visitante`, que seta a função explicitamente).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) DEFAULT volta a 'frequentador'
--
-- Isso cobre de uma vez as TRÊS portas que inserem sem setar `funcao`:
--   · aprovação do pedido        (routes/grupos.js · aprovarPedidoCore)
--   · adicionar membro à mão     (POST /grupos/:id/membros)
--   · import da planilha         (services/gruposImporter.js)
-- As duas que setam explicitamente NÃO são afetadas: o visitante do encontro
-- (publicGrupos.js · 'visitante') e o vínculo de líder/anfitrião.
-- ----------------------------------------------------------------------------
ALTER TABLE public.mem_grupo_membros
  ALTER COLUMN funcao SET DEFAULT 'frequentador';

COMMENT ON COLUMN public.mem_grupo_membros.funcao IS
  'Papel no grupo. Quem entra (pedido aprovado, adição manual, import) nasce '
  'frequentador — estar no grupo de conexão já é participar (Matheus, 13/08/2026, '
  'revertendo o default visitante de 20/06). `visitante` é DECLARADO: só o '
  'registro de visitante do encontro o usa. Líder/co-líder/treinamento/supervisor/'
  'coordenador continuam explícitos.';

-- ----------------------------------------------------------------------------
-- 2) Backup ANTES de tocar (desfaz com o UPDATE do rodapé)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bk_20260814_grupo_funcao_visitante (
  id            uuid PRIMARY KEY,
  grupo_id      uuid,
  membro_id     uuid,
  funcao_antiga text,
  presencas     integer,
  entrou_em     date,
  snapshot_em   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._bk_20260814_grupo_funcao_visitante
  (id, grupo_id, membro_id, funcao_antiga, presencas, entrou_em)
SELECT gm.id, gm.grupo_id, gm.membro_id, gm.funcao::text, gm.presencas, gm.entrou_em
  FROM public.mem_grupo_membros gm
 WHERE gm.funcao = 'visitante'
   AND gm.saiu_em IS NULL
   AND gm.deleted_at IS NULL
   -- ⚠️ SÓ quem passou pela porta de inscrição. É a frase literal do pedido
   -- ("se INSCREVERAM em grupo de conexão"), e é o que separa o inscrito do
   -- visitante que apareceu num encontro sem se inscrever — esse continua
   -- visitante, que é o que ele é.
   AND EXISTS (
     SELECT 1 FROM public.mem_grupo_pedidos p
      WHERE p.membro_id = gm.membro_id
        AND p.grupo_id  = gm.grupo_id
        AND p.status    = 'aprovado'
   )
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3) Promove exatamente o que foi para o backup
-- ----------------------------------------------------------------------------
UPDATE public.mem_grupo_membros
   SET funcao = 'frequentador'
 WHERE id IN (SELECT id FROM public._bk_20260814_grupo_funcao_visitante)
   AND funcao = 'visitante';

COMMIT;

-- ============================================================================
-- CONFERÊNCIA — rode este SELECT e me mande o resultado.
--
-- ⚠️ Não usei RAISE NOTICE de propósito: o SQL Editor do Supabase não mostra
-- notice (lição registrada no CLAUDE.md). Isto volta como tabela.
--
-- `restantes_sem_pedido` = pessoas que estão no roster como visitante e NÃO têm
-- pedido aprovado (vieram do import antigo, de adição manual anterior, ou são
-- visitante de encontro de verdade). NÃO foram tocadas — é com esse número que
-- se decide se vale uma segunda leva.
-- ============================================================================
SELECT
  (SELECT count(*) FROM public._bk_20260814_grupo_funcao_visitante) AS promovidos,
  (SELECT count(*) FROM public.mem_grupo_membros
    WHERE funcao = 'visitante' AND saiu_em IS NULL AND deleted_at IS NULL)  AS restantes_sem_pedido,
  (SELECT count(DISTINCT membro_id) FROM public.mem_grupo_membros
    WHERE funcao = 'visitante' AND saiu_em IS NULL AND deleted_at IS NULL)  AS pessoas_restantes,
  (SELECT count(*) FROM public.mem_grupo_membros
    WHERE funcao = 'frequentador' AND saiu_em IS NULL AND deleted_at IS NULL) AS participantes_agora;

-- ============================================================================
-- ROLLBACK (se precisar desfazer):
--
--   UPDATE public.mem_grupo_membros gm
--      SET funcao = b.funcao_antiga::public.grupo_funcao
--     FROM public._bk_20260814_grupo_funcao_visitante b
--    WHERE gm.id = b.id;
--   ALTER TABLE public.mem_grupo_membros ALTER COLUMN funcao SET DEFAULT 'visitante';
-- ============================================================================

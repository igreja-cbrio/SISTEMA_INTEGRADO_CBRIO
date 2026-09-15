-- ─────────────────────────────────────────────────────────────────────────────
-- Seja Membro · carta de transferência + de qual igreja a pessoa está vindo
-- (pedido do Pr. Nélio via Marcos · 2026-09-15)
--
-- Aditiva e idempotente: duas colunas nullable em cada tabela, sem CHECK, sem
-- FK, sem default. Nada existente lê essas colunas, então aplicar antes ou
-- depois do deploy é indiferente para o que já está no ar (o código tolera a
-- ausência: a porta pública só inclui a coluna no INSERT quando a pessoa
-- responde, e a aprovação já remove coluna ausente do patch e retenta).
--
-- ⚠️⚠️ ISTO NÃO É `batizado_outra_igreja` / `igreja_batismo_anterior`, e a
-- distinção é o motivo de existirem colunas próprias em vez de reúso:
--
--   igreja_batismo_anterior  = ONDE a pessoa foi BATIZADA (fato do passado,
--                              vem do app de membros · 5 pessoas em 15/09)
--   igreja_anterior          = DE ONDE ela está VINDO agora (a igreja que ela
--                              deixou para se tornar membro daqui)
--
-- Quem foi batizada na igreja X, passou anos na Y e chega aqui vindo da Y tem
-- as duas respostas DIFERENTES. Gravar uma na coluna da outra registraria um
-- fato falso sobre o batismo dela — e batismo alimenta a trilha e a NSM.
--
-- ⚠️ O NOME das colunas é IGUAL nas duas tabelas de propósito: `cadFields` em
-- `routes/membresia.js` (a lista que a aprovação propaga do cadastro pendente
-- para `mem_membros`) monta o patch com as MESMAS chaves dos dois lados. Nome
-- diferente faria a propagação falhar em silêncio.
--
-- ⚠️⚠️ CARTA DE TRANSFERÊNCIA DECLARADA NÃO FAZ NINGUÉM MEMBRO. É o mesmo
-- princípio já registrado no vínculo autodeclarado do censo: quem decide
-- membresia é a igreja (`mem_membros.status` continua intocado por esta porta).
-- A pessoa DECLARA que traz a carta; a equipe confere o documento e decide.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS carta_transferencia boolean,
  ADD COLUMN IF NOT EXISTS igreja_anterior     text;

ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS carta_transferencia boolean,
  ADD COLUMN IF NOT EXISTS igreja_anterior     text;

COMMENT ON COLUMN public.mem_cadastros_pendentes.carta_transferencia IS
  'Declarado no formulário público "Seja membro" (2026-09-15): a pessoa diz que está vindo de outra igreja COM carta de transferência. Autodeclaração — NÃO define membresia (quem decide é a igreja, conferindo o documento). Gravado só quando marcado; NULL = não respondeu.';

COMMENT ON COLUMN public.mem_cadastros_pendentes.igreja_anterior IS
  'Igreja de onde a pessoa está VINDO, como ela escreveu. ⚠️ NÃO confundir com mem_membros.igreja_batismo_anterior, que é onde ela foi BATIZADA — podem ser igrejas diferentes.';

COMMENT ON COLUMN public.mem_membros.carta_transferencia IS
  'Veio de outra igreja com carta de transferência (autodeclarado na porta pública e propagado na aprovação, via cadFields). ⚠️ Não é status de membresia: quem define mem_membros.status é a igreja.';

COMMENT ON COLUMN public.mem_membros.igreja_anterior IS
  'Igreja de onde a pessoa veio ao se tornar membro daqui. ⚠️ DIFERENTE de igreja_batismo_anterior (onde foi batizada) — quem foi batizado em X e passou por Y antes de chegar aqui tem as duas respostas diferentes.';

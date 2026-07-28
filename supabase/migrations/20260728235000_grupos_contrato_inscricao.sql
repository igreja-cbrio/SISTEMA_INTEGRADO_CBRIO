-- Porta 7 · Grupos entra no Contrato de Inscrição (F3.1 · PR 7 · M5)
-- Specs: docs/modulo-inscricoes/. Tabela ÚNICA (mem_grupo_pedidos) → 1 colagem.
-- Se falhar com "lock timeout": rodar de novo (idempotente).
SET lock_timeout = '10s';

-- 1) Telefone digits-only nos pedidos legados (a porta gravava MASCARADO).
--    BACKUP prévio dos valores originais (princípio "nada se perde");
--    o contato_divergente já normaliza os dois lados na comparação, então o
--    resultado dele não muda (verificado em grupos.js:1283-1286).
CREATE TABLE IF NOT EXISTS public._bk_20260728_grupo_pedidos_telefone AS
  SELECT id, telefone FROM public.mem_grupo_pedidos
  WHERE telefone IS NOT NULL AND telefone ~ '\D';

UPDATE public.mem_grupo_pedidos
   SET telefone = NULLIF(regexp_replace(telefone, '\D', '', 'g'), '')
 WHERE telefone IS NOT NULL AND telefone ~ '\D';

-- 2) CHECK de origem ganha app|totem|mapa. Isso DESTRAVA o fanout do app
--    (fn_app_inscricoes_fanout · 20260604030000), que desde sempre falhava em
--    silêncio ao inserir origem='app'. Validado antes de liberar: o insert do
--    fanout preenche membro_id (usuário do app é membro) → satisfaz o XOR
--    chk_pedido_um_solicitante; nome/telefone também vão preenchidos.
--    Limitação conhecida: pedido via app NÃO dispara notificação/WhatsApp pro
--    líder (é trigger SQL, não a rota) — aparece normalmente na caixa de
--    entrada; melhorar é follow-up do módulo de Comunicação.
ALTER TABLE public.mem_grupo_pedidos DROP CONSTRAINT IF EXISTS mem_grupo_pedidos_origem_check;
ALTER TABLE public.mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_origem_check
  CHECK (origem IN ('cadastro_interno','formulario_publico','manual','app','totem','mapa'));

COMMENT ON TABLE public._bk_20260728_grupo_pedidos_telefone IS
  'Backup pré-backfill (telefones mascarados de mem_grupo_pedidos · Contrato de Inscrição porta 7). Dropar numa limpeza futura com aval.';

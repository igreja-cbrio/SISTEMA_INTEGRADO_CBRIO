-- ============================================================================
-- Grupos · recusa do líder DEVOLVE o pedido pra triagem (Marcos · 2026-07-13)
--
-- Novo status 'devolvido' em mem_grupo_pedidos: quando o líder recusa, o
-- pedido NÃO encerra — cai na fila da liderança de grupos (triagem) pra
-- sugerir outro grupo à pessoa. O motivo escrito pelo líder é INTERNO (a
-- pessoa nunca recebe); ela é comunicada quando a triagem sugere outro grupo,
-- com o motivo externo escolhido pela triagem. Rejeição FINAL ('rejeitado')
-- passa a ser ação da triagem sobre um pedido devolvido.
--
-- Aditiva e idempotente (recria a CHECK com o valor novo).
-- ============================================================================

ALTER TABLE public.mem_grupo_pedidos DROP CONSTRAINT IF EXISTS mem_grupo_pedidos_status_check;
ALTER TABLE public.mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_status_check
  CHECK (status IN ('pendente', 'devolvido', 'aprovado', 'rejeitado', 'cancelado'));

COMMENT ON COLUMN public.mem_grupo_pedidos.status IS
  'pendente → (líder recusa) devolvido → (triagem) sugere outro grupo OU rejeitado final · aprovado · cancelado';

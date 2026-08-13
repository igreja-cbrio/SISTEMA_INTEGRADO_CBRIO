-- Inscrição de CASAL em grupo de conexão (Marcos · 2026-07-30)
-- Nos grupos com mem_grupos.categoria = 'Casais' o formulário público
-- (/inscricao-grupos) inscreve os DOIS cônjuges numa tela só. Contrato de
-- porta: cada cônjuge continua sendo UM cadastro próprio (mem_membros ou
-- mem_cadastros_pendentes) e UM pedido próprio em mem_grupo_pedidos — NUNCA
-- "um pedido com dois nomes num campo de texto".
--
-- O que esta migration adiciona é só o VÍNCULO entre os dois pedidos:
-- casal_pedido_id é auto-referência e os dois pedidos apontam um pro outro
-- (vínculo CRUZADO), então qualquer um dos dois links de aprovação do WhatsApp
-- acha o par e decide os dois de uma vez (aprovar aprova o casal, recusar
-- devolve o casal pra triagem).
--
-- ADITIVA e idempotente. Nada destrutivo, nenhuma tabela nova, nenhuma
-- policy alterada (mem_grupo_pedidos já está sob RLS contextual do módulo
-- grupos + service_role; a coluna nova não muda quem lê ou escreve).
-- Se falhar com "lock timeout": rodar de novo.
SET lock_timeout = '10s';

-- 1) Coluna do vínculo (ON DELETE SET NULL: apagar um pedido nunca leva o par
--    embora — o outro cônjuge fica válido, só perde a referência).
ALTER TABLE public.mem_grupo_pedidos
  ADD COLUMN IF NOT EXISTS casal_pedido_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.mem_grupo_pedidos'::regclass
       AND conname  = 'mem_grupo_pedidos_casal_pedido_id_fkey'
  ) THEN
    ALTER TABLE public.mem_grupo_pedidos
      ADD CONSTRAINT mem_grupo_pedidos_casal_pedido_id_fkey
      FOREIGN KEY (casal_pedido_id)
      REFERENCES public.mem_grupo_pedidos(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2) Índice PARCIAL: só a fração de pedidos que é de casal (a leitura sempre
--    parte de um pedido específico procurando o par).
CREATE INDEX IF NOT EXISTS idx_mem_grupo_pedidos_casal
  ON public.mem_grupo_pedidos (casal_pedido_id)
  WHERE casal_pedido_id IS NOT NULL;

COMMENT ON COLUMN public.mem_grupo_pedidos.casal_pedido_id IS
  'Inscrição em PAR de grupo de casais (mem_grupos.categoria = ''Casais''): aponta pro pedido do outro cônjuge, inscrito na mesma tela do formulário público. O vínculo é cruzado (os dois pedidos apontam um pro outro), então qualquer um dos dois links de aprovação do líder decide o casal de uma vez. NULL = inscrição individual (o caso normal). Cada cônjuge tem cadastro e pedido próprios — esta coluna é só o vínculo.';

-- ============================================================================
-- Grupos · "co-líder" MORRE + transferência sem destino (Marcos · 25/08/2026)
--
-- Pedido dele, avaliando a tela de grupos do app:
--   1. "nós não usamos o termo co-líder, pode excluir esse termo, se alguém
--      estiver com essa categoria, coloque para líder em treinamento e exclua";
--   2. "quero que quem for líder em treinamento também possa gerenciar grupo";
--   3. "sobre a opção de transferência eu quero que o líder de grupo NÃO
--      escolha para onde ele está transferindo, eu quero que ele aperte e
--      solicite transferência, isso vai para caixa de entradas como pendente
--      para Naná gerenciar".
--
-- MEDIDO EM PRODUÇÃO ANTES DE ESCREVER ISTO (25/08/2026, base inteira de
-- `mem_grupo_membros` = 3.077 linhas):
--   · vínculos VIVOS: frequentador 1.291 · lider 20 · visitante 5 · co_lider 1
--   · vínculos ENCERRADOS: frequentador 1.087 · visitante 672 · lider 1
--   · `co_lider`: 1 linha, 1 pessoa, 1 grupo — e o grupo é o "T2-2026-022"
--     chamado **Teste**. ZERO co_lider históricos.
--   · `lider_treinamento`: 0 linhas (o valor já existe no enum desde 13/05,
--     nunca foi usado).
-- Ou seja: o termo que estamos matando não tem uso real. O UPDATE abaixo toca
-- 1 linha. O trabalho de verdade é fechar a porta pra ele não voltar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Os co-líderes viram líderes em treinamento
-- ----------------------------------------------------------------------------
-- ⚠️ SEM filtro de `saiu_em`/`deleted_at` de propósito: o termo tem que sair do
-- histórico também, senão a tela de "entradas e saídas" e o relatório de
-- vínculos duplicados continuam escrevendo "Co-líder" pra sempre.
UPDATE public.mem_grupo_membros
   SET funcao = 'lider_treinamento'
 WHERE funcao = 'co_lider';

-- ----------------------------------------------------------------------------
-- 2. A porta fecha: `co_lider` não pode mais ser gravado
-- ----------------------------------------------------------------------------
-- ⚠️⚠️ POR QUE UM CHECK, e não `DROP VALUE` no enum: **Postgres não remove
-- valor de enum**. Recriar o tipo `grupo_funcao` sem ele exigiria derrubar a
-- coluna (e o índice parcial, e as views que a leem) num módulo em produção com
-- 1.317 vínculos vivos — risco desproporcional para apagar uma palavra.
-- O CHECK entrega o que foi pedido (o valor deixa de existir na prática, o
-- banco recusa quem tentar) por um custo próximo de zero, e é reversível.
ALTER TABLE public.mem_grupo_membros
  DROP CONSTRAINT IF EXISTS chk_grupo_membros_sem_colider;
ALTER TABLE public.mem_grupo_membros
  ADD CONSTRAINT chk_grupo_membros_sem_colider
  CHECK (funcao <> 'co_lider'::public.grupo_funcao);

COMMENT ON COLUMN public.mem_grupo_membros.funcao IS
  'Papel da pessoa no grupo · alimenta KPIs de liderança. '
  'GERENCIA O GRUPO: lider e lider_treinamento (Marcos · 25/08/2026). '
  'co_lider está APOSENTADO — o valor segue no enum porque Postgres não '
  'remove valor de enum, mas o CHECK chk_grupo_membros_sem_colider recusa '
  'gravá-lo. Quem era co-líder virou lider_treinamento.';

-- ----------------------------------------------------------------------------
-- 3. Transferência PEDIDA pelo líder, sem destino
-- ----------------------------------------------------------------------------
-- ⚠️⚠️ POR QUE TABELA NOVA, e não `mem_grupo_pedidos`: pedido é "quero entrar
-- NESTE grupo" — ele exige `grupo_id` e o índice único dele é (grupo, membro).
-- A transferência que o Marcos pediu nasce **sem destino**: é o líder dizendo
-- "esta pessoa não é do meu grupo, alguém decide pra onde ela vai". Enfiar isso
-- em `mem_grupo_pedidos` com o grupo de ORIGEM no `grupo_id` faria a fila do
-- próprio líder mostrar um pedido de entrar num grupo onde a pessoa já está —
-- e a Caixa de entrada contaria isso como demanda de inscrição nos KPIs.
--
-- ⚠️ O fluxo ANTIGO (o líder escolhia o destino e nascia um pedido no grupo de
-- lá) morre com isto. Ele tinha **zero uso histórico** — medido em 10/08 e
-- reconferido agora: nenhuma linha de `mem_grupo_pedidos` com observação de
-- transferência. Não há dado velho pra migrar.
CREATE TABLE IF NOT EXISTS public.mem_grupo_transferencias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id      UUID NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  -- De onde o líder está pedindo pra tirar a pessoa.
  grupo_origem_id UUID NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,
  -- A LINHA do roster que motivou o pedido (some da mão da triagem se a pessoa
  -- sair por outro caminho). Sem FK dura: o vínculo pode ser encerrado e a
  -- transferência continua sendo um fato pedido.
  vinculo_id     UUID,
  motivo         TEXT,
  -- 'pendente' = na Caixa de entrada, esperando a coordenação.
  -- 'concluida' = a coordenação resolveu (pôs no grupo novo / na fila).
  -- 'recusada'  = a coordenação decidiu que a pessoa fica onde está.
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'concluida', 'recusada')),
  -- ⚠️ O destino entra na RESOLUÇÃO, nunca no pedido. É o ponto todo da mudança.
  grupo_destino_id UUID REFERENCES public.mem_grupos(id) ON DELETE SET NULL,
  -- Quem pediu (o líder, pelo app) — snapshot de nome porque em 86 dos 102
  -- grupos ativos o líder não tem login no ERP.
  pedido_por      UUID,
  pedido_por_nome TEXT,
  origem          TEXT NOT NULL DEFAULT 'app',
  -- Quem triou, quando e o que escreveu.
  resolvido_por      UUID,
  resolvido_por_nome TEXT,
  resolvido_em       TIMESTAMPTZ,
  resolucao_obs      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Concluída/recusada PRECISA de data de resolução; pendente não pode ter.
  CONSTRAINT chk_grupo_transf_coerente CHECK (
    (status = 'pendente' AND resolvido_em IS NULL)
    OR (status <> 'pendente' AND resolvido_em IS NOT NULL)
  )
);

-- ⚠️ SEM `deleted_at`, e FORA da whitelist de soft-delete — mesma razão da
-- tabela irmã `mem_grupo_agenda_excecoes`: não guarda PII (é membro_id + status)
-- e "desfazer" aqui tem nome próprio, que é `status='recusada'`. Coluna de
-- soft-delete só criaria um segundo jeito de a linha desaparecer que todo leitor
-- teria que lembrar de filtrar.

-- ⚠️ UM pedido PENDENTE por pessoa+origem: o líder tocando duas vezes no botão
-- não pode virar duas linhas na mão da Naná. Índice PARCIAL — o histórico de
-- transferências já resolvidas da mesma pessoa continua podendo empilhar.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_grupo_transf_pendente
  ON public.mem_grupo_transferencias (membro_id, grupo_origem_id)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_grupo_transf_fila
  ON public.mem_grupo_transferencias (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grupo_transf_origem
  ON public.mem_grupo_transferencias (grupo_origem_id, status);

ALTER TABLE public.mem_grupo_transferencias ENABLE ROW LEVEL SECURITY;

-- Leitura: quem enxerga grupos (nível 1) — a Caixa de entrada é tela de nível 1.
DROP POLICY IF EXISTS mem_grupo_transferencias_select ON public.mem_grupo_transferencias;
CREATE POLICY mem_grupo_transferencias_select ON public.mem_grupo_transferencias
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('grupos') >= 1);

-- Escrita: triagem (nível 3). O app escreve por service_role no backend, que
-- aplica o MESMO gate de "gerencia o grupo".
DROP POLICY IF EXISTS mem_grupo_transferencias_write ON public.mem_grupo_transferencias;
CREATE POLICY mem_grupo_transferencias_write ON public.mem_grupo_transferencias
  FOR ALL TO authenticated
  USING (public.current_user_module_level('grupos') >= 3)
  WITH CHECK (public.current_user_module_level('grupos') >= 3);

DROP POLICY IF EXISTS mem_grupo_transferencias_service ON public.mem_grupo_transferencias;
CREATE POLICY mem_grupo_transferencias_service ON public.mem_grupo_transferencias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tirar alguém de um grupo é decisão que a coordenação vai querer rastrear.
DROP TRIGGER IF EXISTS trg_audit_grupo_transferencias ON public.mem_grupo_transferencias;
CREATE TRIGGER trg_audit_grupo_transferencias
AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupo_transferencias
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,grupo_destino_id,motivo,resolucao_obs,resolvido_por_nome'
);

COMMENT ON TABLE public.mem_grupo_transferencias IS
  'Transferência PEDIDA pelo líder, SEM destino (Marcos · 25/08/2026): o líder '
  'aperta "Solicitar transferência" no app e a linha cai pendente na Caixa de '
  'entrada do /grupos pra coordenação decidir pra onde. O destino só existe na '
  'RESOLUÇÃO (grupo_destino_id). NÃO usa mem_grupo_pedidos: pedido é "quero '
  'entrar neste grupo" e exige grupo_id.';

-- Conferência (o SQL Editor não mostra RAISE NOTICE):
--   select funcao, count(*) from mem_grupo_membros group by 1 order by 2 desc;
--     -- esperado: NENHUMA linha co_lider
--   select conname from pg_constraint where conname = 'chk_grupo_membros_sem_colider';
--   select column_name, data_type from information_schema.columns
--    where table_name = 'mem_grupo_transferencias' order by ordinal_position;
--   select polname from pg_policies where tablename = 'mem_grupo_transferencias';
--   -- e a trava, que deve FALHAR:
--   -- update mem_grupo_membros set funcao='co_lider' where id = (select id from mem_grupo_membros limit 1);

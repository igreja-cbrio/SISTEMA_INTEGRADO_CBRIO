-- Caixa de entrada do Cuidados · tabela canônica de PEDIDOS de cuidado · 2026-07-22.
-- A aba "Aconselhamento" vira "Caixa de entrada": todo pedido de cuidado
-- (aconselhamento, capelania, oração, SOS, visita) chega aqui. Canais:
--   app        · já existe via app_inscricoes (a Caixa lê de lá também)
--   whatsapp   · sistema do Matheus escreve via registrarPedidoCuidado()
--   plataforma · formulários/ações do ERP escrevem via registrarPedidoCuidado()
--   manual     · líder registra na própria Caixa
-- Esta é a tabela CANÔNICA + o contrato (backend/services/cuidadosPedidos.js
-- `registrarPedidoCuidado`). Ao ATENDER um pedido, o líder escolhe o tipo de
-- atendimento/visita → cria o atendimento na TRILHA da pessoa (cui_visitas ou
-- cui_acompanhamentos) e o pedido guarda atendimento_ref.
CREATE TABLE IF NOT EXISTS public.cui_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL DEFAULT 'manual' CHECK (canal IN ('app', 'whatsapp', 'plataforma', 'manual')),
  tipo text NOT NULL DEFAULT 'outro' CHECK (tipo IN ('aconselhamento', 'capelania', 'oracao', 'sos', 'visita', 'outro')),
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome text,
  telefone text,
  email text,
  mensagem text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluido')),
  atribuido_a uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  origem_ref jsonb,        -- referência à origem (ex.: {wa_conversa_id}, {form})
  atendimento_ref jsonb,   -- {tabela:'cui_visitas'|'cui_acompanhamentos', id} quando atendido
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tratado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tratado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cui_pedidos_fila
  ON public.cui_pedidos (status, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE public.cui_pedidos ENABLE ROW LEVEL SECURITY;
-- Acesso pela API (service_role bypassa). Leitura/escrita direta só p/ Cuidados.
CREATE POLICY cui_pedidos_sel ON public.cui_pedidos FOR SELECT TO authenticated
  USING (public.current_user_module_level('cuidados') >= 1);
CREATE POLICY cui_pedidos_ins ON public.cui_pedidos FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('cuidados') >= 2);
CREATE POLICY cui_pedidos_upd ON public.cui_pedidos FOR UPDATE TO authenticated
  USING (public.current_user_module_level('cuidados') >= 3)
  WITH CHECK (public.current_user_module_level('cuidados') >= 3);
CREATE POLICY cui_pedidos_del ON public.cui_pedidos FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY cui_pedidos_srv ON public.cui_pedidos FOR ALL TO service_role USING (true) WITH CHECK (true);

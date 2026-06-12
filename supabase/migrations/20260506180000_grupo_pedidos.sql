-- Pedidos de inscricao em grupo de conexao.
--
-- Fluxo:
-- 1) Pessoa pede pra entrar num grupo (via cadastro de membresia OU formulario publico).
-- 2) Lider do grupo recebe notificacao com info da pessoa.
-- 3) Lider aprova → cria mem_grupo_membros + notifica a pessoa.
-- 4) Lider rejeita → registra motivo + notifica a pessoa.
--
-- Suporta tanto membros ja cadastrados (membro_id) quanto cadastros pendentes
-- ainda no funil (cadastro_pendente_id), pra cobrir o fluxo publico onde a
-- pessoa preenche o formulario antes de virar membro.

CREATE TABLE IF NOT EXISTS public.mem_grupo_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,

  -- Quem pediu — exatamente um destes deve estar preenchido
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  cadastro_pendente_id uuid REFERENCES public.mem_cadastros_pendentes(id) ON DELETE CASCADE,

  -- Snapshot de contato (preenchido ate quando o membro vira mem_membros)
  nome text NOT NULL,
  email text,
  telefone text,

  origem text NOT NULL DEFAULT 'cadastro_interno' CHECK (origem IN ('cadastro_interno', 'formulario_publico', 'manual')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'cancelado')),
  motivo_rejeicao text,
  observacao text,

  decidido_por uuid REFERENCES auth.users(id),
  decidido_por_nome text,
  decidido_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_pedido_um_solicitante CHECK (
    (membro_id IS NOT NULL AND cadastro_pendente_id IS NULL) OR
    (membro_id IS NULL AND cadastro_pendente_id IS NOT NULL)
  )
);

ALTER TABLE public.mem_grupo_pedidos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read mem_grupo_pedidos" ON public.mem_grupo_pedidos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated write mem_grupo_pedidos" ON public.mem_grupo_pedidos FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated update mem_grupo_pedidos" ON public.mem_grupo_pedidos FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated delete mem_grupo_pedidos" ON public.mem_grupo_pedidos FOR DELETE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tambem permitir INSERT anonimo via service role (para o formulario publico).
DO $$ BEGIN
  CREATE POLICY "Anon insert mem_grupo_pedidos" ON public.mem_grupo_pedidos FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_mem_grupo_pedidos_grupo ON public.mem_grupo_pedidos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_mem_grupo_pedidos_membro ON public.mem_grupo_pedidos(membro_id) WHERE membro_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupo_pedidos_cadastro ON public.mem_grupo_pedidos(cadastro_pendente_id) WHERE cadastro_pendente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupo_pedidos_status ON public.mem_grupo_pedidos(status);

-- Garante que so existe UM pedido pendente por (grupo, membro)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pedido_pendente_membro
  ON public.mem_grupo_pedidos(grupo_id, membro_id)
  WHERE status = 'pendente' AND membro_id IS NOT NULL;

-- Mesmo principio pra cadastro pendente
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pedido_pendente_cadastro
  ON public.mem_grupo_pedidos(grupo_id, cadastro_pendente_id)
  WHERE status = 'pendente' AND cadastro_pendente_id IS NOT NULL;

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at_pedido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.mem_grupo_pedidos;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.mem_grupo_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at_pedido();

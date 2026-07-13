-- ============================================================================
-- Grupos · status dinâmico do pedido + linha do tempo (Marcos · 2026-07-13)
--
-- O pedido ganha o status 'encaminhado' (a triagem sugeriu outro grupo e a
-- pessoa foi avisada no WhatsApp) e uma tabela de EVENTOS imutáveis — o
-- histórico que aparece ao clicar na pessoa na caixa de entrada:
--   criado → recusado_lider → encaminhado → aprovado / rejeitado_final /
--   resolvido_outro_grupo (a pessoa foi aprovada em outro pedido dela).
--
-- ⚠️ Colunas sugerido_grupo_id / resolvido_grupo_id são uuid SEM FOREIGN KEY
-- de propósito: uma segunda FK de mem_grupo_pedidos → mem_grupos criaria
-- ambiguidade de embed no PostgREST (o `mem_grupos(...)` do código em
-- produção passaria a exigir hint) e quebraria a caixa de entrada no
-- intervalo entre aplicar a migration e o deploy. Os NOMES dos grupos ficam
-- snapshotados no detalhe dos eventos — integridade referencial não é
-- necessária aqui.
--
-- Aditiva e idempotente.
-- ============================================================================

ALTER TABLE public.mem_grupo_pedidos DROP CONSTRAINT IF EXISTS mem_grupo_pedidos_status_check;
ALTER TABLE public.mem_grupo_pedidos ADD CONSTRAINT mem_grupo_pedidos_status_check
  CHECK (status IN ('pendente', 'devolvido', 'encaminhado', 'aprovado', 'rejeitado', 'cancelado'));

ALTER TABLE public.mem_grupo_pedidos ADD COLUMN IF NOT EXISTS sugerido_grupo_id uuid;
ALTER TABLE public.mem_grupo_pedidos ADD COLUMN IF NOT EXISTS sugerido_em timestamptz;
ALTER TABLE public.mem_grupo_pedidos ADD COLUMN IF NOT EXISTS sugerido_por_nome text;
ALTER TABLE public.mem_grupo_pedidos ADD COLUMN IF NOT EXISTS resolvido_grupo_id uuid;

COMMENT ON COLUMN public.mem_grupo_pedidos.status IS
  'pendente → (líder recusa) devolvido → (triagem sugere) encaminhado → aprovado/rejeitado · cancelado (resolvido_grupo_id set = aprovada em outro grupo)';
COMMENT ON COLUMN public.mem_grupo_pedidos.resolvido_grupo_id IS
  'Preenchido quando o pedido fechou porque a PESSOA foi aprovada em OUTRO pedido (grupo em que ela de fato entrou)';

CREATE TABLE IF NOT EXISTS public.mem_grupo_pedido_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.mem_grupo_pedidos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  autor_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido
  ON public.mem_grupo_pedido_eventos (pedido_id, created_at);

ALTER TABLE public.mem_grupo_pedido_eventos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mem_grupo_pedido_eventos' AND policyname = 'pedido_eventos_select'
  ) THEN
    CREATE POLICY pedido_eventos_select ON public.mem_grupo_pedido_eventos
      FOR SELECT TO authenticated
      USING (public.is_super_admin() OR public.current_user_module_level('grupos') >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mem_grupo_pedido_eventos' AND policyname = 'pedido_eventos_service'
  ) THEN
    CREATE POLICY pedido_eventos_service ON public.mem_grupo_pedido_eventos
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.mem_grupo_pedido_eventos IS
  'Linha do tempo imutável do pedido de grupo (criado/recusado_lider/encaminhado/aprovado/rejeitado_final/resolvido_outro_grupo/cancelado)';

-- ── Backfill: todo pedido existente ganha o evento "criado" e, se já foi
-- decidido, o evento terminal correspondente (datas reais preservadas) ──
INSERT INTO public.mem_grupo_pedido_eventos (pedido_id, tipo, detalhe, autor_nome, created_at)
SELECT p.id, 'criado',
       jsonb_build_object('grupo', g.nome, 'origem', p.origem),
       NULL, p.created_at
FROM public.mem_grupo_pedidos p
LEFT JOIN public.mem_grupos g ON g.id = p.grupo_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.mem_grupo_pedido_eventos e WHERE e.pedido_id = p.id AND e.tipo = 'criado'
);

INSERT INTO public.mem_grupo_pedido_eventos (pedido_id, tipo, detalhe, autor_nome, created_at)
SELECT p.id,
       CASE p.status
         WHEN 'aprovado' THEN 'aprovado'
         WHEN 'rejeitado' THEN 'rejeitado_final'
         WHEN 'devolvido' THEN 'recusado_lider'
         WHEN 'cancelado' THEN 'cancelado'
       END,
       jsonb_build_object('grupo', g.nome)
         || CASE WHEN p.motivo_rejeicao IS NOT NULL THEN jsonb_build_object('motivo_interno', p.motivo_rejeicao) ELSE '{}'::jsonb END,
       p.decidido_por_nome,
       COALESCE(p.decidido_em, p.created_at)
FROM public.mem_grupo_pedidos p
LEFT JOIN public.mem_grupos g ON g.id = p.grupo_id
WHERE p.status IN ('aprovado', 'rejeitado', 'devolvido', 'cancelado')
  AND NOT EXISTS (
    SELECT 1 FROM public.mem_grupo_pedido_eventos e WHERE e.pedido_id = p.id AND e.tipo <> 'criado'
  );

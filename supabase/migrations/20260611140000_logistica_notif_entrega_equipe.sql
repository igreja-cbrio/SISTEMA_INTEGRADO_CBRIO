-- Notificações de logística → equipe (Amaury, Pery, Matheus, Marcos)
-- Semeia as regras de destinatário do módulo 'logistica' em notificacao_regras.
-- Vale pra "encomenda entregue" (ML) e também pros alertas de pedido atrasado /
-- solicitação pendente (que hoje caíam no fallback admin/diretor).
-- Idempotente. Recipientes podem ser ajustados depois em /admin/notificacao-regras.

INSERT INTO public.notificacao_regras (modulo, profile_id, ativo)
SELECT 'logistica', p.id, true
FROM public.profiles p
WHERE p.active = true
  AND (
    lower(p.email) IN (
      'pery.case@cbrio.org',
      'matheus.toscano@cbrio.org',
      'matheus@cbrio.com.br',
      'marcos@cbrio.com',
      'marcospaulo.almeida@cbrio.org'
    )
    OR p.name ILIKE 'amaury%'   -- Amaury de Araújo Junior (Coordenador de Operações)
  )
ON CONFLICT (modulo, profile_id) DO UPDATE SET ativo = true;

-- Escopo individual da aprovação financeira de Solicitações.
-- A área Financeiro continua definindo quem pode aprovar; quando uma pessoa tem
-- linhas nesta tabela, ela só pode visualizar, receber notificações e decidir
-- as categorias explicitamente liberadas. Sem linha, o comportamento atual é
-- preservado para os demais aprovadores.
--
-- Sem PII direta: guarda apenas profile_id e categoria; não requer soft-delete.
-- A migration falha se o perfil do Alberto não existir, para nunca liberar o
-- escopo amplo por uma configuração ausente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.solicitacoes_financeiro_aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN (
    'ti', 'compras', 'reembolso', 'reserva_espaco', 'espaco', 'infraestrutura',
    'hospitalidade', 'ferias', 'licenca', 'marketing', 'pagamento', 'servico',
    'producao', 'outro'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, categoria)
);

ALTER TABLE public.solicitacoes_financeiro_aprovadores
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON TABLE public.solicitacoes_financeiro_aprovadores IS
  'Escopo por pessoa e categoria para a fila de aprovação financeira de Solicitações.';

ALTER TABLE public.solicitacoes_financeiro_aprovadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sol_fin_aprovadores_select ON public.solicitacoes_financeiro_aprovadores;
CREATE POLICY sol_fin_aprovadores_select ON public.solicitacoes_financeiro_aprovadores
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS sol_fin_aprovadores_write ON public.solicitacoes_financeiro_aprovadores;
CREATE POLICY sol_fin_aprovadores_write ON public.solicitacoes_financeiro_aprovadores
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS sol_fin_aprovadores_service ON public.solicitacoes_financeiro_aprovadores;
CREATE POLICY sol_fin_aprovadores_service ON public.solicitacoes_financeiro_aprovadores
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS audit_solicitacoes_financeiro_aprovadores ON public.solicitacoes_financeiro_aprovadores;
CREATE TRIGGER audit_solicitacoes_financeiro_aprovadores
  AFTER INSERT OR UPDATE OR DELETE ON public.solicitacoes_financeiro_aprovadores
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- Alberto é o aprovador financeiro de Compras. A busca por e-mail evita fixar UUID.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE lower(email) = 'alberto.luiz@cbrio.com.br') <> 1 THEN
    RAISE EXCEPTION 'Perfil de Alberto Luiz não encontrado ou duplicado; a configuração financeira não foi aplicada.';
  END IF;
END $$;

INSERT INTO public.solicitacoes_financeiro_aprovadores (profile_id, categoria)
SELECT p.id, 'compras'
FROM public.profiles p
WHERE lower(p.email) = 'alberto.luiz@cbrio.com.br'
ON CONFLICT (profile_id, categoria) DO NOTHING;

-- Legado incompleto não fica preso na etapa financeira: volta para cotação até
-- Amaury registrar o valor real e reenviar a compra ao financeiro.
UPDATE public.solicitacoes
SET status = 'em_cotacao',
    cotacoes_email_em = NULL,
    cotacoes_email_por = NULL
WHERE categoria IN ('compras', 'servico')
  AND status = 'aguardando_aprovacao_financeira'
  AND aprovado_financeiro_em IS NULL
  AND deleted_at IS NULL
  AND (cotacao_em IS NULL OR valor_cotado IS NULL);

COMMIT;

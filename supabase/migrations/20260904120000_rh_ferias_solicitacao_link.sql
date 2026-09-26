-- Vincula o registro de férias/licença do RH (rh_ferias_licencas) à
-- Solicitação (categoria 'ferias'/'licenca') que o originou, quando lançado a
-- partir do backbone de Solicitações — em vez de o RH lançar direto na tela
-- de RH sem vínculo nenhum com o pedido.
--
-- Fecha o loop pedido pelo Matheus: a pessoa solicita pelas Solicitações →
-- aponta pro RH (registro real em rh_ferias_licencas, não só notificação) →
-- aprovar/rejeitar no RH atualiza o status da Solicitação aberta e avisa quem
-- pediu (backend/routes/rh.js, PATCH /ferias/:id).
--
-- Aditiva e idempotente: coluna nullable + índice parcial, sem tocar em RLS
-- (a policy de SELECT de rh_ferias_licencas já cobre funcionário/líder/RH>=3,
-- e o vínculo não muda quem pode ler a linha).

ALTER TABLE public.rh_ferias_licencas
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid REFERENCES public.solicitacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rh_ferias_licencas_solicitacao_id
  ON public.rh_ferias_licencas (solicitacao_id)
  WHERE solicitacao_id IS NOT NULL;

COMMENT ON COLUMN public.rh_ferias_licencas.solicitacao_id IS
  'Solicitação (categoria ferias/licenca) que originou este registro, quando lançado a partir do backbone de Solicitações. NULL para registros lançados direto pelo RH, sem pedido formal.';

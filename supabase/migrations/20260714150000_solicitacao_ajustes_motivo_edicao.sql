-- ============================================================================
-- Solicitações · motivo 'edicao' na linha do tempo de ajustes (2026-07-14)
-- ============================================================================
-- Contexto: o solicitante agora pode EDITAR a própria solicitação enquanto ela
-- ainda aguarda a aprovação do diretor de origem (caso clássico: enviou e
-- esqueceu o anexo · pedido do Pedro Paiva). Essa edição fica registrada em
-- `solicitacao_ajustes` com motivo 'edicao', que o CHECK atual não aceita.
--
-- ADITIVA · idempotente. O backend tolera a ausência desta migration (cai no
-- fallback motivo 'descricao'), mas o rótulo correto na linha do tempo depende
-- dela.

ALTER TABLE public.solicitacao_ajustes
  DROP CONSTRAINT IF EXISTS solicitacao_ajustes_motivo_check;

ALTER TABLE public.solicitacao_ajustes
  ADD CONSTRAINT solicitacao_ajustes_motivo_check
  CHECK (motivo IN ('descricao', 'escopo', 'data', 'cancelamento', 'resposta', 'edicao'));

COMMENT ON COLUMN public.solicitacao_ajustes.motivo IS
  'descricao/escopo/data = ajuste pedido · cancelamento = encerra · resposta = tréplica do solicitante ao reenviar · edicao = solicitante editou antes da aprovação de origem';

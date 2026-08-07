-- Censo · F1b — chave de idempotência do envio.
--
-- POR QUÊ: a coleta no culto usa fila offline no aparelho (mesmo padrão do
-- NpsPublica). A fila RE-TENTA até receber 2xx, e o `sendBeacon` do `pagehide`
-- dispara um envio a mais quando a pessoa fecha a aba. Sem chave de
-- idempotência, a mesma resposta entra duas ou três vezes e o total do censo
-- fica inflado — em pesquisa, número inflado é pior que número faltando.
--
-- A UNIQUE de (pesquisa_id, membro_id) da F0 não resolve isto: ela só age
-- DEPOIS de a pessoa ser identificada, e não pega anônimo nenhum.
--
-- `envio_id` é gerado no APARELHO (uuid) junto com a resposta, então a
-- re-tentativa carrega o mesmo id e o servidor devolve a resposta que já
-- existe em vez de criar outra.
--
-- Idempotente.

SET lock_timeout = '10s';

ALTER TABLE public.cen_resposta
  ADD COLUMN IF NOT EXISTS envio_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cen_resposta_envio
  ON public.cen_resposta (pesquisa_id, envio_id)
  WHERE envio_id IS NOT NULL;

COMMENT ON COLUMN public.cen_resposta.envio_id IS
  'Chave de idempotência gerada no aparelho. A fila offline re-tenta até 2xx e o sendBeacon do pagehide manda um envio extra; sem isto a mesma resposta entraria duas vezes e o total do censo ficaria inflado.';

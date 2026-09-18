-- Hora real em que o culto começou — a ÂNCORA que liga o roteiro de produção
-- à curva de audiência do YouTube.
--
-- ⚠️⚠️ POR QUE ISTO É NECESSÁRIO. As etapas em `culto_producao_etapas` dão a
-- estrutura do culto com precisão de segundos (medido em 03/09/2026 no culto de
-- 23/08: louvor termina em 21:17, pregação de 22:43 a 54:20). O que NÃO existe é
-- onde essa estrutura começa DENTRO do vídeo — a transmissão sempre começa antes
-- do culto, com a tela de espera.
--
-- Sem a âncora, o deslocamento tem de ser inferido, e medido nos 45 cultos com
-- etapa + curva as três inferências possíveis erram demais:
--   sobra bruta (vídeo − etapas) ....... 9,2 min, desvio ±5,6
--   vale da curva como âncora .......... 3,8 min, desvio ±6,6  (1 caso impossível)
--   descontando pos_culto_segundos ..... 9,3 min, desvio ±15,4
-- O louvor dura ~21 min e a pregação começa aos ~23: um erro de 6 min marcaria
-- "louvor terminou" no meio do louvor, e produziria a conclusão falsa de que a
-- audiência subiu com o fim do louvor quando ela subiu durante.
--
-- ⚠️ NÃO existe carimbo de hora nas etapas, e não é descuido de preenchimento:
-- `PUT /producao/culto/:id/etapas` é replace-all (apaga e reinsere tudo), então
-- os 47 cultos têm `updated_at` idêntico em todas as etapas — diferença de
-- 0 segundo entre a primeira e a última, em 47 de 47.
--
-- ⚠️ É `time`, não `timestamptz`: a data já vive em `cultos.data`, e guardar as
-- duas juntas cria a segunda fonte de verdade que este projeto já combateu.
-- Nulo = não informado, nunca zero.
alter table culto_producao
  add column if not exists inicio_real time;

comment on column culto_producao.inicio_real is
  'Hora real (BRT) em que o culto começou. Âncora para alinhar as etapas de produção com a curva de audiência do YouTube — a transmissão começa antes do culto. NULL = não informado.';

-- ============================================================================
--  cultura_mensal · alcance da comunidade do Online no WhatsApp (input mensal)
--
--  Pedido do Matheus (02/09/2026): "na aba do online, gostaria que tivesse um
--  lugar para inputar por mês, que é o número de pessoas que temos na
--  comunidade do online que temos no wpp."
--
--  ⚠️⚠️ ELE NÃO É SOMADO AO DEVOCIONAL, e isso é decisão registrada.
--
--  O pedido original era somar este número ao "Investir tempo com Deus" da
--  mandala. Medido em 02/09/2026 antes de decidir:
--
--    mai/26  1 pessoa · jun  4 · jul  2 · ago  14 · set (2 dias)  2
--
--  O devocional deu um salto de 7× em agosto. Com a comunidade na casa das
--  centenas, somar faria (800+14) contra (800+2) mover a mandala **0,15%** —
--  o salto que a equipe conquistou ficaria INVISÍVEL. Ou seja: a soma
--  destruiria justamente o instrumento que mostra o trabalho dando certo.
--
--  ⚠️ E são grandezas de tipos diferentes: devocional é FLUXO (zera todo mês,
--  conta quem fez NAQUELE mês) e comunidade de WhatsApp é ESTOQUE (só sobe,
--  ninguém sai). Somado, o número nunca poderia dar má notícia.
--
--  ⚠️ Há PRECEDENTE explícito do Marcos, na `20260514140000_kpis_online_dados_only`:
--  "enquadre isso como dados apenas e crie kpis específicos do online que só
--  são do online, então eles não entram no painel nsm". Números do Online
--  foram deliberadamente mantidos fora da mandala.
--
--  ⇒ A pétala Investir mostra as DUAS PARCELAS lado a lado, nunca a soma.
--
--  ⚠️ NULL = não informado, e a tela DIZ isso. Nunca 0 — zero se lê como
--  "a comunidade está vazia", que é afirmação diferente (lei do projeto:
--  "valor default plausível numa coluna de registro é palpite gravado como
--  fato"). Por isso a coluna nasce sem DEFAULT.
--
--  Aditiva · idempotente · nenhuma linha existente é tocada.
-- ============================================================================

ALTER TABLE public.cultura_mensal
  ADD COLUMN IF NOT EXISTS investir_comunidade_online int;

COMMENT ON COLUMN public.cultura_mensal.investir_comunidade_online IS
  'Pessoas na comunidade do Online no WhatsApp naquele mês (ESTOQUE acumulado, '
  'informado à mão na aba /online). ⚠️⚠️ NÃO É SOMADO ao devocional: a pétala '
  'Investir mostra as duas parcelas separadas. Somar enterraria a variação do '
  'devocional (medido em 02/09/2026: 2→14 pessoas de jul para ago, e a '
  'comunidade é ordem de grandeza maior). ⚠️ Diferente dos 4 campos vizinhos '
  '(freq_presencial_semanal, freq_online_semanal, decisoes_total, '
  'freq_grupos_total), que são OVERRIDE do valor calculado — este não '
  'sobrescreve nada, é um dado que só existe aqui. ⚠️ NULL = não informado, '
  'nunca 0.';

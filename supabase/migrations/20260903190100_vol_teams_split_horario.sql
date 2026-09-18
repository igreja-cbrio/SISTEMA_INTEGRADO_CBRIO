-- ============================================================================
-- `vol_teams.split_por_horario` · quem DECIDE se a escala é por horário
-- (2026-09-03)
--
-- Desenho do Marcos, com as palavras dele: *"por padrão deve-se usar split
-- teams caso tenham dois times diferentes servindo em cada culto (mantendo a
-- definição de culto como domingo manhã, já que fazemos a mesma liturgia) …
-- 1 culto, times split aparecem com horário acima nos times que isso for
-- habilitado"*.
--
-- ⚠️⚠️ POR QUE ESTA COLUNA EXISTE: sem ela, as duas colunas `culto_id` dos
-- passos 1 e 2 não têm PRODUTOR. O `POST /schedule-templates/:id/apply` precisa
-- saber, ao materializar o alvo, se aquele time gera **uma linha de bloco**
-- (`culto_id = NULL`) ou **uma linha por culto** do bloco. Sem a bandeira ele
-- teria que adivinhar — e adivinhar aqui produz cobertura errada em silêncio.
--
-- É o `Split Team` do Planning Center, onde a definição é literalmente *"this
-- team uses different people for each Service Time"*. Medido na conta da CBRio
-- em 03/09: **o flag existe e está DESLIGADO em todos os times** — e é por isso
-- que lá o horário acabou no NOME da posição (`Chat 9:30`, `Oferta 11:30`,
-- `Próximos Passos 9:30h`). Do nosso lado, **0 de 78 posições têm horário no
-- nome**, e a decisão do Marcos é que continue assim: *"o importante é o horário
-- ficar vinculado a culto pra não ter problema de mudança de horário não
-- alterar nomes de times"*. O gatilho foi real — a manhã era 08:30 e virou
-- 09:30 na semana de 24/08.
--
-- ⚠️ DEFAULT `false`, e isso é a escolha conservadora certa: hoje **nenhuma**
-- das 6.526 escalas e **nenhum** dos 1.447 alvos é por horário. `false`
-- descreve a frota como ela é, e ligar o split passa a ser um ato do líder,
-- time a time — que é exatamente a estratégia de migração que o Marcos definiu
-- ("ir implementando time a time até conseguirmos retirar o vínculo" com o
-- Services).
--
-- ⚠️ A bandeira é do TIME, não do tipo de culto nem do template. Razão: quem
-- repete gente entre as duas celebrações é a EQUIPE (a Banda toca as duas; a
-- Integração troca a escala). Colocá-la no tipo de culto forçaria todos os
-- times do domingo à mesma regra, que é justamente o que o Services acertou ao
-- deixar por time.
--
-- ⚠️ NÃO é o que decide se a LITURGIA duplica. A liturgia (ordem de culto,
-- template) segue UMA por bloco — o domingo de manhã é o mesmo culto repetido,
-- e duplicá-la faria os dois roteiros divergirem no primeiro ajuste. O
-- agrupamento do bloco vive em `vol_service_types.bloco_servico` /
-- `consolidacao_key`, que já existem e já estão preenchidos (`dom_manha`,
-- `domingo-0930`).
-- ============================================================================

ALTER TABLE public.vol_teams
  ADD COLUMN IF NOT EXISTS split_por_horario BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vol_teams.split_por_horario IS
  'true = este time usa PESSOAS DIFERENTES em cada horário do bloco, então a escala e o alvo são materializados por culto (culto_id preenchido) e o app mostra o horário acima do time. false (default) = o time serve o bloco todo com a mesma gente, e escala/alvo ficam com culto_id NULL. É o Split Team do Planning Center. Nasce false porque nenhuma das 6.526 escalas nem dos 1.447 alvos existentes é por horário; ligar é ato do líder, time a time.';

-- ============================================================================
-- Elegibilidade por TIPO DE CULTO · `vol_team_members.service_type_ids`
-- (2026-09-04)
--
-- O pedido original do Marcos, no vídeo de 03/09: *"as pessoas precisam estar
-- em times, os times devem ser ordenados por cultos — pessoas podem querer
-- apenas servir no time da banda quarta-feira, mas não quererem ou poderem ser
-- escalados no domingo"*.
--
-- ⚠️⚠️ ERA A ÚNICA PEÇA DE MODELO QUE FALTAVA. Medido em 04/09:
-- `vol_team_members` tem `team_id`, `position_id`, `volunteer_profile_id`,
-- `is_active`, `origem_pco_team` — e **nenhum eixo de tipo de culto**. Não
-- existia tabela de ligação (conferidos 3 nomes candidatos: nenhum existe).
--
-- ⚠️⚠️ **NULL = SERVE TODOS OS TIPOS.** É o que preserva os **1.050 vínculos
-- ativos** existentes sem backfill nenhum, e é a leitura honesta: ninguém
-- declarou restrição, então não há restrição. Array VAZIO também é tratado como
-- "todos" pela régua (`utils/elegibilidadeVol`) — um array esvaziado por
-- acidente na tela não pode significar "esta pessoa não serve em lugar nenhum",
-- porque o efeito seria a pessoa desaparecer de toda escala em silêncio.
--
-- ⚠️ ARRAY e não tabela de ligação, de propósito. Com tabela, "zero linhas"
-- seria ambíguo entre *não configurado* e *não serve em nada* — exatamente a
-- distinção que decide se a pessoa aparece ou não pra ser escalada. Com
-- `NULL` × `{...}` a diferença é explícita no dado.
--
-- ⚠️ A elegibilidade é por LINHA de vínculo (pessoa × time × função), não por
-- (pessoa, time). Medido: **155 dos 832 pares (pessoa, time) têm mais de uma
-- linha (18,6%), com máximo de 9** — então a granularidade fina existe de fato,
-- e permite "toca baixo na quarta, canta no domingo". A TELA edita por (pessoa,
-- time) e escreve em todas as linhas daquela pessoa naquele time, pra o líder
-- não ter que repetir a configuração 9 vezes.
--
-- ⚠️ Sem FK: é array de uuid, e o Postgres não faz FK de elemento de array. A
-- régua e a tela tratam id órfão como "restrição que não casa nada" — e o
-- `ON DELETE` de um tipo de culto não pode apagar a configuração de ninguém.
-- ============================================================================

ALTER TABLE public.vol_team_members
  ADD COLUMN IF NOT EXISTS service_type_ids UUID[];

COMMENT ON COLUMN public.vol_team_members.service_type_ids IS
  'Tipos de culto em que este vínculo aceita ser escalado. NULL = todos (o default, e o estado dos 1.050 vínculos anteriores a 2026-09-04: ninguém declarou restrição, então não há restrição). Array vazio também vale como "todos" na régua utils/elegibilidadeVol — esvaziar por acidente não pode fazer a pessoa desaparecer de toda escala em silêncio. Sem FK porque Postgres não faz FK de elemento de array.';

-- GIN pro `@>` da consulta "quem pode servir neste tipo". Parcial: a esmagadora
-- maioria das linhas é NULL, e essas nunca entram no teste de contenção.
CREATE INDEX IF NOT EXISTS vol_team_members_service_types_idx
  ON public.vol_team_members USING GIN (service_type_ids)
  WHERE service_type_ids IS NOT NULL;

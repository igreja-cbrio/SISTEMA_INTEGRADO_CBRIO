-- Reordena o dropdown "Local" do Planejamento Anual (plan_locais): ordem
-- alfabética para as localizações reais do Patrimônio, com "Área externa" e
-- "Fora da igreja" (opções virtuais, sem localização física) fixadas no
-- final da lista — pedido do Diego (2026-08-19).
--
-- Só toca na coluna `ordem`; não mexe em nome/ativo/pat_localizacao_id/
-- gera_conflito. Idempotente (UPDATE por nome, valor fixo).

UPDATE plan_locais SET ordem = CASE nome
  WHEN 'CBKids'                       THEN 1
  WHEN 'Cobertura'                    THEN 2
  WHEN 'Cozinha'                      THEN 3
  WHEN 'Espaço CBRio'                 THEN 4
  WHEN 'Espaço Next'                  THEN 5
  WHEN 'Livraria'                     THEN 6
  WHEN 'Lounge do Templo'             THEN 7
  WHEN 'Oficina'                      THEN 8
  WHEN 'Sala 2 - Estúdio / Mídia'     THEN 9
  WHEN 'Sala de Aula do SICON'        THEN 10
  WHEN 'Sala de Mídia'                THEN 11
  WHEN 'Sala Voluntariado'            THEN 12
  WHEN 'Secretaria'                   THEN 13
  WHEN 'Área externa'                 THEN 14
  WHEN 'Fora da igreja'               THEN 15
  ELSE ordem
END
WHERE nome IN (
  'CBKids', 'Cobertura', 'Cozinha', 'Espaço CBRio', 'Espaço Next', 'Livraria',
  'Lounge do Templo', 'Oficina', 'Sala 2 - Estúdio / Mídia',
  'Sala de Aula do SICON', 'Sala de Mídia', 'Sala Voluntariado', 'Secretaria',
  'Área externa', 'Fora da igreja'
);

-- CONFIRMAÇÃO (rodar depois):
-- SELECT nome, ordem FROM plan_locais WHERE ativo = true ORDER BY ordem;

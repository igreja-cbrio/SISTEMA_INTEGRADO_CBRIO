-- =====================================================================
-- Fusão de localizações duplicadas no Patrimônio + catálogo de locais do
-- Planejamento Anual passa a espelhar as localizações reais (2026-08-18)
-- =====================================================================
-- Pedido do Diego: (1) o dropdown "Local" da proposta do Planejamento Anual
-- deve puxar as localizações reais do Patrimônio (excluindo Almoxarifados e
-- Banheiros · colapsando toda a árvore CBKids numa única opção · sem
-- individualizar salas do Kids), (2) dentro do Patrimônio, 3 pares de
-- localizações duplicadas devem ser fundidos.
--
-- ⚠️ `pat_localizacoes` NUNCA foi criada por migration (drift documentado em
-- 20260729210000) — não há como conferir FKs pelo repo. Por isso a PARTE 1
-- descobre DINAMICAMENTE no catálogo do Postgres (information_schema) TODAS
-- as tabelas que referenciam pat_localizacoes, e aborta se achar vínculo não
-- prAntes (mesmo padrão do merge_membros: descobrir filhos pelo catálogo, não
-- por lista decorada).
--
-- IDs e contagens de bens conferidos ao vivo em 18/08/2026 (ver descrição do
-- PR): nenhum dos 3 pares tem filhos na árvore nem vínculo em
-- pat_movimentacoes/pat_revisao_itens/kids_salas/plan_locais — só pat_bens.
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- PARTE 1 · Fusão de localizações duplicadas no Patrimônio
-- ─────────────────────────────────────────────────────────────────────

-- 1a. Trava dinâmica: qualquer tabela que referencie pat_localizacoes(id)
-- por FK e que NÃO seja pat_bens.localizacao_id (que já sabemos que tem
-- vínculo e vamos repontar explicitamente) precisa estar ZERADA pros 3
-- registros que serão apagados. Se achar algo, aborta a transação inteira.
DO $$
DECLARE
  r record;
  v_count int;
  ids uuid[] := ARRAY[
    'd1d014ae-df50-4ca6-aea4-c286b8a38c77'::uuid, -- Espaço Ministerial (apaga · funde em Espaço Next)
    '075da342-1d4f-42a1-8c74-9c6cd3cb0ce8'::uuid, -- RECEPÇÃO / SECRETARIA (apaga · funde em Secretaria)
    '7c7782b9-cc17-49e1-8254-bbb411b426f1'::uuid  -- AREA DO HALL (apaga · funde em Lounge Templo)
  ];
BEGIN
  FOR r IN
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'pat_localizacoes'
  LOOP
    IF r.table_name = 'pat_bens' AND r.column_name = 'localizacao_id' THEN
      CONTINUE; -- repontado explicitamente na 1b, abaixo
    END IF;

    EXECUTE format('SELECT count(*) FROM %I WHERE %I = ANY($1)', r.table_name, r.column_name)
      INTO v_count USING ids;

    IF v_count > 0 THEN
      RAISE EXCEPTION 'Tabela % coluna % tem % linha(s) apontando pra uma localização que seria apagada — abortando fusão (repontar manualmente antes de rodar de novo).',
        r.table_name, r.column_name, v_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Nenhuma FK inesperada encontrada — seguindo com a fusão.';
END $$;

-- 1b. Repontar pat_bens dos duplicados pro sobrevivente, e apagar o duplicado
UPDATE pat_bens SET localizacao_id = '2757d325-0408-4cba-8f57-69b971a03215' -- Espaço Next
WHERE localizacao_id = 'd1d014ae-df50-4ca6-aea4-c286b8a38c77'; -- Espaço Ministerial
DELETE FROM pat_localizacoes WHERE id = 'd1d014ae-df50-4ca6-aea4-c286b8a38c77';

UPDATE pat_bens SET localizacao_id = '509d078e-9869-4390-a7bf-8ef9ceece54a' -- Secretaria
WHERE localizacao_id = '075da342-1d4f-42a1-8c74-9c6cd3cb0ce8'; -- RECEPÇÃO / SECRETARIA
DELETE FROM pat_localizacoes WHERE id = '075da342-1d4f-42a1-8c74-9c6cd3cb0ce8';

UPDATE pat_bens SET localizacao_id = '4077e5a5-1836-45d7-8f89-70a093c3b310' -- Lounge Templo
WHERE localizacao_id = '7c7782b9-cc17-49e1-8254-bbb411b426f1'; -- AREA DO HALL
DELETE FROM pat_localizacoes WHERE id = '7c7782b9-cc17-49e1-8254-bbb411b426f1';

-- 1c. Renomeia o sobrevivente do 3º par, conforme pedido
UPDATE pat_localizacoes SET nome = 'Lounge do Templo'
WHERE id = '4077e5a5-1836-45d7-8f89-70a093c3b310';

-- ─────────────────────────────────────────────────────────────────────
-- PARTE 2 · Catálogo de locais do Planejamento Anual (plan_locais) passa a
-- espelhar as localizações reais do Patrimônio (folhas da árvore), exceto
-- Almoxarifados/Banheiros (excluídos) e CBKids/Cobertura (cada um colapsado
-- numa única linha — mesmo padrão: são grupos de salas com um único uso
-- coletivo, não precisam de individualização no dropdown do Planejamento).
-- ─────────────────────────────────────────────────────────────────────

-- 2a. Desativa (NUNCA apaga — ON DELETE RESTRICT em plan_propostas.local_id)
-- os 4 seeds genéricos que a lista antiga tinha e que não correspondem a
-- nenhuma localização real: continuam existindo pra não quebrar proposta
-- antiga que já os referencie, só somem do dropdown (ativo=false).
UPDATE plan_locais SET ativo = false
WHERE nome IN ('Templo', 'Salão social', 'Sala 1', 'Sala 2');

-- 2b. Novo catálogo — cada linha aponta pra sua localização real via
-- pat_localizacao_id (rastreabilidade), gera_conflito=true (default) porque
-- são espaços físicos reais e um choque de agenda ali é um choque de verdade.
-- "Cobertura" (Bloco 3 > Cobertura, id 8b9930f8-...) e "CBKids" apontam pro
-- nó-PAI da árvore, não pra uma sala específica — são grupos colapsados
-- (confirmado ao vivo: Cobertura tem 10 salas embaixo · Copa, Gabinete
-- Pastoral, Sala de Descompressão, Salas de Reunião 1-4, Sala do Financeiro,
-- Salão Principal — Banheiros da Cobertura fica de fora, como os demais).
INSERT INTO plan_locais (nome, gera_conflito, pat_localizacao_id, ativo, ordem) VALUES
  ('Cobertura',                     true, '8b9930f8-0583-4aa5-8285-1abbf691b7c8', true, 1),
  ('Espaço Next',                  true, '2757d325-0408-4cba-8f57-69b971a03215', true, 2),
  ('Sala Voluntariado',            true, '056fc1d0-ed7d-4c47-bc61-b6f60325b9df', true, 3),
  ('Secretaria',                   true, '509d078e-9869-4390-a7bf-8ef9ceece54a', true, 4),
  ('CBKids',                       true, 'e68e9d3b-2317-4d06-9f58-5133f33e945c', true, 5),
  ('Espaço CBRio',                 true, '5abd7cb7-d240-4e1e-a377-4110c159215d', true, 6),
  ('Cozinha',                      true, '2d510eb3-546c-44ae-898b-056c4f1e9559', true, 7),
  ('Livraria',                     true, '4f81f07f-1613-4308-a6cf-d31e81b4b12b', true, 8),
  ('Lounge do Templo',             true, '4077e5a5-1836-45d7-8f89-70a093c3b310', true, 9),
  ('Sala 2 - Estúdio / Mídia',     true, '19aaff2f-7767-4e49-9991-37337cab076c', true, 10),
  ('Sala de Mídia',                true, 'c394a569-0dbb-406e-ac1e-c033c92e265a', true, 11),
  ('Oficina',                      true, 'aad9dd53-6075-4256-adde-569f8fbf46de', true, 12),
  ('Sala de Aula do SICON',        true, '50d69af9-a56e-4286-8ac2-9806a432e038', true, 13)
ON CONFLICT (nome) DO NOTHING; -- idempotente

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- CONFIRMAÇÃO (rodar depois do COMMIT)
-- ─────────────────────────────────────────────────────────────────────
-- SELECT nome, gera_conflito, pat_localizacao_id, ativo, ordem
-- FROM plan_locais ORDER BY ativo DESC, ordem;
-- SELECT count(*) FROM pat_localizacoes
-- WHERE id IN ('d1d014ae-df50-4ca6-aea4-c286b8a38c77','075da342-1d4f-42a1-8c74-9c6cd3cb0ce8','7c7782b9-cc17-49e1-8254-bbb411b426f1');
-- Esperado: 0 (os 3 duplicados sumiram)

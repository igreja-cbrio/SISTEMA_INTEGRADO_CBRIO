-- ════════════════════════════════════════════════════════════════════════════
--  A campanha passa a enxergar o dinheiro que está no BALANÇO
--
--  Relato do Matheus (21/09/2026): *"o valor arrecadado na campanha do kids nao
--  esta batendo com nosso sistema financeiro"* e *"parece que nao ta atualizando
--  toda vez que subo o balanco no sistema"*.
--
--  ⚠️⚠️ NÃO ERA CACHE NEM LENTIDÃO — ERA POR CONSTRUÇÃO. O balde "confirmado"
--  procurava `fin_transacoes.identificador_centavo = digito`, e essa coluna está
--  preenchida em **ZERO linhas do sistema inteiro** (medido em 21/09: 0 de 2.811
--  transações criadas desde 27/08). O carimbo do dígito só acontece em
--  `POST /financeiro-v2/classificar/:id/aprovar` — a fila de lançamentos brutos —
--  e **nenhuma das 2.811 tem `lancamento_bruto_id`**: o balanço entra por outro
--  caminho, que nunca passa pela fila. Logo o balde nunca somaria nada, e subir
--  o balanço mil vezes não mudaria a barra.
--
--  O tamanho do buraco na campanha do Kids (dígito 12, janela 01/09–31/10):
--    barra mostrava   R$  27.308,24  (27 créditos do EXTRATO, não classificados)
--    financeiro tinha R$ 170.127,68  (639 receitas em "Outras Contribuicoes")
--    diferença        R$ 142.819,44
--
--  ⚠️ E havia uma bomba-relógio: no dia em que aqueles 27 brutos fossem
--  classificados, eles sairiam do balde "conciliando" (que exclui bruto já
--  virado transação) e NÃO entrariam no "confirmado" (dígito nulo). A barra iria
--  para R$ 0,00 sozinha.
--
--  ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
--  1. CONFIRMADO passa a aceitar o CENTAVO do próprio valor, além da coluna.
--     ⚠️ Decisão do Matheus depois de ver a medição do falso positivo: a taxa
--     natural de receita terminando no dígito 12 é **0,11%** (11 de 9.617 antes
--     do lançamento) contra **40,6%** depois (639 de 1.574). O sinal é
--     inequívoco e o ruído esperado é de ~2 lançamentos. A coluna continua
--     valendo quando preenchida — correção humana manda.
--
--  2. CONCILIANDO passa a contar SÓ o que o balanço ainda não alcançou.
--     ⚠️⚠️ SEM ISSO, ESTA MIGRATION CRIARIA DUPLA CONTAGEM — o erro de R$ 1,5 mi
--     que este projeto já pagou. Medido em 21/09: o balanço está lançado até
--     21/09 e o extrato bruto vai até 16/09, com **0 brutos posteriores**. Ou
--     seja, os 27 créditos JÁ ESTÃO dentro das 639 receitas; somar os dois baldes
--     inflaria R$ 27.308,24. O balde agora significa o que o nome sempre disse:
--     *"está na conta e ainda não entrou no sistema"*.
--     ⚠️ O corte é por DATA e não por casamento de valor: 92 pessoas doaram
--     exatamente R$ 100,12, então parear bruto↔transação por valor é ambíguo por
--     construção.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vw_camp_arrecadacao AS
WITH conf AS (
  SELECT c_1.id AS campanha_id,
         COALESCE(sum(round(abs(t.valor) * 100::numeric))::bigint, 0::bigint) AS centavos,
         count(*)::integer AS lancamentos,
         count(DISTINCT t.membro_id)::integer AS doadores
    FROM camp_campanhas c_1
    JOIN fin_transacoes t
      ON t.tipo = 'receita'
     AND (
           (c_1.digito IS NOT NULL
            -- ⚠️ A coluna OU o centavo do valor. Ver o cabeçalho: a coluna nunca
            -- é preenchida pelo caminho do balanço, e o valor já carrega o dígito
            -- porque foi o doador que o digitou na transferência.
            AND (t.identificador_centavo = c_1.digito
                 OR lpad((round(abs(t.valor) * 100::numeric) % 100::numeric)::text, 2, '0') = c_1.digito::text)
            AND (c_1.data_inicio IS NULL OR t.data_competencia >= c_1.data_inicio)
            AND (c_1.data_fim IS NULL OR t.data_competencia <= c_1.data_fim)
            AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                             WHERE v.campanha_id = c_1.id AND v.transacao_id = t.id AND v.incluir = false))
           OR EXISTS (SELECT 1 FROM camp_vinculos v
                       WHERE v.campanha_id = c_1.id AND v.transacao_id = t.id AND v.incluir = true)
         )
   WHERE c_1.deleted_at IS NULL
   GROUP BY c_1.id
),
-- Até quando o balanço já lançou receita com o dígito desta campanha. É o corte
-- que impede contar o mesmo dinheiro duas vezes.
lancado AS (
  SELECT c_1.id AS campanha_id, max(t.data_competencia) AS ate
    FROM camp_campanhas c_1
    JOIN fin_transacoes t
      ON t.tipo = 'receita'
     AND c_1.digito IS NOT NULL
     AND lpad((round(abs(t.valor) * 100::numeric) % 100::numeric)::text, 2, '0') = c_1.digito::text
     AND (c_1.data_inicio IS NULL OR t.data_competencia >= c_1.data_inicio)
     AND (c_1.data_fim IS NULL OR t.data_competencia <= c_1.data_fim)
   WHERE c_1.deleted_at IS NULL
   GROUP BY c_1.id
),
concil AS (
  SELECT c_1.id AS campanha_id,
         COALESCE(sum(round(abs(b.valor) * 100::numeric))::bigint, 0::bigint) AS centavos,
         count(*)::integer AS lancamentos
    FROM camp_campanhas c_1
    LEFT JOIN lancado l ON l.campanha_id = c_1.id
    JOIN fin_lancamentos_brutos b
      ON (b.tipo_trn = 'CREDIT' OR (b.tipo_trn IS DISTINCT FROM 'DEBIT' AND b.valor > 0::numeric))
     AND (
           (c_1.digito IS NOT NULL
            AND lpad((round(abs(b.valor) * 100::numeric) % 100::numeric)::text, 2, '0') = c_1.digito::text
            AND (c_1.data_inicio IS NULL OR b.data_lancamento >= c_1.data_inicio)
            AND (c_1.data_fim IS NULL OR b.data_lancamento <= c_1.data_fim)
            -- ⚠️ O CORTE ANTI-DUPLA-CONTAGEM: só conta crédito POSTERIOR ao que o
            -- balanço já lançou. Sem `lancado.ate` (balanço ainda não tocou nesta
            -- campanha) tudo conta, que é o comportamento de antes.
            AND (l.ate IS NULL OR b.data_lancamento > l.ate)
            AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                             WHERE v.campanha_id = c_1.id AND v.lancamento_bruto_id = b.id AND v.incluir = false))
           OR EXISTS (SELECT 1 FROM camp_vinculos v
                       WHERE v.campanha_id = c_1.id AND v.lancamento_bruto_id = b.id AND v.incluir = true)
         )
     AND NOT EXISTS (SELECT 1 FROM fin_transacoes t WHERE t.lancamento_bruto_id = b.id)
   WHERE c_1.deleted_at IS NULL
   GROUP BY c_1.id
),
onl AS (
  SELECT c_1.id AS campanha_id,
         COALESCE(sum(COALESCE(p.valor_pago_centavos, p.valor_centavos)), 0::bigint) AS centavos,
         count(*)::integer AS lancamentos,
         count(DISTINCT p.membro_id)::integer AS doadores
    FROM camp_campanhas c_1
    JOIN pag_cobrancas p
      ON p.origem_tipo = 'generosidade' AND p.status = 'pago' AND p.deleted_at IS NULL
     AND (p.metadata ->> 'campanha_id') = c_1.id::text
   WHERE c_1.deleted_at IS NULL
   GROUP BY c_1.id
)
SELECT c.id AS campanha_id, c.slug, c.nome, c.digito, c.status, c.publica, c.mostrar_valor,
       c.meta_centavos, c.data_inicio, c.data_lancamento, c.data_fim,
       COALESCE(conf.centavos, 0::bigint) AS caixa_confirmado_centavos,
       COALESCE(concil.centavos, 0::bigint) AS caixa_conciliando_centavos,
       COALESCE(onl.centavos, 0::bigint) AS online_pago_centavos,
       COALESCE(conf.centavos, 0::bigint) + COALESCE(concil.centavos, 0::bigint) + COALESCE(onl.centavos, 0::bigint) AS total_centavos,
       COALESCE(conf.lancamentos, 0) + COALESCE(concil.lancamentos, 0) + COALESCE(onl.lancamentos, 0) AS total_lancamentos,
       COALESCE(concil.lancamentos, 0) AS lancamentos_em_conciliacao,
       GREATEST(COALESCE(conf.doadores, 0), COALESCE(onl.doadores, 0)) AS doadores_aprox
  FROM camp_campanhas c
  LEFT JOIN conf   ON conf.campanha_id   = c.id
  LEFT JOIN concil ON concil.campanha_id = c.id
  LEFT JOIN onl    ON onl.campanha_id    = c.id
 WHERE c.deleted_at IS NULL;

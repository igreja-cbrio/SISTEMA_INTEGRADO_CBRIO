-- ═══════════════════════════════════════════════════════════════════════════
--  CAMPANHAS · a inclusão MANUAL passa a somar de verdade
--  2026-08-27 · conserto de um furo introduzido na migration de ontem
--
--  ⚠️⚠️ O FURO: `POST /campanhas/:id/vinculo` aceita `incluir: true` desde
--  ontem, mas a view só lia o VETO (`incluir = false`). Ou seja: o financeiro
--  marcava "este crédito É desta campanha" e **o total não se movia**, em
--  silêncio. O caminho do veto funcionava; o da inclusão era decoração.
--
--  Isso importa por dois motivos, e o segundo é o que traz urgência:
--   1. quem deposita em espécie ou transfere sem os centavos não tinha como ser
--      contado — e a reunião previu exatamente esse caso;
--   2. ⚠️⚠️ TROCAR O DÍGITO da campanha faria toda doação já identificada com o
--      dígito antigo **desaparecer da barrinha**, porque a view casa o caixa por
--      `identificador_centavo = c.digito`. A saída NÃO é mudar essa chave (é ela
--      que impede a dupla contagem do repasse do PSP · LEI Nº 6): é FIXAR o
--      passado em `camp_vinculos` na hora da troca. Só que fixar não servia de
--      nada enquanto a inclusão manual não somasse.
--
--  ⚠️ E a janela de datas passou a valer SÓ para o caminho do dígito. Inclusão
--  manual é decisão humana explícita: se alguém do financeiro disse que aquele
--  crédito é da campanha, a data de início da campanha não tem por que
--  desautorizá-lo. O veto segue valendo sobre o caminho do dígito.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.vw_camp_arrecadacao AS
WITH conf AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(ROUND(ABS(t.valor) * 100))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos,
         COUNT(DISTINCT t.membro_id)::INT AS doadores
    FROM camp_campanhas c
    JOIN fin_transacoes t
      ON t.tipo = 'receita'
     AND (
           -- pelo DÍGITO: dentro da janela e sem veto humano
           (c.digito IS NOT NULL
            AND t.identificador_centavo = c.digito
            AND (c.data_inicio IS NULL OR t.data_competencia >= c.data_inicio)
            AND (c.data_fim   IS NULL OR t.data_competencia <= c.data_fim)
            AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                             WHERE v.campanha_id = c.id AND v.transacao_id = t.id
                               AND v.incluir = false))
           -- ou INCLUÍDA À MÃO: decisão humana, ignora a janela de propósito
           OR EXISTS (SELECT 1 FROM camp_vinculos v
                       WHERE v.campanha_id = c.id AND v.transacao_id = t.id
                         AND v.incluir = true)
         )
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
),
concil AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(ROUND(ABS(b.valor) * 100))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos
    FROM camp_campanhas c
    JOIN fin_lancamentos_brutos b
      ON (b.tipo_trn = 'CREDIT' OR (b.tipo_trn IS DISTINCT FROM 'DEBIT' AND b.valor > 0))
     AND (
           (c.digito IS NOT NULL
            AND lpad((ROUND(ABS(b.valor) * 100) % 100)::TEXT, 2, '0') = c.digito
            AND (c.data_inicio IS NULL OR b.data_lancamento >= c.data_inicio)
            AND (c.data_fim   IS NULL OR b.data_lancamento <= c.data_fim)
            AND NOT EXISTS (SELECT 1 FROM camp_vinculos v
                             WHERE v.campanha_id = c.id AND v.lancamento_bruto_id = b.id
                               AND v.incluir = false))
           OR EXISTS (SELECT 1 FROM camp_vinculos v
                       WHERE v.campanha_id = c.id AND v.lancamento_bruto_id = b.id
                         AND v.incluir = true)
         )
     -- ⚠️ O que já virou transação está no balde `conf`. Sem este NOT EXISTS o
     -- total DOBRARIA e a barrinha pularia toda vez que a fila fosse aprovada.
     AND NOT EXISTS (SELECT 1 FROM fin_transacoes t WHERE t.lancamento_bruto_id = b.id)
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
),
onl AS (
  SELECT c.id AS campanha_id,
         COALESCE(SUM(COALESCE(p.valor_pago_centavos, p.valor_centavos))::BIGINT, 0) AS centavos,
         COUNT(*)::INT AS lancamentos,
         COUNT(DISTINCT p.membro_id)::INT AS doadores
    FROM camp_campanhas c
    JOIN pag_cobrancas p
      ON p.origem_tipo = 'generosidade'
     AND p.status = 'pago'
     AND p.deleted_at IS NULL
     AND p.metadata ->> 'campanha_id' = c.id::TEXT
   WHERE c.deleted_at IS NULL
   GROUP BY c.id
)
SELECT c.id AS campanha_id,
       c.slug, c.nome, c.digito, c.status, c.publica, c.mostrar_valor,
       c.meta_centavos, c.data_inicio, c.data_lancamento, c.data_fim,
       COALESCE(conf.centavos, 0)   AS caixa_confirmado_centavos,
       COALESCE(concil.centavos, 0) AS caixa_conciliando_centavos,
       COALESCE(onl.centavos, 0)    AS online_pago_centavos,
       COALESCE(conf.centavos, 0) + COALESCE(concil.centavos, 0)
         + COALESCE(onl.centavos, 0) AS total_centavos,
       COALESCE(conf.lancamentos, 0) + COALESCE(concil.lancamentos, 0)
         + COALESCE(onl.lancamentos, 0) AS total_lancamentos,
       COALESCE(concil.lancamentos, 0) AS lancamentos_em_conciliacao,
       GREATEST(COALESCE(conf.doadores, 0), COALESCE(onl.doadores, 0)) AS doadores_aprox
  FROM camp_campanhas c
  LEFT JOIN conf   ON conf.campanha_id = c.id
  LEFT JOIN concil ON concil.campanha_id = c.id
  LEFT JOIN onl    ON onl.campanha_id = c.id
 WHERE c.deleted_at IS NULL;

COMMIT;

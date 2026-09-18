-- ════════════════════════════════════════════════════════════════════════════
--  Censo · `vw_cen_item_agregado` parava o mesmo valor em duas barras
--  (10/09/2026 · achado ao acrescentar a pergunta de igreja)
--
-- ⚠️⚠️ O QUE ESTAVA ERRADO, medido em produção:
--   A view agrupava por `(pesquisa_id, pergunta_id, pergunta_texto, tipo,
--   sensivel, valor)`. `pergunta_texto` e `tipo` são SNAPSHOT do dia em que a
--   pessoa respondeu — e mudar o tipo ou o enunciado de uma pergunta com
--   respostas na mesa parte o agregado em dois grupos com o mesmo valor.
--
--   `congregava_antes` foi de `sim_nao` para `multipla` no meio da coleta.
--   Resultado que a view devolvia hoje:
--       multipla | Sim                 | 7
--       multipla | Não                 | 1
--       multipla | Estava afastado(a)  | 2
--       sim_nao  | Sim                 | 9
--       sim_nao  | Não                 | 4
--   E a tela do Perfil mostrava "Sim 9 (39%)" e "Sim 7 (30%)" como se fossem
--   coisas diferentes. O número verdadeiro é Sim = 16 de 23 = 70%.
--   Ninguém reclamou porque não há erro — só um gráfico errado.
--
-- ⚠️ NÃO é o snapshot que está errado: guardar `pergunta_texto`/`tipo` por item
--   é o desenho CERTO (a exportação mostra o enunciado do dia da resposta).
--   O errado é AGREGAR por eles.
--
-- ⚠️ `CREATE OR REPLACE VIEW` não deixa remover nem reordenar coluna — os 7
--   nomes e a ordem ficam idênticos. Só o GROUP BY encolhe.
--   · `pergunta_texto` passa a ser o enunciado MAIS RECENTE (é o que a tela
--      de hoje mostra), não um `max()` alfabético que pegaria o antigo.
--   · `tipo` idem.
--   · `sensivel` vira `bool_or`: se QUALQUER item daquele valor foi coletado
--      como sensível, o agregado é sensível. Fail-safe — é o campo que o
--      `/perfil` usa para decidir se o bloco exige permissão.
--
-- ⚠️ Consumidor único, conferido: `backend/routes/censo.js` (`GET /perfil`,
--   `select('*')`). Ele usa `pergunta_id`, `valor`, `total` e
--   `linhas[0]?.sensivel` — nunca `tipo` nem `pergunta_texto` da view (o tipo
--   que ele usa vem do QUESTIONÁRIO). Por isso encolher o GROUP BY não muda
--   nada além de juntar o que sempre deveria estar junto.
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.vw_cen_item_agregado as
  select i.pesquisa_id,
         i.pergunta_id,
         (array_agg(i.pergunta_texto order by i.created_at desc))[1] as pergunta_texto,
         (array_agg(i.tipo           order by i.created_at desc))[1] as tipo,
         bool_or(i.sensivel) as sensivel,
         v.valor,
         count(*) as total
    from cen_resposta_item i
    join cen_resposta r on r.id = i.resposta_id and r.deleted_at is null
    cross join lateral (
           select opt.opt as valor
             from unnest(i.valor_opcoes) opt(opt)
            where i.valor_opcoes is not null
           union all
           select coalesce(trim_scale(i.valor_num)::text, i.valor_texto)
            where i.valor_opcoes is null
         ) v
   where v.valor is not null and i.acao is distinct from 'cuidado'::text
   group by i.pesquisa_id, i.pergunta_id, v.valor;

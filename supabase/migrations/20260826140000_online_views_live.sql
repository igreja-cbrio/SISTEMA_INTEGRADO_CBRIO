-- ════════════════════════════════════════════════════════════════════════════
--  online_views_live · views ACUMULADAS até o fim da live
--
--  Pedido do Matheus (26/08/2026): indicador novo "views totais" da live, e o
--  DS passar a ser o que ele sempre deveria ter sido — as views DEPOIS que a
--  transmissão acabou.
--
--  ⚠️ O DS gravava `statistics.viewCount` acumulado da vida inteira do vídeo,
--  sem subtrair nada. Incluía as views de DURANTE a live, justamente a parte
--  que não é "dia seguinte".
--
--  ⚠️⚠️ NÃO HÁ BACKFILL POSSÍVEL: o `viewCount` do fim de uma live encerrada é
--  irrecuperável (o YouTube não guarda o histórico daquele contador). Todo
--  culto anterior a esta migration fica com `online_views_live` NULL e segue
--  lido pela régua antiga — `utils/dsOnline.calcularDs` devolve a `regra` junto
--  do número justamente para a tela poder dizer qual produziu cada ponto.
--
--  APLICADA EM PRODUÇÃO em 26/08/2026. Conferida no CATÁLOGO (não no
--  success:true): coluna em `cultos`, coluna 21 da view, view com 1.166 linhas.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.cultos
  add column if not exists online_views_live integer;

comment on column public.cultos.online_views_live is
  'Views ACUMULADAS do vídeo até o fim da live (maior statistics.viewCount amostrado pelo live-monitor). NÃO confundir com online_pico, que é espectadores SIMULTÂNEOS. NULL = live anterior a 26/08/2026, irrecuperável.';

-- ── A view, por PATCH DINÂMICO sobre a definição VIVA ────────────────────────
-- ⚠️ Nunca colar corpo estático de arquivo: a definição de produção pode ter
-- ajustes que o repo não conhece, e um CREATE OR REPLACE cego os reverteria em
-- silêncio (lição do handle_new_user e do fanout).
do $$
declare
  v_def text;
  v_novo text;
  v_ancora constant text := 'COALESCE(sum(c.decisoes_kids), 0::bigint)::integer AS aceitacoes_kids';
begin
  select pg_get_viewdef('public.vw_dashboard_semanal'::regclass, true) into v_def;

  if position('online_views_live' in v_def) > 0 then
    raise notice 'vw_dashboard_semanal ja tem online_views_live - nada a fazer';
    return;
  end if;

  -- ⚠️ Guarda de FORMA: a âncora tem que aparecer exatamente 1x. Se a view for
  -- refatorada, esta migration ABORTA em vez de produzir SQL torto.
  if (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora) <> 1 then
    raise exception 'ancora ausente ou repetida em vw_dashboard_semanal - patch abortado';
  end if;

  -- ⚠️ Coluna nova vai no FIM: CREATE OR REPLACE VIEW só permite APPEND, nunca
  -- reordenar ou remover.
  v_novo := replace(v_def, v_ancora,
    v_ancora || ',' || chr(10) ||
    '    COALESCE(sum(c.online_views_live), 0::bigint)::integer AS online_views_live');

  execute 'create or replace view public.vw_dashboard_semanal as ' || v_novo;
  raise notice 'vw_dashboard_semanal: online_views_live acrescentada';
end $$;

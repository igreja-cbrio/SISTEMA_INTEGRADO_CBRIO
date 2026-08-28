-- ============================================================================
-- PAINEL DO APP · a consulta que cava o índice pra trás (07/08/2026 · Onda 4)
--
-- ⚠️⚠️ É A ÚNICA COISA DESTA ONDA QUE JÁ DÓI HOJE, com 13.322 linhas.
--
-- `eventos_recentes` era `WHERE tipo <> 'ping' ORDER BY created_at DESC
-- LIMIT 15` **sem NENHUM filtro de data**, e `src/pages/admin/AppAnalytics.jsx`
-- dispara isso a cada 5 segundos. O Postgres varre o índice de `created_at` de
-- trás pra frente PULANDO ping até juntar 15 não-ping — ou seja: **quanto mais
-- ping e quanto mais silêncio de gente, mais fundo ele cava**. Hoje 84% da
-- tabela é ping. É o pior formato possível: o custo cresce com o crescimento da
-- tabela E com a ociosidade do app.
--
-- A janela de 1 hora resolve na origem: a busca para no fim da hora, sempre.
-- E "eventos recentes" com evento de 3 dias atrás não era informação de
-- qualquer forma — o painel é AO VIVO.
--
-- ⚠️ EFEITO VISÍVEL: fora de horário de uso, o cartão passa a aparecer VAZIO em
-- vez de mostrar evento antigo. Isso é o certo (nada acontecendo = nada na
-- tela), mas avisar antes que alguém compare com o print de ontem e ache que
-- quebrou.
--
-- ⚠️ Recriada com `CREATE OR REPLACE` mantendo a assinatura — não dropar: a
-- lição de `feedback_pg_function_overload_default` é que assinatura nova não
-- substitui a antiga, e aqui a assinatura é idêntica (sem argumentos).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_app_telemetria_ao_vivo()
 RETURNS jsonb LANGUAGE sql STABLE AS $function$
  WITH hoje AS (
    SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS ini
  )
  SELECT jsonb_build_object(
    'online_5min', (SELECT count(DISTINCT user_id) FROM app_eventos WHERE user_id IS NOT NULL AND created_at >= now() - interval '5 minutes'),
    'online_1min', (SELECT count(DISTINCT user_id) FROM app_eventos WHERE user_id IS NOT NULL AND created_at >= now() - interval '1 minute'),
    'eventos_5min', (SELECT count(*) FROM app_eventos WHERE tipo <> 'ping' AND created_at >= now() - interval '5 minutes'),
    'telas_agora', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'n', n) ORDER BY n DESC), '[]')
                    FROM (SELECT nome, count(DISTINCT user_id) n FROM app_eventos
                          WHERE tipo='tela' AND created_at >= now() - interval '5 minutes'
                          GROUP BY nome ORDER BY n DESC LIMIT 8) t),
    'eventos_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'nome', nome, 'plataforma', plataforma, 'em', created_at) ORDER BY created_at DESC), '[]')
                         FROM (SELECT tipo, nome, plataforma, created_at FROM app_eventos
                               WHERE tipo <> 'ping'
                                 AND created_at >= now() - interval '1 hour'
                               ORDER BY created_at DESC LIMIT 15) e),
    'cadastros_app_total', (SELECT count(*) FROM profiles WHERE is_membro_only = true),
    'cadastros_app_hoje', (SELECT count(*) FROM profiles WHERE is_membro_only = true AND created_at >= (SELECT ini FROM hoje)),
    'cadastros_total', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL),
    'cadastros_hoje', (SELECT count(*) FROM mem_membros WHERE deleted_at IS NULL AND created_at >= (SELECT ini FROM hoje)),
    'cadastros_recentes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'em', em) ORDER BY em DESC), '[]')
                           FROM (SELECT coalesce(m.nome, p.name) AS nome, p.created_at AS em
                                 FROM profiles p LEFT JOIN mem_membros m ON m.id = p.membro_id
                                 WHERE p.is_membro_only = true
                                 ORDER BY p.created_at DESC LIMIT 15) c)
  )
$function$;

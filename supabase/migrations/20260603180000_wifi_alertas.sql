-- =====================================================================
-- Módulo WiFi · alertas de frequência (regras) + filtros por culto (2026-06-03)
-- =====================================================================
-- ADITIVA · idempotente. Sem LLM: padrões calculados por regras.
-- =====================================================================

-- ── fn_wifi_cultos com filtros: serviço (faixa de horário) + dia da semana ──
DROP FUNCTION IF EXISTS public.fn_wifi_cultos(date, date);
CREATE OR REPLACE FUNCTION public.fn_wifi_cultos(
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL,
  p_service_type uuid DEFAULT NULL, p_dow int DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.data DESC, t.servico), '[]'::jsonb)
  FROM (
    SELECT c.id, c.data, c.nome AS culto_nome, st.name AS servico, c.service_type_id,
           COALESCE(c.presencial_adulto,0) AS presencial,
           count(*) FILTER (WHERE cx.evento='login')::int AS logins,
           count(DISTINCT upper(cx.mac_address)) FILTER (WHERE cx.evento='login')::int AS dispositivos,
           count(DISTINCT v.cpf_norm)::int AS pessoas_identificadas
      FROM public.cultos c
      JOIN public.vol_service_types st ON st.id = c.service_type_id
      LEFT JOIN public.wifi_conexoes cx ON cx.culto_id = c.id AND cx.deleted_at IS NULL
      LEFT JOIN public.wifi_visitantes v ON v.id = cx.wifi_visitante_id
     WHERE c.deleted_at IS NULL
       AND (p_inicio IS NULL OR c.data >= p_inicio)
       AND (p_fim IS NULL OR c.data <= p_fim)
       AND (p_service_type IS NULL OR c.service_type_id = p_service_type)
       AND (p_dow IS NULL OR st.recurrence_day = p_dow)
     GROUP BY c.id, c.data, c.nome, st.name, c.service_type_id
     HAVING count(*) FILTER (WHERE cx.evento='login') > 0
     ORDER BY c.data DESC, st.name
     LIMIT 400
  ) t;
$$;

-- ── fn_wifi_alertas · classifica pessoas por padrão de frequência ──
-- afastando      = vinha 3+ semanas seguidas e parou (>=10d sem vir)
-- em_risco       = veio 2+ vezes e está 14-60d sem vir
-- voltou         = sumiu 28+ dias e voltou agora (<=10d)
-- novo_recorrente= 1ª vez há <=45d, já veio 2+ vezes, ativo
-- fiel           = 4+ semanas seguidas e ativo (<=10d)
CREATE OR REPLACE FUNCTION public.fn_wifi_alertas()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH att AS (
    SELECT v.cpf_norm, c.data::date AS d
      FROM public.wifi_conexoes cx
      JOIN public.wifi_visitantes v ON v.id = cx.wifi_visitante_id AND v.deleted_at IS NULL
      JOIN public.cultos c ON c.id = cx.culto_id AND c.deleted_at IS NULL
     WHERE cx.evento='login' AND cx.deleted_at IS NULL AND v.cpf_norm IS NOT NULL
     GROUP BY v.cpf_norm, c.data::date
  ),
  wk AS (SELECT DISTINCT cpf_norm, ((d - DATE '2000-01-03')/7) AS wk FROM att),
  streak AS (
    SELECT cpf_norm, count(*) AS streak_atual
      FROM (
        SELECT cpf_norm, wk,
               (max(wk) OVER (PARTITION BY cpf_norm)) - wk AS diff,
               row_number() OVER (PARTITION BY cpf_norm ORDER BY wk DESC) - 1 AS rn
          FROM wk
      ) z
     WHERE diff = rn
     GROUP BY cpf_norm
  ),
  gaps AS (
    SELECT cpf_norm, max(g) AS max_gap FROM (
      SELECT cpf_norm, d - lag(d) OVER (PARTITION BY cpf_norm ORDER BY d) AS g FROM att
    ) t WHERE g IS NOT NULL GROUP BY cpf_norm
  ),
  agg AS (
    SELECT cpf_norm,
           count(*) AS total_visitas, min(d) AS primeira, max(d) AS ultima,
           (CURRENT_DATE - max(d)) AS dias_desde_ultima,
           count(*) FILTER (WHERE d >= CURRENT_DATE-30) AS visitas_30,
           count(*) FILTER (WHERE d >= CURRENT_DATE-60) AS visitas_60
      FROM att GROUP BY cpf_norm
  ),
  classif AS (
    SELECT ag.*,
           COALESCE(s.streak_atual,1) AS streak_atual, COALESCE(gp.max_gap,0) AS max_gap,
           CASE
             WHEN COALESCE(s.streak_atual,1) >= 3 AND ag.dias_desde_ultima >= 10 THEN 'afastando'
             WHEN ag.total_visitas >= 2 AND ag.dias_desde_ultima BETWEEN 14 AND 60 THEN 'em_risco'
             WHEN ag.dias_desde_ultima <= 10 AND COALESCE(gp.max_gap,0) >= 28 AND ag.total_visitas >= 3 THEN 'voltou'
             WHEN ag.primeira >= CURRENT_DATE-45 AND ag.total_visitas >= 2 AND ag.dias_desde_ultima <= 14 THEN 'novo_recorrente'
             WHEN COALESCE(s.streak_atual,1) >= 4 AND ag.dias_desde_ultima <= 10 THEN 'fiel'
             ELSE NULL
           END AS categoria
      FROM agg ag
      LEFT JOIN streak s ON s.cpf_norm = ag.cpf_norm
      LEFT JOIN gaps gp ON gp.cpf_norm = ag.cpf_norm
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cpf_norm', c.cpf_norm, 'nome', p.nome, 'telefone', p.telefone,
           'membro_id', p.membro_id, 'eh_membro', p.eh_membro,
           'categoria', c.categoria, 'streak_atual', c.streak_atual,
           'total_visitas', c.total_visitas, 'dias_desde_ultima', c.dias_desde_ultima,
           'primeira', c.primeira, 'ultima', c.ultima
         )
         ORDER BY CASE c.categoria
                    WHEN 'afastando' THEN 1 WHEN 'em_risco' THEN 2 WHEN 'voltou' THEN 3
                    WHEN 'novo_recorrente' THEN 4 WHEN 'fiel' THEN 5 ELSE 9 END,
                  c.dias_desde_ultima DESC), '[]'::jsonb)
    FROM classif c
    JOIN public.vw_wifi_pessoas p ON p.cpf_norm = c.cpf_norm
   WHERE c.categoria IS NOT NULL;
$$;

-- ── fn_wifi_semanas · agregado por semana ISO (presença real × WiFi) ──
-- Mesma lógica de semana dos cultos (date_trunc 'week' = segunda). Permite
-- comparar a presença lançada no ministerial (presencial_adulto) com quantos
-- se conectaram no WiFi naquela semana. Aceita os mesmos filtros do /cultos.
CREATE OR REPLACE FUNCTION public.fn_wifi_semanas(
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL,
  p_service_type uuid DEFAULT NULL, p_dow int DEFAULT NULL
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cultos_wk AS (
    SELECT c.id, date_trunc('week', c.data)::date AS semana,
           COALESCE(c.presencial_adulto,0) AS presencial
      FROM public.cultos c
      JOIN public.vol_service_types st ON st.id = c.service_type_id
     WHERE c.deleted_at IS NULL
       AND (p_inicio IS NULL OR c.data >= p_inicio)
       AND (p_fim IS NULL OR c.data <= p_fim)
       AND (p_service_type IS NULL OR c.service_type_id = p_service_type)
       AND (p_dow IS NULL OR st.recurrence_day = p_dow)
  ),
  pres AS (
    SELECT semana, sum(presencial)::int AS presencial, count(*)::int AS cultos
      FROM cultos_wk GROUP BY semana
  ),
  cx AS (
    SELECT cw.semana,
           count(c2.id)::int AS conexoes,
           count(DISTINCT upper(c2.mac_address))::int AS dispositivos,
           count(DISTINCT v.cpf_norm)::int AS identificadas
      FROM cultos_wk cw
      JOIN public.wifi_conexoes c2 ON c2.culto_id = cw.id AND c2.evento='login' AND c2.deleted_at IS NULL
      LEFT JOIN public.wifi_visitantes v ON v.id = c2.wifi_visitante_id
     GROUP BY cw.semana
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.semana DESC), '[]'::jsonb)
  FROM (
    SELECT p.semana, p.presencial, p.cultos,
           COALESCE(cx.conexoes,0) AS conexoes,
           COALESCE(cx.dispositivos,0) AS dispositivos,
           COALESCE(cx.identificadas,0) AS identificadas
      FROM pres p LEFT JOIN cx ON cx.semana = p.semana
     WHERE p.presencial > 0 OR COALESCE(cx.conexoes,0) > 0
     ORDER BY p.semana DESC
     LIMIT 120
  ) t;
$$;

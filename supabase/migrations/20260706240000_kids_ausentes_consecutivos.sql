-- Alerta Kids · criança ativa faltando N cultos seguidos (2026-07-06)
-- Pedido do Matheus: criança ativa que ficou 3 cultos seguidos sem vir gera
-- alerta pra equipe do Kids (Mari/Milena). Conta CULTOS (datas distintas de
-- sessões encerradas) faltados desde a última presença. Só quem já veio antes
-- (era ativo de fato) e some recentemente (última presença ≤ 90d), pra não
-- floodar com quem sumiu há muito tempo (esses viram depuração).
CREATE OR REPLACE FUNCTION public.fn_kids_ausentes_consecutivos(p_min int DEFAULT 3)
RETURNS TABLE(crianca_id uuid, nome text, ultima_presenca date, cultos_perdidos int)
LANGUAGE sql STABLE AS $$
  WITH sess AS (
    SELECT s.id, c.data
    FROM public.kids_sessoes s
    JOIN public.cultos c ON c.id = s.culto_id
    WHERE s.status = 'encerrada'
  ),
  ult AS (
    SELECT ci.crianca_id, max(se.data) AS ultima_data
    FROM public.kids_checkins ci
    JOIN sess se ON se.id = ci.sessao_id
    GROUP BY ci.crianca_id
  )
  SELECT
    k.id,
    k.nome,
    ult.ultima_data,
    (SELECT count(DISTINCT se2.data) FROM sess se2 WHERE se2.data > ult.ultima_data)::int AS cultos_perdidos
  FROM public.kids_criancas k
  JOIN ult ON ult.crianca_id = k.id
  WHERE k.ativo = true
    AND k.deleted_at IS NULL
    AND COALESCE(k.visitante, false) = false
    AND ult.ultima_data >= (CURRENT_DATE - INTERVAL '90 days')
    AND (SELECT count(DISTINCT se2.data) FROM sess se2 WHERE se2.data > ult.ultima_data) >= p_min;
$$;

COMMENT ON FUNCTION public.fn_kids_ausentes_consecutivos(int) IS
  'Crianças ativas (não-visitantes) ausentes há >= p_min cultos (datas distintas de sessões encerradas) desde a última presença, com última presença nos últimos 90 dias. Alimenta o alerta do Kids.';

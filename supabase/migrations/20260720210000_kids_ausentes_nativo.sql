-- Radar de frequência do Kids 100% NATIVO (2026-07-20 · decisão do Marcos:
-- começar a excluir tudo que vem do Planning Center). A presença por criança
-- passa a sair DIRETO dos check-ins do totem (kids_checkins × kids_sessoes →
-- culto → data) em vez da tabela kids_pco_presencas (que era alimentada pelo
-- coletor do PCO, agora removido do código).
--
-- Assinatura e retorno preservados — o backend (GET /totem-kids/ausentes) e o
-- notificacaoGenerator chamam a mesma RPC. Backwards-compatible: enquanto esta
-- migration não roda, a versão anterior continua funcionando (lendo o histórico
-- congelado de kids_pco_presencas).
--
-- A tabela kids_pco_presencas fica no banco como histórico congelado (nenhum
-- código lê ou grava mais). O DROP fica pra uma limpeza futura, com aval
-- explícito, junto de kids_criancas.planning_center_id.
CREATE OR REPLACE FUNCTION public.fn_kids_ausentes_consecutivos(p_min int DEFAULT 3)
RETURNS TABLE(crianca_id uuid, nome text, ultima_presenca date, cultos_perdidos int)
LANGUAGE sql STABLE AS $$
  WITH pres AS (
    -- 1 linha por criança × data de culto em que ela teve check-in no totem
    SELECT DISTINCT ck.crianca_id, cu.data
    FROM public.kids_checkins ck
    JOIN public.kids_sessoes s ON s.id = ck.sessao_id
    JOIN public.cultos cu ON cu.id = s.culto_id
    WHERE ck.deleted_at IS NULL
  ),
  cal AS (
    -- calendário = dias em que HOUVE check-in de Kids (qualquer criança)
    SELECT DISTINCT data FROM pres
  ),
  ult AS (
    SELECT p.crianca_id, max(p.data) AS ultima_data
    FROM pres p
    GROUP BY p.crianca_id
  )
  SELECT
    k.id, k.nome, ult.ultima_data,
    (SELECT count(*) FROM cal WHERE cal.data > ult.ultima_data)::int AS cultos_perdidos
  FROM public.kids_criancas k
  JOIN ult ON ult.crianca_id = k.id
  WHERE k.ativo = true
    AND k.deleted_at IS NULL
    AND COALESCE(k.visitante, false) = false
    AND ult.ultima_data >= (CURRENT_DATE - INTERVAL '90 days')
    AND (SELECT count(*) FROM cal WHERE cal.data > ult.ultima_data) >= p_min;
$$;

COMMENT ON FUNCTION public.fn_kids_ausentes_consecutivos(int) IS
  'Crianças frequentadoras ativas faltando N+ cultos seguidos · presença = check-ins do totem (kids_checkins), sem Planning Center (2026-07-20).';

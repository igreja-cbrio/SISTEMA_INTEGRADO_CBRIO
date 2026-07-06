-- Presença de criança por culto vinda do Planning Center Check-Ins (2026-07-06)
-- Pedido do Matheus: usar o check-in do PCO (por criança) como fonte da
-- frequência do Kids — sem depender do totem nem de abrir sessão manual. O
-- coletor do PCO já traz o check-in por criança (pco_id); aqui persistimos a
-- presença (1 linha por criança × data de culto) pra alimentar o alerta/aba
-- "faltando 3+ cultos" e a frequência histórica.
CREATE TABLE IF NOT EXISTS public.kids_pco_presencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crianca_id UUID NOT NULL REFERENCES public.kids_criancas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  culto_id UUID REFERENCES public.cultos(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crianca_id, data)
);
CREATE INDEX IF NOT EXISTS idx_kids_pco_presencas_data ON public.kids_pco_presencas (data);
CREATE INDEX IF NOT EXISTS idx_kids_pco_presencas_crianca ON public.kids_pco_presencas (crianca_id);

ALTER TABLE public.kids_pco_presencas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kids_pco_presencas_select ON public.kids_pco_presencas;
CREATE POLICY kids_pco_presencas_select ON public.kids_pco_presencas
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS kids_pco_presencas_service ON public.kids_pco_presencas;
CREATE POLICY kids_pco_presencas_service ON public.kids_pco_presencas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Detecção de faltantes agora vem das presenças do PCO (calendário = dias com
-- QUALQUER presença de kids · uma criança "faltou" um culto que aconteceu depois
-- da última presença dela). Mantém a assinatura pra não quebrar chamadas.
CREATE OR REPLACE FUNCTION public.fn_kids_ausentes_consecutivos(p_min int DEFAULT 3)
RETURNS TABLE(crianca_id uuid, nome text, ultima_presenca date, cultos_perdidos int)
LANGUAGE sql STABLE AS $$
  WITH cal AS (
    SELECT DISTINCT data FROM public.kids_pco_presencas
  ),
  ult AS (
    SELECT p.crianca_id, max(p.data) AS ultima_data
    FROM public.kids_pco_presencas p
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

-- ============================================================================
-- Cultos · cancelamento de ocorrência (2026-07-06)
--
-- Marcos: "existem alguns cultos que raramente são excluídos ou alterados os
-- dias — ontem não houve culto de domingo à noite pois o jogo Brasil x Noruega
-- atrapalharia o horário". Hoje não existe conceito de culto cancelado:
--   · DELETE físico não resolve · gerar_cultos_recorrentes() e o
--     /kpis/cultos/auto-create recriam a linha por (service_type_id, data)
--     na próxima execução.
--   · O culto fica eternamente "pendente de preenchimento" na Integração,
--     aparece pra Produção como culto a preparar e entra na contagem anual.
--
-- Solução: a linha do culto NUNCA sai · ganha cancelado=true + motivo.
--   · O EXISTS do gerador continua encontrando a linha → não recria. Nada
--     muda em gerar_cultos_recorrentes.
--   · A UNIQUE (service_type_id, data) segue valendo · remarcação vira
--     "cancela o original + cria culto avulso na nova data" (backend).
--   · vw_culto_stats CONTINUA expondo cancelados (com as colunas novas) ·
--     calendário da Integração e semana da Produção mostram o culto marcado
--     como cancelado em vez de sumir com ele.
--   · vw_culto_historico_anual passa a EXCLUIR cancelados (contagem de
--     cultos/ano e proporção de preenchidos ficariam infladas).
--   · Somas de KPI (frequência, decisões) não mudam · culto cancelado tem
--     zeros e já contribuía com 0 hoje.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas de cancelamento
-- ----------------------------------------------------------------------------
ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS cancelado         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelado_motivo  text,
  ADD COLUMN IF NOT EXISTS cancelado_em      timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cultos.cancelado IS
  'TRUE quando a ocorrência não aconteceu/não vai acontecer (ex: jogo, feriado). '
  'A linha permanece pra: (1) o gerador recorrente não recriar o slot; '
  '(2) Integração/Produção verem o culto marcado como cancelado. '
  'Remarcação = cancelar o original + criar culto avulso na nova data.';
COMMENT ON COLUMN public.cultos.cancelado_motivo IS
  'Motivo visível na UI (ex: "Jogo Brasil x Noruega no horário do culto").';

-- ----------------------------------------------------------------------------
-- 2. Recria vw_culto_stats · re-expande c.* pra incluir as colunas novas
--    (SELECT c.* congela a lista de colunas na criação · mesmo padrão da
--    20260624120000). Definição idêntica + colunas novas via c.*.
--    Nada depende da view (backend faz SELECT simples) · sem CASCADE.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_culto_stats;

CREATE VIEW public.vw_culto_stats AS
SELECT
  c.*,
  vst.name              AS service_type_name,
  vst.color             AS service_type_color,
  vst.presencial_label  AS service_type_presencial_label,
  vst.has_kids          AS service_type_has_kids,
  vst.has_online        AS service_type_has_online,
  ROUND(c.presencial_adulto::numeric / 1300 * 100, 1)                        AS taxa_ocupacao,
  (c.presencial_adulto + c.presencial_kids)                                   AS total_presencial,
  (COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0))      AS total_decisoes
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id;

-- ----------------------------------------------------------------------------
-- 3. vw_culto_historico_anual · exclui cancelados da contagem anual
--    (COUNT(*) de total_cultos e a proporção de preenchidos inflariam ·
--    somas não mudam, culto cancelado tem zeros). Definição de
--    20260514150000 + WHERE NOT c.cancelado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_culto_historico_anual AS
SELECT
  EXTRACT(YEAR FROM c.data)::int                 AS ano,
  c.service_type_id,
  vst.name                                       AS service_type_name,
  vst.color                                      AS service_type_color,
  COUNT(*)                                       AS total_cultos,
  COUNT(*) FILTER (
    WHERE c.presencial_adulto > 0 OR c.presencial_kids > 0
  )                                              AS cultos_preenchidos,
  COALESCE(SUM(c.presencial_adulto), 0)::int     AS presencial_total,
  COALESCE(SUM(c.presencial_kids), 0)::int       AS kids_total,
  COALESCE(SUM(c.decisoes_presenciais), 0)::int  AS decisoes_presenciais_total,
  COALESCE(SUM(c.decisoes_online), 0)::int       AS decisoes_online_total,
  COALESCE(SUM(c.online_pico), 0)::int           AS online_pico_total,
  ROUND(AVG(c.online_pico) FILTER (WHERE c.online_pico > 0))::int AS online_pico_avg,
  COALESCE(SUM(c.online_ds), 0)::int             AS online_ds_total,
  COALESCE(SUM(c.online_ddus), 0)::int           AS online_ddus_total
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id
WHERE NOT c.cancelado
GROUP BY ano, c.service_type_id, vst.name, vst.color
ORDER BY ano DESC, vst.name;

COMMENT ON VIEW public.vw_culto_historico_anual IS
  'Histórico anual de frequência, decisões e online por tipo de culto · '
  'exclui cultos cancelados · suporta qualquer volume sem limit no front';

-- ----------------------------------------------------------------------------
-- Conferência (rodar no Studio depois):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='vw_culto_stats' AND column_name LIKE 'cancelado%';
--     · Espera: cancelado, cancelado_motivo, cancelado_em, cancelado_por
--
--   -- Cancelar um culto de teste e confirmar que o gerador NÃO recria:
--   UPDATE cultos SET cancelado=true, cancelado_motivo='teste'
--    WHERE data='2026-07-05' AND hora='19:00';
--   SELECT out_status FROM gerar_cultos_recorrentes('2026-07-05','2026-07-05');
--     · Espera: todos 'ja_existia' (nenhum 'criado' pro slot cancelado)
-- ============================================================================

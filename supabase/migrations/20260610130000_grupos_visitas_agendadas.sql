-- ============================================================================
-- Grupos · aba Visitas (agendamento + registro) — 2026-06-10
--
-- Marcos: transformar a aba "Tarefas" do /grupos numa aba de REGISTRO DE
-- VISITAS, onde supervisores, coordenadores e os pastores Nélio e Natasha
-- podem PROGRAMAR visitas aos grupos de conexão. Todo grupo ganha botão
-- "Agendar visita" e a aba tem filtro de grupos sem visita há 2+ meses.
--
-- A tabela grupo_supervisao_visitas (20260513140000) já guardava o LOG de
-- visitas realizadas. Esta migration a estende pra também guardar visitas
-- AGENDADAS (futuras), sem quebrar nada do fluxo existente:
--   1. status ('agendada' | 'realizada' | 'cancelada') · default 'realizada'
--      → todas as linhas existentes continuam contando como visita feita.
--   2. responsavel_id (uuid → profiles) · quem vai fazer a visita
--      (supervisor_id continua sendo o vínculo a mem_membros, mas pastores/
--      coordenadores que agendam não são necessariamente supervisores).
--   3. supervisor_id vira NULLABLE · pastor agenda visita em grupo sem
--      supervisor definido (antes o backend retornava 400 nesse caso).
--   4. vw_grupos_supervisao · ultima_visita/visitas_mes_atual passam a contar
--      SÓ status='realizada' (agendada futura não pode "zerar" o semáforo de
--      grupo sem visita) + nova coluna proxima_visita (min agendada >= hoje)
--      + filtro deleted_at IS NULL (mem_grupos tem soft-delete).
--
-- Aditiva e idempotente. KPI 'grupos.lideres_acompanhados' (coletor JS)
-- passa a filtrar status='realizada' no mesmo PR.
-- ============================================================================

-- 1. status da visita
ALTER TABLE public.grupo_supervisao_visitas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'realizada';

DO $$ BEGIN
  ALTER TABLE public.grupo_supervisao_visitas
    ADD CONSTRAINT grupo_supervisao_visitas_status_check
    CHECK (status IN ('agendada', 'realizada', 'cancelada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.grupo_supervisao_visitas.status IS
  'agendada (programada, ainda não aconteceu) · realizada (conta pro semáforo/KPI) · cancelada';

-- 2. responsável pela visita (quem vai visitar) · UUID FK, nunca texto livre
ALTER TABLE public.grupo_supervisao_visitas
  ADD COLUMN IF NOT EXISTS responsavel_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.grupo_supervisao_visitas.responsavel_id IS
  'Quem fará/fez a visita (profile) · supervisor_id segue como vínculo a mem_membros quando houver';

-- Backfill: nas linhas antigas, o responsável é quem registrou
UPDATE public.grupo_supervisao_visitas v
   SET responsavel_id = v.registrado_por
 WHERE v.responsavel_id IS NULL
   AND v.registrado_por IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.registrado_por);

-- 3. supervisor_id opcional (grupo pode não ter supervisor definido ainda)
ALTER TABLE public.grupo_supervisao_visitas
  ALTER COLUMN supervisor_id DROP NOT NULL;

-- 4. updated_at pra rastrear transição agendada→realizada/cancelada
ALTER TABLE public.grupo_supervisao_visitas
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Índice pra agenda (lista de visitas programadas)
CREATE INDEX IF NOT EXISTS idx_supervisao_visitas_agendadas
  ON public.grupo_supervisao_visitas (data_visita)
  WHERE status = 'agendada';

-- 5. View consolidada · só visita REALIZADA conta como "visitado";
--    proxima_visita = próxima agendada a partir de hoje.
--    (CREATE OR REPLACE mantém as colunas existentes na mesma ordem e
--     adiciona proxima_visita no final · compatível com os consumidores.)
CREATE OR REPLACE VIEW public.vw_grupos_supervisao AS
SELECT
  g.id, g.nome, g.categoria, g.local, g.dia_semana, g.horario,
  g.bairro, g.ativo, g.temporada, g.status_temporada,
  g.lider_id,
  l.nome AS lider_nome,
  g.supervisor_id,
  s.nome AS supervisor_nome,
  (SELECT count(*) FROM public.mem_grupo_membros m
     WHERE m.grupo_id = g.id AND m.saiu_em IS NULL) AS total_membros,
  (SELECT count(*) FROM public.mem_grupo_membros m
     WHERE m.grupo_id = g.id AND m.saiu_em IS NULL
       AND m.funcao = 'lider_treinamento') AS total_lider_treinamento,
  (SELECT max(v.data_visita) FROM public.grupo_supervisao_visitas v
     WHERE v.grupo_id = g.id AND v.status = 'realizada') AS ultima_visita,
  (SELECT count(*) FROM public.grupo_supervisao_visitas v
     WHERE v.grupo_id = g.id AND v.status = 'realizada'
       AND v.data_visita >= date_trunc('month', CURRENT_DATE)::date) AS visitas_mes_atual,
  (SELECT min(v.data_visita) FROM public.grupo_supervisao_visitas v
     WHERE v.grupo_id = g.id AND v.status = 'agendada'
       AND v.data_visita >= CURRENT_DATE) AS proxima_visita
FROM public.mem_grupos g
LEFT JOIN public.mem_membros l ON l.id = g.lider_id
LEFT JOIN public.mem_membros s ON s.id = g.supervisor_id
WHERE g.ativo = true
  AND g.deleted_at IS NULL;

COMMENT ON VIEW public.vw_grupos_supervisao IS
  'Um grupo ativo por linha · supervisor, líder, contagens, última visita REALIZADA e próxima visita AGENDADA';

-- ----------------------------------------------------------------------------
-- Conferência (descomenta no Studio):
-- SELECT status, count(*) FROM grupo_supervisao_visitas GROUP BY status;
-- SELECT nome, ultima_visita, proxima_visita FROM vw_grupos_supervisao LIMIT 10;
-- ============================================================================

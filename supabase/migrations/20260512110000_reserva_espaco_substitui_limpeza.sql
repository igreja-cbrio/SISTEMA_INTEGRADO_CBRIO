-- ============================================================================
-- AJUSTE · reserva_espaco substitui limpeza
--
-- Marcos: "ao inves de limpeza, coloca reserva de espaco · e ja aproveita
-- pra cobrir quais espacos vao ser usados na igreja e quando".
--
-- reserva_espaco engloba: alocacao de salas/auditorios/areas + limpeza/preparacao
-- automatica que vem junto. Vira um calendario de uso de espacos da igreja.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Atualiza enum area_adm_resp · troca limpeza -> reserva_espaco
--    Postgres exige ADD VALUE primeiro, depois UPDATE, depois nao tem como
--    remover valor de enum sem recriar. Vou adicionar reserva_espaco e
--    DESATIVAR linhas de SLA referentes a limpeza (sem dropar o valor).
-- ----------------------------------------------------------------------------
ALTER TYPE area_adm_resp ADD VALUE IF NOT EXISTS 'reserva_espaco';

-- Move SLAs de "limpeza" para "reserva_espaco" (mantem prazos iguais)
INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao)
SELECT 'reserva_espaco', subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas,
       replace(descricao, 'Limpeza', 'Reserva de espaco')
  FROM public.sla_definicoes
 WHERE area_responsavel = 'limpeza'
ON CONFLICT (area_responsavel, subcategoria, eh_urgente) DO NOTHING;

-- Desativa SLAs antigos de limpeza
UPDATE public.sla_definicoes
   SET ativo = false, updated_at = now()
 WHERE area_responsavel = 'limpeza';

-- Move solicitacoes existentes (caso ja tenha alguma)
UPDATE public.solicitacoes
   SET area_responsavel = 'reserva_espaco'
 WHERE area_responsavel = 'limpeza';

-- ----------------------------------------------------------------------------
-- 2. Campos novos em solicitacoes · especificos para reserva de espaco
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS espaco_solicitado text,
  ADD COLUMN IF NOT EXISTS data_uso date,
  ADD COLUMN IF NOT EXISTS horario_inicio time,
  ADD COLUMN IF NOT EXISTS horario_fim time,
  ADD COLUMN IF NOT EXISTS qtde_pessoas int;

COMMENT ON COLUMN public.solicitacoes.espaco_solicitado IS 'Sala/auditorio/area solicitado (texto livre por enquanto · pode virar FK pra tabela de espacos depois).';
COMMENT ON COLUMN public.solicitacoes.data_uso IS 'Data do uso do espaco (reserva_espaco) ou data necessaria (outras categorias).';

-- Indice pra calendario de uso (consultas por periodo)
CREATE INDEX IF NOT EXISTS idx_solicitacoes_reserva_espaco
  ON public.solicitacoes (data_uso, horario_inicio)
  WHERE area_responsavel = 'reserva_espaco' AND data_uso IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. View · calendario de espacos · pra UI mostrar conflitos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_reserva_espacos AS
SELECT
  s.id,
  s.titulo,
  s.espaco_solicitado,
  s.data_uso,
  s.horario_inicio,
  s.horario_fim,
  s.qtde_pessoas,
  s.area_cliente,
  s.solicitante_id,
  s.status,
  s.created_at,
  -- Junta com profile pra mostrar quem pediu
  p.name AS solicitante_nome
FROM public.solicitacoes s
LEFT JOIN public.profiles p ON p.id = s.solicitante_id
WHERE s.area_responsavel = 'reserva_espaco'
  AND s.status NOT IN ('rejeitado')
  AND s.data_uso IS NOT NULL
ORDER BY s.data_uso, s.horario_inicio;

GRANT SELECT ON public.vw_reserva_espacos TO authenticated, service_role;

COMMENT ON VIEW public.vw_reserva_espacos IS
  'Calendario de uso de espacos da igreja. Aprovadas + em_analise + pendentes. UI deve detectar conflitos (mesmo espaco, mesma data, horarios sobrepostos).';

-- ----------------------------------------------------------------------------
-- Conferencia
-- ----------------------------------------------------------------------------
-- SELECT area_responsavel, count(*) FROM sla_definicoes WHERE ativo = true GROUP BY area_responsavel;
-- Espera: reserva_espaco com 2 linhas, limpeza ausente (todas inativas)

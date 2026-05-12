-- ============================================================================
-- AJUSTE PARTE 2 · usa 'reserva_espaco' (depende do enum comitado em 110000)
--
-- Roda DEPOIS da migration 20260512110000 (precisa que o ALTER TYPE esteja
-- commitado · Postgres exige separar enum-creation de enum-use).
-- ============================================================================

-- Move SLAs de "limpeza" para "reserva_espaco" (mantem prazos iguais)
INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao)
SELECT 'reserva_espaco'::area_adm_resp, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas,
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
   SET area_responsavel = 'reserva_espaco'::area_adm_resp
 WHERE area_responsavel = 'limpeza';

-- Indice pra calendario de uso (consultas por periodo)
CREATE INDEX IF NOT EXISTS idx_solicitacoes_reserva_espaco
  ON public.solicitacoes (data_uso, horario_inicio)
  WHERE area_responsavel = 'reserva_espaco' AND data_uso IS NOT NULL;

-- View · calendario de espacos
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
  p.name AS solicitante_nome
FROM public.solicitacoes s
LEFT JOIN public.profiles p ON p.id = s.solicitante_id
WHERE s.area_responsavel = 'reserva_espaco'
  AND s.status NOT IN ('rejeitado')
  AND s.data_uso IS NOT NULL
ORDER BY s.data_uso, s.horario_inicio;

GRANT SELECT ON public.vw_reserva_espacos TO authenticated, service_role;

COMMENT ON VIEW public.vw_reserva_espacos IS
  'Calendario de uso de espacos da igreja. UI usa pra detectar conflitos.';

-- Conferencia:
-- SELECT area_responsavel, count(*) FROM sla_definicoes WHERE ativo = true GROUP BY area_responsavel;
-- Espera: 'reserva_espaco' com 2 linhas, sem 'limpeza' ativa

-- ============================================================================
-- SLAs das novas areas + subcategoria 'licenca' do RH
--
-- Roda DEPOIS de 20260515160000 porque o enum precisa ja estar com os valores
-- novos commited.
-- ============================================================================

INSERT INTO public.sla_definicoes (area_responsavel, subcategoria, eh_urgente, sla_resposta_horas, sla_resolucao_horas, descricao) VALUES
  -- MARKETING · design/peca grafica/video/redes
  ('marketing',      'default', false, 48,  168, 'Padrao · resposta 2d + entrega ate 1 semana'),
  ('marketing',      'default', true,  4,   24,  'Urgente · entrega no mesmo dia ou ate 24h'),

  -- RESERVA DE ESPACO · agenda da igreja
  ('reserva_espaco', 'default', false, 24,  72,  'Confirmacao em 1 dia util · agendamento ate 3 dias'),
  ('reserva_espaco', 'default', true,  4,   8,   'Evento iminente · resposta no mesmo dia'),

  -- RH · LICENCA (subcategoria nova, mesma area)
  ('rh',             'licenca', false, 72,  72,  'Aprovacao de licenca · resposta 3 dias'),
  ('rh',             'licenca', true,  24,  24,  'Licenca urgente (medica) · resposta 1 dia')
ON CONFLICT (area_responsavel, subcategoria, eh_urgente) DO NOTHING;

-- Conferencia:
--   SELECT area_responsavel, subcategoria, eh_urgente, sla_resposta_horas
--   FROM sla_definicoes ORDER BY area_responsavel, subcategoria;
-- ============================================================================

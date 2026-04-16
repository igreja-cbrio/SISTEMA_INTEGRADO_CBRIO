-- Tipos de culto padrao da CBRio
-- Domingo tem 4 horarios distintos, cada um e um tipo separado
INSERT INTO vol_service_types (id, name, recurrence_day, recurrence_time, color, is_active)
VALUES
  (gen_random_uuid(), 'Quarta com Deus', 3, '20:00', '#6366f1', true),
  (gen_random_uuid(), 'AMI',             6, '20:00', '#f59e0b', true),
  (gen_random_uuid(), 'Bridge',          6, '17:00', '#ec4899', true),
  (gen_random_uuid(), 'Domingo 08:30',   0, '08:30', '#00B39D', true),
  (gen_random_uuid(), 'Domingo 10:00',   0, '10:00', '#10b981', true),
  (gen_random_uuid(), 'Domingo 11:30',   0, '11:30', '#3b82f6', true),
  (gen_random_uuid(), 'Domingo 19:00',   0, '19:00', '#8b5cf6', true)
ON CONFLICT DO NOTHING;

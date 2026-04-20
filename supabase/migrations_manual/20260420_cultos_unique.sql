-- Migration manual — rodar no SQL Editor do Supabase
-- Garante que não haja cultos duplicados ao auto-criar pelo cron semanal.
-- Usa expressão para tolerar service_type_id NULL (cultos legados sem tipo).

CREATE UNIQUE INDEX IF NOT EXISTS cultos_service_type_data_hora_uniq
  ON public.cultos (COALESCE(service_type_id, '00000000-0000-0000-0000-000000000000'::uuid), data, hora);

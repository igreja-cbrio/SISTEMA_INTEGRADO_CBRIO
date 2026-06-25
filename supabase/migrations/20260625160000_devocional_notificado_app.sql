-- Devocional · flag de notificação do app (2026-06-25)
-- Quando a equipe sobe/gera o devocional da semana, o app recebe um push.
-- O flag garante 1 push por plano (não dispara a cada lote/edição).
ALTER TABLE public.devocional_planos
  ADD COLUMN IF NOT EXISTS notificado_app boolean NOT NULL DEFAULT false;

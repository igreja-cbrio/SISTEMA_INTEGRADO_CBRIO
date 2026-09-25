-- Vídeo no item do devocional (25/09/2026 · pedido do Marcos).
--
-- `video_path` é o caminho no bucket (é o que permite APAGAR o arquivo ao
-- trocar/remover); `video_url` é a URL pública que o app toca. O app lê
-- `video_url` e, se esta migration ainda não rodou, cai no select antigo
-- (42703) — nada quebra antes dela.
--
-- ⚠️ O grant do app em devocional_itens é de TABELA (20260923180000), então a
-- coluna nova já nasce legível pro `authenticated`. Nada a conceder.
--
-- Bucket PÚBLICO de leitura: o vídeo é conteúdo do devocional, igual o texto.
-- Escrita só por link assinado emitido pela API (service role) — sem policy de
-- INSERT pra ninguém.

ALTER TABLE public.devocional_itens
  ADD COLUMN IF NOT EXISTS video_url  text,
  ADD COLUMN IF NOT EXISTS video_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('devocional-videos', 'devocional-videos', true, 524288000,
        ARRAY['video/mp4', 'video/quicktime', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

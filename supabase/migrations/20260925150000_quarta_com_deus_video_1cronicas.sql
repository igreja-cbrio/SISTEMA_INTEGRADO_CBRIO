-- Quarta com Deus · edição 1 Crônicas (31/08–04/09/2026) ganha o vídeo do
-- culto (25/09/2026 · pedido do Marcos: "o de quarta com deus que já tem até o
-- link do vídeo, pode colocar ele passando aqui no app").
--
-- O vídeo é o do próprio culto da edição, publicado no canal da CBRio e
-- coletado pelo módulo Online (online_videos, série QUARTA COM DEUS):
-- "DESCOMPLICANDO A BÍBLIA - Livro: 1º Crônicas - Pr. Pedrão - 02/09/2026".
-- Vai no item do DIA DO CULTO (quarta, 02/09).
--
-- ⚠️ Depende de 20260925120000 (a coluna). Idempotente: só grava onde ainda não
-- há vídeo — não passa por cima de um que a equipe tenha posto à mão.
UPDATE public.devocional_itens
   SET video_url = 'https://www.youtube.com/watch?v=e2-TJDiAS0U'
 WHERE plano_id = 'd4d4d4d4-2026-4000-8000-000000000001'
   AND data = '2026-09-02'
   AND video_url IS NULL;

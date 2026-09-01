-- ============================================================================
-- Sorteio · re-sorteio SUBSTITUI o ganhador do prêmio, não empilha linha
-- ============================================================================
-- Pedido do Marcos (2026-07-31): "uma pessoa não pode ganhar dois prêmios no
-- mesmo sorteio do mesmo evento". Com o dedup por PESSOA no lugar, o botão
-- "Re-sortear" (que já existia na tela) virou um problema: ele chamava o mesmo
-- endpoint e INSERIA uma 2ª linha para o MESMO prêmio. Efeito: a tela mostrava
-- o primeiro ganhador (o `find` pega o 1º), o prêmio parecia entregue a ele, e
-- o ganhador antigo ficava **bloqueado de concorrer** sem ter prêmio na mão.
--
-- Coluna, não DELETE: quem foi sorteado e por que o ganhador mudou é justamente
-- a informação que alguém vai querer depois do palco. `insc_sorteios` é registro
-- operacional; apagar linha aqui destruiria a trilha.
--
-- Aditiva e idempotente. O código tolera a ausência da coluna (a leitura da tela
-- do evento faz consulta ISOLADA best-effort e o sorteio tem fallback de select)
-- — mas só COM ela o re-sorteio deixa de bloquear pessoa.
-- ============================================================================

SET lock_timeout = '10s';

ALTER TABLE public.insc_sorteios
  ADD COLUMN IF NOT EXISTS substituido_em TIMESTAMPTZ;

COMMENT ON COLUMN public.insc_sorteios.substituido_em IS
  'Quando este sorteio foi SUBSTITUÍDO por um re-sorteio do mesmo prêmio. Linha com valor não conta como prêmio entregue: sai da leitura da tela e o ganhador trocado volta a concorrer (ele não ficou com prêmio). NULL = sorteio válido. Nunca apagar a linha — é a trilha de quem foi sorteado antes.';

-- Leitura do sorteio válido por evento (a tela filtra por isto).
CREATE INDEX IF NOT EXISTS idx_insc_sorteios_validos
  ON public.insc_sorteios (evento_id)
  WHERE substituido_em IS NULL;

-- ── Conferência ─────────────────────────────────────────────────────────────
--   SELECT evento_id, count(*) FILTER (WHERE substituido_em IS NULL) AS validos,
--          count(*) FILTER (WHERE substituido_em IS NOT NULL) AS substituidos
--     FROM public.insc_sorteios GROUP BY 1;
-- Esperado hoje: 0 linhas (nenhum sorteio feito ainda no Celebra).

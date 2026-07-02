-- Self-heal do pico ao vivo (bug real 2026-07-01: pico do culto de quarta ficou
-- 99 · o live-monitor amostrou só o começo da live e o catch-up NÃO corrigia
-- porque só agia com pico VAZIO).
-- O peak da Analytics (>= D+3) é autoritativo e corrige PRA CIMA no catch-up
-- diário. Esta flag marca o culto como já conferido (não reprocessa pra sempre).
-- Já aplicada em prod via MCP.
ALTER TABLE public.cultos ADD COLUMN IF NOT EXISTS online_pico_verificado boolean NOT NULL DEFAULT false;
-- Cultos antigos (>30d) ficam como estão · sem backlog de reprocessamento.
UPDATE public.cultos SET online_pico_verificado = true
 WHERE data < current_date - 30 AND online_pico_verificado = false;
COMMENT ON COLUMN public.cultos.online_pico_verificado IS 'Pico ao vivo já conferido/corrigido contra o peakConcurrentViewers da YouTube Analytics (catch-up diário · >= D+3). false = ainda por verificar.';

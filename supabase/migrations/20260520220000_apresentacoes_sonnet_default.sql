-- =====================================================================
-- Apresentacoes · default = Sonnet 4.6 + auto-timeout pra travados
-- =====================================================================
-- Mudanca de default do modelo (Opus 4.7 -> Sonnet 4.6) porque Opus
-- nao cabe nos 60s da Vercel Hobby. Opus continua disponivel via toggle
-- "Premium" no momento da criacao.
--
-- Adiciona funcao SQL pra marcar como 'erro' qualquer apresentacao que
-- ficou em 'gerando' ha mais de 2min (o que indica que o Vercel matou
-- a function antes do catch setar erro). Pode ser chamada via cron ou
-- via trigger no select.
-- =====================================================================

-- Default novo · so afeta inserts dali pra frente
ALTER TABLE public.apresentacoes
  ALTER COLUMN modelo_ia SET DEFAULT 'claude-sonnet-4-6';

-- Funcao que marca travados como erro. Pode ser chamada manualmente
-- (SELECT public.apresentacoes_auto_timeout()) ou via cron Vercel.
CREATE OR REPLACE FUNCTION public.apresentacoes_auto_timeout()
RETURNS TABLE(resetadas int) AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.apresentacoes
     SET status = 'erro',
         erro_mensagem = COALESCE(
           NULLIF(erro_mensagem, ''),
           'Timeout automatico (>2min em gerando). Function Vercel limita 60s. ' ||
           'Tente novamente com prompt mais enxuto ou modelo Sonnet (modo rapido).'
         )
   WHERE status = 'gerando'
     AND updated_at < now() - interval '2 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN QUERY SELECT n;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup de travados que ja existem hoje · roda uma vez ao aplicar
SELECT public.apresentacoes_auto_timeout();

COMMENT ON FUNCTION public.apresentacoes_auto_timeout() IS
  'Marca como erro apresentacoes travadas em gerando >2min (Vercel timeout)';

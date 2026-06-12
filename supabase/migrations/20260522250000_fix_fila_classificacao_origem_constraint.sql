-- FIX · PR #638 (Conciliacao Inteligente) deixou o CHECK constraint antigo
-- que nao aceitava os valores novos: memoria_documento, memoria_nome, sem_sugestao.
-- Trigger tg_fila_auto_classificar falhava silenciosamente · INSERT em
-- fin_lancamentos_brutos era abortado em cascata. Caso real 2026-05-22:
-- upload OFX de 472 registros so persistiu 35 (os 437 PIX recebidos foram
-- abortados pelo CHECK).

ALTER TABLE fin_fila_classificacao
  DROP CONSTRAINT IF EXISTS fin_fila_classificacao_sugestao_origem_check;

ALTER TABLE fin_fila_classificacao
  ADD CONSTRAINT fin_fila_classificacao_sugestao_origem_check
  CHECK (sugestao_origem IS NULL OR sugestao_origem IN (
    'regra', 'memoria', 'memoria_documento', 'memoria_nome',
    'centavo', 'ia', 'manual', 'sem_sugestao'
  ));

COMMIT;

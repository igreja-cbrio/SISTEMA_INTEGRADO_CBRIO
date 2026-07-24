-- Fase 3 · conciliação balanço × OFX: guarda a proveniência/estado da
-- identificação do doador por CPF do OFX na linha do balanço. Aditivo.
--   {status:'auto'|'confirmado'|'ignorado', bruto_id, cpf, via, em}
ALTER TABLE public.fin_transacoes
  ADD COLUMN IF NOT EXISTS conciliacao_ofx jsonb;

-- Acelera a fila de revisão (balanço receita Pix ainda sem membro nem decisão).
CREATE INDEX IF NOT EXISTS idx_fin_transacoes_conciliacao_pendente
  ON public.fin_transacoes (data_competencia)
  WHERE codigo_legado IS NOT NULL AND membro_id IS NULL AND conciliacao_ofx IS NULL;

-- CEP do inscrito de batismo vira coluna dedicada (antes ia concatenado em
-- observacoes junto com "Culto: …"). horario_culto já era coluna. Assim o detalhe
-- do inscrito mostra CEP e horário lá em cima (estilo cpf/telefone/email), sem
-- poluir as observações.

ALTER TABLE public.batismo_inscricoes
  ADD COLUMN IF NOT EXISTS cep text;

COMMENT ON COLUMN public.batismo_inscricoes.cep IS
  'CEP informado no formulário de batismo (campo dedicado · antes ia em observacoes). 2026-06-30.';

-- Backfill: extrai "CEP: 00000-000" das observações existentes.
UPDATE public.batismo_inscricoes
SET cep = (regexp_match(observacoes, 'CEP:\s*([0-9]{5}-?[0-9]{3})'))[1]
WHERE cep IS NULL AND observacoes ~ 'CEP:\s*[0-9]{5}';

-- Remove os prefixos "CEP: …." e "Culto: …." do início das observações
-- (viraram colunas dedicadas: cep e horario_culto). Mantém Motivo/Comentário.
UPDATE public.batismo_inscricoes
SET observacoes = NULLIF(regexp_replace(observacoes, '^\s*(CEP:[^.]*\.\s*)?(Culto:[^.]*\.\s*)?', ''), '')
WHERE observacoes ~ '^\s*(CEP:|Culto:)';

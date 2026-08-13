-- ============================================================================
-- Totem · sexo nas inscrições + CPF/relação do responsável na apresentação
--
-- Aditiva, idempotente, backwards-compatible.
--
--  1. sexo nas inscrições de batismo e Next (o totem passa a perguntar o sexo
--     da pessoa · texto livre 'M'/'F' pra não travar).
--
--  2. apresentacao_bebes ganha responsavel_cpf + responsavel_relacao — o totem
--     coleta o CPF e o vínculo (mãe/pai/responsável) do adulto que agenda, pra
--     a família já ficar identificada e o dado servir ao Kids depois (sem a
--     pessoa preencher duas vezes). O vínculo formal criança↔responsável no
--     Kids continua exigindo o fluxo com documentos/aprovação — aqui só
--     guardamos o dado + rodamos o matcher canônico pelo CPF.
-- ============================================================================

ALTER TABLE public.batismo_inscricoes
  ADD COLUMN IF NOT EXISTS sexo text;

ALTER TABLE public.next_matriculas
  ADD COLUMN IF NOT EXISTS sexo text;

ALTER TABLE public.apresentacao_bebes
  ADD COLUMN IF NOT EXISTS responsavel_cpf text;

ALTER TABLE public.apresentacao_bebes
  ADD COLUMN IF NOT EXISTS responsavel_relacao text;

COMMENT ON COLUMN public.apresentacao_bebes.responsavel_cpf IS
  'CPF do responsável que agenda (totem). Passa pelo matcher canônico pra ligar a mem_membros — base pro vínculo com o Kids depois.';
COMMENT ON COLUMN public.apresentacao_bebes.responsavel_relacao IS
  'Relação do responsável com o bebê (mãe/pai/avó/responsável/...). Autodeclarado no totem.';

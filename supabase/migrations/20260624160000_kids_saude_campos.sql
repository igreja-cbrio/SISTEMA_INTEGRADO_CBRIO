-- ============================================================
-- Kids — Campos de saúde da criança (espectro, alergia, limitação)
-- ============================================================
-- Estrutura informações de saúde sensíveis da criança, preenchidas pelo
-- responsável no app (no cadastro/solicitação e editáveis depois) e exibidas
-- à equipe Kids no check-in (alergia/espectro destacados) e no cadastro.
--
-- Aditivo (ADD COLUMN IF NOT EXISTS) · backwards-compatible. A criança já tinha
-- observacoes_medicas (texto livre = "mais informações"); aqui adicionamos os
-- campos estruturados.
-- ============================================================

-- 1. Criança: campos estruturados de saúde
ALTER TABLE public.kids_criancas
  ADD COLUMN IF NOT EXISTS tem_espectro boolean,
  ADD COLUMN IF NOT EXISTS espectro_qual text,
  ADD COLUMN IF NOT EXISTS tem_alergia boolean,
  ADD COLUMN IF NOT EXISTS alergia_qual text,
  ADD COLUMN IF NOT EXISTS tem_limitacao_fisica boolean,
  ADD COLUMN IF NOT EXISTS limitacao_fisica_qual text;

-- 2. Solicitação de vínculo: os mesmos campos, capturados no pedido pelo app
--    e copiados pra criança quando a equipe Kids aprova. observacoes_medicas
--    = "mais informações" (texto livre).
ALTER TABLE public.kids_vinculo_solicitacoes
  ADD COLUMN IF NOT EXISTS tem_espectro boolean,
  ADD COLUMN IF NOT EXISTS espectro_qual text,
  ADD COLUMN IF NOT EXISTS tem_alergia boolean,
  ADD COLUMN IF NOT EXISTS alergia_qual text,
  ADD COLUMN IF NOT EXISTS tem_limitacao_fisica boolean,
  ADD COLUMN IF NOT EXISTS limitacao_fisica_qual text,
  ADD COLUMN IF NOT EXISTS observacoes_medicas text;

COMMENT ON COLUMN public.kids_criancas.tem_espectro IS 'Criança é/está dentro do espectro autista (informado pelo responsável).';
COMMENT ON COLUMN public.kids_criancas.espectro_qual IS 'Detalhe do espectro, quando tem_espectro = true.';
COMMENT ON COLUMN public.kids_criancas.tem_alergia IS 'Criança tem alergia (informado pelo responsável).';
COMMENT ON COLUMN public.kids_criancas.tem_limitacao_fisica IS 'Criança tem alguma limitação física (informado pelo responsável).';

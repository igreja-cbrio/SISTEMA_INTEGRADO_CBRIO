-- Decisão · CEP declarado por quem decide (2026-08-27)
--
-- Pedido do Matheus para o formulário de aceitação do ONLINE: "cep opcional
-- (para tentarmos fazer uma análise de onde a maior parte das pessoas
-- assistem)".
--
-- ⚠️⚠️ POR QUE UMA COLUNA AQUI E NÃO SÓ EM `mem_membros`. O CEP tem DOIS
-- destinos com significados diferentes:
--   · `mem_membros.cep` = onde a pessoa mora HOJE (o cadastro, que a equipe
--     corrige e a própria pessoa atualiza) — é ele que alimenta o mapa da aba
--     Perfil por trecho de CEP;
--   · `cultos_decisoes_pessoas.cep` = o que ELA DECLAROU no momento da
--     decisão.
-- O backend leva o CEP ao cadastro **só-onde-vazio** (política do censo: valor
-- preenchido é decisão humana e não se sobrescreve). Sem esta coluna, o que a
-- pessoa declarou se PERDERIA sempre que o cadastro já tivesse CEP — que é a
-- classe de bug que este sistema já teve com o CPF do censo e com o opt-in:
-- dado coletado e descartado em silêncio.
--
-- ⚠️ Sem CHECK de formato: quem valida os 8 dígitos é a porta
-- (`publicDecisaoOnline`), e um CHECK aqui derrubaria o INSERT INTEIRO da
-- decisão por causa de um campo OPCIONAL. Decisão de fé não se perde por CEP.

ALTER TABLE public.cultos_decisoes_pessoas
  ADD COLUMN IF NOT EXISTS cep text;

COMMENT ON COLUMN public.cultos_decisoes_pessoas.cep IS
  'CEP declarado no momento da decisão (só dígitos, opcional). É o DECLARADO, não o cadastro: o backend copia para mem_membros.cep apenas quando lá está vazio. Alimenta a análise de onde o público online assiste (aba Perfil > mapa por trecho de CEP).';

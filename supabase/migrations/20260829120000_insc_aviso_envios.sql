-- ============================================================================
-- Aviso do COMPROVANTE por e-mail · registro de quem já recebeu
--
-- Pedido do Matheus (29/08): "cada um recebe no seu email o seu qr code e
-- numero da sorte. mas precisa cada um receber o seu, nao pode ter erro."
--
-- ⚠️ A tabela existe por causa da LEI de 04/08 ("em operação LONGA, gravar o
-- efeito DURANTE, não no fim"): são 324 e-mails no Celebra e a função morre em
-- 300s. Sem registro por linha, a 2ª rodada reenviaria pra todo mundo — e no
-- Celebra isso é a pessoa recebendo o comprovante dela duas, três vezes.
--
-- ⚠️ NÃO guarda o e-mail de destino, de propósito: o contato vive na inscrição
-- e no cadastro, e muda quando a pessoa corrige. Copiar aqui criaria uma 2ª
-- verdade que envelhece (mesma decisão de `mem_censo_convites`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insc_aviso_envios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id    uuid NOT NULL REFERENCES public.insc_eventos(id) ON DELETE CASCADE,
  inscricao_id uuid NOT NULL REFERENCES public.inscricoes(id)   ON DELETE CASCADE,
  canal        text NOT NULL DEFAULT 'email',
  enviado_em   timestamptz,
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ⚠️ SEM predicado: é este índice que o `ON CONFLICT` infere, e ON CONFLICT
-- NÃO infere índice PARCIAL (lei de 04/08). É ele que impede a mesma pessoa
-- receber duas vezes quando a rodada é retomada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_insc_aviso_envios
  ON public.insc_aviso_envios (evento_id, inscricao_id, canal);

-- Fila da retomada: "quem ainda não recebeu deste evento".
CREATE INDEX IF NOT EXISTS idx_insc_aviso_envios_pendentes
  ON public.insc_aviso_envios (evento_id) WHERE enviado_em IS NULL;

COMMENT ON TABLE public.insc_aviso_envios IS
  'Quem ja recebeu o aviso do comprovante (QR + numero da sorte) por canal. Linha nasce ANTES do envio: morte no meio deixa gravado o que ja saiu e a proxima rodada continua de onde parou, em vez de reenviar pra todo mundo.';

ALTER TABLE public.insc_aviso_envios ENABLE ROW LEVEL SECURITY;

-- Quem escreve é o backend com service_role. Nenhum cliente lê ou escreve —
-- não ampliar o que a anon key alcança (lei nº 11).
DROP POLICY IF EXISTS insc_aviso_envios_service ON public.insc_aviso_envios;
CREATE POLICY insc_aviso_envios_service ON public.insc_aviso_envios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

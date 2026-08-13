-- 20260723200000_kids_pager_numero.sql
-- Pager por NUMERO no check-in Kids (ideia da Mari · elimina o papel).
-- TRACKING (dado), NAO integracao de hardware: o pager redondo velho e acionado
-- na mao no transmissor antigo; aqui so guardamos qual numero foi entregue em
-- cada check-in, pro Painel ao vivo mostrar "pager X = crianca Y".
-- NAO reviver kids_pagers/kids_pager_envios (scaffold dormente de junho).

ALTER TABLE public.kids_checkins
  ADD COLUMN IF NOT EXISTS pager_numero text;

-- Indice parcial: so check-ins ABERTOS com pager (o "pagers em uso" do painel +
-- a checagem de conflito de numero). O predicado casa exatamente com a definicao
-- de "em uso" usada no backend (checkout/cron liberam o numero ao fechar a linha).
CREATE INDEX IF NOT EXISTS idx_kids_checkins_pager_numero
  ON public.kids_checkins (pager_numero)
  WHERE pager_numero IS NOT NULL AND checkout_at IS NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.kids_checkins.pager_numero IS
  'Numero do pager fisico entregue ao responsavel neste check-in (texto, canonico: so digitos, sem zero a esquerda; ex.: "12"). Tracking pro painel; sem integracao de hardware.';

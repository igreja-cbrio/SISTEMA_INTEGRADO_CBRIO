-- ════════════════════════════════════════════════════════════════════════════
-- Comunicação · BOT DE IA POR ÁREA (2026-09-08)
--
-- Pedido do Marcos: um assistente simples respondendo dúvidas rápidas no
-- WhatsApp da igreja, POR ÁREA — quando uma área começar a atender de verdade,
-- desliga-se o bot só nela e a mensagem continua chegando no inbox.
--
-- Aditiva e idempotente. O código TOLERA a ausência desta migration:
--   · `whatsapp_config.bot_ia` ausente ⇒ o bot fica DESLIGADO (fail-closed);
--   · `wa_bot_areas` ausente ⇒ nenhuma área ligada ⇒ silêncio.
-- Nenhuma tabela nova carrega PII (é configuração da equipe), por isso não há
-- `deleted_at` nem entrada na whitelist de soft-delete — mesmo desenho de
-- `wa_tarifas` e `conversas_setores`.
-- ════════════════════════════════════════════════════════════════════════════

-- 1 · configuração global do bot (interruptor, contato humano, limites)
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS bot_ia jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.whatsapp_config.bot_ia IS
  'Bot de IA por área (08/09/2026): { ativo, contato_humano, limite_dia, limite_conversa_dia, horas_silencio_apos_humano, instrucoes }. `ativo` só vale com true explícito; {} = desligado. Só age com respostas_automaticas = false (menu calado).';

-- 2 · conhecimento e interruptor POR ÁREA
CREATE TABLE IF NOT EXISTS public.wa_bot_areas (
  area            text PRIMARY KEY,                 -- casa com areas.nome (ou 'Geral' para horários/endereço)
  ativo           boolean NOT NULL DEFAULT false,   -- desligada = a equipe humana responde · o bot cala
  descricao       text,                             -- 1 linha: ajuda o modelo a CLASSIFICAR o assunto
  conhecimento    text,                             -- o que o bot pode dizer (texto livre da equipe)
  links           jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{rotulo, url}] · os ÚNICOS links que o bot pode enviar
  encaminhar_para text,                             -- contato/instrução própria da área ao encaminhar (opcional)
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.wa_bot_areas IS
  'Bot de IA por área do inbox de WhatsApp (08/09/2026). Uma linha por área; ativo=false = a equipe humana atende e o bot fica em silêncio naquela área. Links são a lista FECHADA do que o bot pode enviar.';

ALTER TABLE public.wa_bot_areas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_bot_areas' AND policyname = 'wa_bot_areas_service') THEN
    CREATE POLICY wa_bot_areas_service ON public.wa_bot_areas FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_bot_areas' AND policyname = 'wa_bot_areas_select') THEN
    CREATE POLICY wa_bot_areas_select ON public.wa_bot_areas FOR SELECT TO authenticated
      USING (public.current_user_module_level('comunicacao') >= 1);
  END IF;
END $$;

-- 3 · semente: uma linha DESLIGADA por área do menu do bot + a 'Geral'
--     (é só pra tela nascer com as linhas certas pra preencher — nada liga sozinho)
INSERT INTO public.wa_bot_areas (area, ativo, descricao)
SELECT DISTINCT cs.area, false, NULL
  FROM public.conversas_setores cs
 WHERE cs.area IS NOT NULL AND btrim(cs.area) <> ''
ON CONFLICT (area) DO NOTHING;

INSERT INTO public.wa_bot_areas (area, ativo, descricao)
VALUES ('Geral', false, 'Dúvidas gerais sobre a igreja: horários de culto, endereço, como chegar, redes sociais')
ON CONFLICT (area) DO NOTHING;

-- Conferência (deve devolver a coluna e ≥ 1 linha):
-- SELECT column_name FROM information_schema.columns WHERE table_name='whatsapp_config' AND column_name='bot_ia';
-- SELECT area, ativo FROM public.wa_bot_areas ORDER BY area;

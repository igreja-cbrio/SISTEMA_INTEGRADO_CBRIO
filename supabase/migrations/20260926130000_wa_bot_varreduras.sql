-- ════════════════════════════════════════════════════════════════════════════
-- Comunicação · VARREDURA MENSAL do WhatsApp (2026-09-26)
--
-- Pedido do Matheus (item 6): no começo de cada mês, ler as mensagens que o
-- WhatsApp da CBRio RECEBEU no mês anterior, agrupar por tema com IA, apontar o
-- que o bot de IA não saberia responder (lacuna de conhecimento por área) e
-- mandar um e-mail com o resumo para os endereços de
-- `whatsapp_config.bot_ia.varredura_emails`.
--
-- Uma linha por MÊS (`periodo` = 'YYYY-MM'). Quem escreve é o backend
-- (services/botIaVarredura.js) com service_role · de carona no cron horário
-- `GET /api/comunicacao/cron/agendamentos` e no botão "Rodar agora" da tela.
--
-- Aditiva e idempotente. O código TOLERA a ausência desta tabela (42P01 ⇒ a
-- tela declara "migration não aplicada" e o cron não faz nada).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wa_bot_varreduras (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo                       text NOT NULL,
  status                        text NOT NULL,
  gerado_em                     timestamptz,
  iniciado_em                   timestamptz NOT NULL DEFAULT now(),
  total_mensagens               int,
  total_conversas               int,
  excluidas_pastoral            int,
  excluidas_conversas_cuidados  int,
  temas                         jsonb NOT NULL DEFAULT '[]'::jsonb,
  lacunas                       jsonb NOT NULL DEFAULT '[]'::jsonb,
  modelo                        text,
  tokens_in                     int,
  tokens_out                    int,
  email_enviado_em              timestamptz,
  email_destinos                jsonb,
  email_erro                    text,
  erro                          text,
  criado_por                    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  forcado                       boolean NOT NULL DEFAULT false,
  CONSTRAINT wa_bot_varreduras_periodo_formato CHECK (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT wa_bot_varreduras_status_check CHECK (status IN ('rodando', 'ok', 'sem_dados', 'erro'))
);

-- ⚠️⚠️ UNIQUE SEM PREDICADO, de propósito. É ela que faz a idempotência: o
-- serviço INSERE a linha `rodando` ANTES de chamar o modelo (reivindicação), e
-- quem perde a corrida bate no 23505 e sai sem pagar a IA duas vezes. Um índice
-- PARCIAL (`WHERE status <> 'erro'`, por exemplo) deixaria duas linhas do mesmo
-- mês conviverem e o `ON CONFLICT` do PostgREST não o infere (lei de 04/08).
-- Retentar um mês que deu erro é UPDATE da mesma linha, nunca linha nova.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_bot_varreduras_periodo
  ON public.wa_bot_varreduras (periodo);

COMMENT ON TABLE public.wa_bot_varreduras IS
  'Varredura mensal das mensagens RECEBIDAS no WhatsApp da CBRio (26/09/2026): temas, contagens e lacunas de conhecimento do bot de IA por área. Uma linha por mês (periodo YYYY-MM · UNIQUE sem predicado = reivindicação antes de chamar o modelo). Escrita só pelo backend (service_role).';

COMMENT ON COLUMN public.wa_bot_varreduras.temas IS
  '[{tema, contagem, area_sugerida, o_bot_saberia, lacuna, exemplo_ids}] · ⚠️ exemplo_ids são IDs de wa_mensagens, NUNCA o texto: o texto de membro não é copiado para cá nem para o e-mail (cópia irrevogável fora do RLS). A tela busca os exemplos sob permissão (comunicacao ≥ 3) e mascarados.';

COMMENT ON COLUMN public.wa_bot_varreduras.lacunas IS
  '[{area, lacuna, sugestao_conhecimento}] · o que faltaria no conhecimento das áreas do bot (wa_bot_areas) para responder o que chegou no mês.';

COMMENT ON COLUMN public.wa_bot_varreduras.excluidas_pastoral IS
  'Mensagens tiradas ANTES do modelo por casarem palavra pastoral (oração, luto, saúde, separação…) — exclusão determinística, lista fechada em backend/utils/botIaVarredura.js.';

COMMENT ON COLUMN public.wa_bot_varreduras.excluidas_conversas_cuidados IS
  'Mensagens tiradas ANTES do modelo por pertencerem a conversa com wa_conversas.area = Cuidados.';

COMMENT ON COLUMN public.wa_bot_varreduras.erro IS
  'Motivo SANITIZADO da falha (sem chave, segredo nem telefone). anthropic_sem_credito = a conta da Anthropic está sem saldo.';

COMMENT ON COLUMN public.wa_bot_varreduras.forcado IS
  'true = rodada disparada pelo botão "Rodar agora" (ignora o interruptor dos disparos automáticos de propósito); false = cron.';

ALTER TABLE public.wa_bot_varreduras ENABLE ROW LEVEL SECURITY;

-- ⚠️ Só service_role. A tela lê pelo backend (comunicacao ≥ 1 para o resumo,
-- ≥ 3 para os exemplos) — nenhum cliente com a anon key alcança esta tabela.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wa_bot_varreduras' AND policyname = 'wa_bot_varreduras_service') THEN
    CREATE POLICY wa_bot_varreduras_service ON public.wa_bot_varreduras
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

REVOKE ALL ON public.wa_bot_varreduras FROM anon, authenticated;

-- ── Conferência no CATÁLOGO (não no `success: true`) ────────────────────────
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.wa_bot_varreduras'::regclass;          -- true
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_wa_bot_varreduras_periodo';               -- sem WHERE
-- SELECT policyname, roles FROM pg_policies WHERE tablename = 'wa_bot_varreduras';                 -- só service_role
-- SELECT has_table_privilege('authenticated', 'public.wa_bot_varreduras', 'SELECT');                -- false
-- SELECT has_table_privilege('anon', 'public.wa_bot_varreduras', 'SELECT');                         -- false
-- SELECT bot_ia->'varredura_emails' FROM public.whatsapp_config WHERE id = 1;                       -- os destinos

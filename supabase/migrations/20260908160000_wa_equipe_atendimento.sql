-- ════════════════════════════════════════════════════════════════════════════
-- Comunicação · EQUIPE DE ATENDIMENTO por área (2026-09-08)
--
-- Pedido do Marcos: "quem é responsável por receber as mensagens daquela área;
-- uma pessoa poderá ser responsável por mais de uma área". Uma linha por área
-- com TITULAR + SUPLENTE. A chave 'Entrada' cobre a conversa que ainda não tem
-- área — em 08/09, 162 das 232 conversas estavam lá e ninguém era avisado.
--
-- Aditiva e idempotente. O código TOLERA a ausência desta migration: sem a
-- tabela (42P01) a equipe é vazia e vale o comportamento de sempre — avisar a
-- área inteira pelo organograma, ninguém atribuído.
-- Não carrega PII (é configuração da equipe; profile_id aponta pra gente do
-- sistema), por isso não tem `deleted_at` nem entra na whitelist de
-- soft-delete — mesmo desenho de `wa_bot_areas` e `conversas_setores`.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wa_equipe_atendimento (
  area           text PRIMARY KEY,                 -- areas.nome, ou 'Entrada' (conversa sem área)
  titular_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- quem recebe e é avisado
  suplente_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- entra quando não há titular
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- suplente existe pra quando o titular não pode: a mesma pessoa nos dois é suplente nenhum
  CONSTRAINT wa_equipe_titular_ne_suplente
    CHECK (titular_id IS NULL OR suplente_id IS NULL OR titular_id <> suplente_id)
);

COMMENT ON TABLE public.wa_equipe_atendimento IS
  'Equipe de atendimento do inbox de WhatsApp (08/09/2026): titular + suplente por área. A conversa triada pra área (menu, disparo, IA ou triagem humana) nasce ATRIBUÍDA ao titular e só ele é avisado; a chave ''Entrada'' cobre conversa sem área. Sem linha/sem titular = comportamento antigo (avisa a área toda, ninguém atribuído).';

ALTER TABLE public.wa_equipe_atendimento ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_equipe_atendimento' AND policyname = 'wa_equipe_atendimento_service') THEN
    CREATE POLICY wa_equipe_atendimento_service ON public.wa_equipe_atendimento
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_equipe_atendimento' AND policyname = 'wa_equipe_atendimento_select') THEN
    CREATE POLICY wa_equipe_atendimento_select ON public.wa_equipe_atendimento
      FOR SELECT TO authenticated
      USING (public.current_user_module_level('comunicacao') >= 1);
  END IF;
END $$;

-- Conferência (deve devolver a tabela e as 2 policies):
-- SELECT tablename, policyname FROM pg_policies WHERE tablename = 'wa_equipe_atendimento';

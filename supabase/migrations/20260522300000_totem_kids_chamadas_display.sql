-- ============================================================================
-- Totem Kids · sistema de chamadas pra TV das salas
--
-- Marcos (2026-05-22): "todas as salas do kids geralmente tem uma televisão,
-- seria incrível se cadastrassemos o sistema de alguma forma a essas TVs · e
-- ai quando um pai na recepção chega, ele da o número e ai aparece na tela e a
-- professora já acompanha a criança pra saída".
--
-- Fluxo:
--   1. Pai digita codigo no PC touch self-service da recepcao
--   2. Backend cria row em kids_chamadas com sala_id da crianca
--   3. TV da sala (Fire TV em modo display) recebe via Supabase Realtime
--   4. Renderiza grande + sino + TTS "Nome, sua familia chegou"
--   5. Quando voluntaria confirma checkout, atendida_em e preenchido
--   6. Chamada some da TV
--
-- Hardware sugerido: Fire TV Stick 4K (1 por sala · R$300/un) plug HDMI.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Adiciona tipo 'display' em kids_estacoes
--    Ja existia 'manned','self','roster' · agora 'display' pra TV pareada
-- ----------------------------------------------------------------------------
ALTER TABLE public.kids_estacoes
  DROP CONSTRAINT IF EXISTS kids_estacoes_tipo_check;

ALTER TABLE public.kids_estacoes
  ADD CONSTRAINT kids_estacoes_tipo_check
  CHECK (tipo IN ('manned','self','roster','display','display_foyer'));

COMMENT ON COLUMN public.kids_estacoes.tipo IS
  'manned=voluntario opera · self=PC touch self-service (pai opera) · roster=dentro da sala (futuro) · display=TV de uma sala especifica · display_foyer=TV agregada de todas as salas';

-- ----------------------------------------------------------------------------
-- 2. kids_chamadas · 1 row por evento de chamada de pickup
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_chamadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES public.kids_sessoes(id) ON DELETE CASCADE,
  checkin_id uuid NOT NULL REFERENCES public.kids_checkins(id) ON DELETE CASCADE,
  crianca_id uuid NOT NULL REFERENCES public.kids_criancas(id) ON DELETE CASCADE,
  sala_id uuid NOT NULL REFERENCES public.kids_salas(id),
  estacao_origem_id uuid REFERENCES public.kids_estacoes(id),
  codigo_seguranca text NOT NULL,
  responsavel_nome_snapshot text,  -- snapshot pra display nao depender de joins
  responsavel_telefone_snapshot text,
  chamada_em timestamptz NOT NULL DEFAULT now(),
  atendida_em timestamptz,
  atendida_por uuid REFERENCES auth.users(id),
  re_chamadas int NOT NULL DEFAULT 0,
  ultima_rechamada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indices essenciais
CREATE INDEX IF NOT EXISTS idx_kids_chamadas_sala_ativas
  ON public.kids_chamadas(sala_id, chamada_em DESC)
  WHERE atendida_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_kids_chamadas_sessao
  ON public.kids_chamadas(sessao_id);

CREATE INDEX IF NOT EXISTS idx_kids_chamadas_checkin
  ON public.kids_chamadas(checkin_id);

-- Anti-spam: uma crianca so pode ter 1 chamada ATIVA por vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_kids_chamadas_ativa_por_crianca
  ON public.kids_chamadas(crianca_id, sessao_id)
  WHERE atendida_em IS NULL;

-- RLS
ALTER TABLE public.kids_chamadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_chamadas_read"   ON public.kids_chamadas;
DROP POLICY IF EXISTS "kids_chamadas_write"  ON public.kids_chamadas;
DROP POLICY IF EXISTS "kids_chamadas_update" ON public.kids_chamadas;
DROP POLICY IF EXISTS "kids_chamadas_delete" ON public.kids_chamadas;

CREATE POLICY "kids_chamadas_read"   ON public.kids_chamadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_chamadas_write"  ON public.kids_chamadas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kids_chamadas_update" ON public.kids_chamadas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kids_chamadas_delete" ON public.kids_chamadas FOR DELETE TO authenticated USING (true);

-- Anon (display sem login) só LE chamadas ativas via token de estacao
-- (controlado pelo backend · service_role)

COMMENT ON TABLE public.kids_chamadas IS
  'Eventos de chamada de pickup · pai digita codigo na recepcao, sistema cria 1 row, TV da sala renderiza. atendida_em=preenchido quando checkout confirma.';

-- ----------------------------------------------------------------------------
-- 3. Trigger: quando checkout_at e marcado em kids_checkins,
--    fecha automaticamente as chamadas ativas dessa crianca/sessao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_fecha_chamadas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.checkout_at IS NOT NULL
     AND (OLD.checkout_at IS NULL OR OLD.checkout_at IS DISTINCT FROM NEW.checkout_at)
  THEN
    UPDATE public.kids_chamadas
      SET atendida_em = NEW.checkout_at,
          atendida_por = NEW.checkout_por
     WHERE checkin_id = NEW.id
       AND atendida_em IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kids_checkout_fecha_chamadas ON public.kids_checkins;
CREATE TRIGGER trg_kids_checkout_fecha_chamadas
  AFTER UPDATE OF checkout_at ON public.kids_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_kids_checkout_fecha_chamadas();

-- ----------------------------------------------------------------------------
-- 4. View: chamadas ativas por sala (consumida pelo display)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_kids_chamadas_ativas;

CREATE VIEW public.vw_kids_chamadas_ativas AS
SELECT
  ch.id AS chamada_id,
  ch.sessao_id,
  ch.checkin_id,
  ch.crianca_id,
  k.nome AS crianca_nome,
  k.data_nascimento AS crianca_data_nascimento,
  k.observacoes_medicas,
  ch.sala_id,
  sala.nome AS sala_nome,
  sala.cor AS sala_cor,
  ch.codigo_seguranca,
  ch.responsavel_nome_snapshot,
  ch.chamada_em,
  ch.re_chamadas,
  ch.ultima_rechamada_em,
  EXTRACT(EPOCH FROM (now() - ch.chamada_em))::int AS segundos_esperando
FROM public.kids_chamadas ch
JOIN public.kids_criancas k ON k.id = ch.crianca_id
JOIN public.kids_salas sala ON sala.id = ch.sala_id
WHERE ch.atendida_em IS NULL;

GRANT SELECT ON public.vw_kids_chamadas_ativas TO authenticated, service_role, anon;

-- ----------------------------------------------------------------------------
-- 5. Habilita Realtime na tabela kids_chamadas
--    Display da TV vai usar Supabase Realtime channel pra receber eventos.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Adiciona à publication se ainda não estiver
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'kids_chamadas';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kids_chamadas';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime publication ja inclui kids_chamadas ou nao existe (%) · sem ação', SQLERRM;
END $$;

COMMIT;

-- ============================================================================
-- Conferencia:
--   \d kids_chamadas
--   SELECT * FROM vw_kids_chamadas_ativas;
--   -- Testar trigger:
--   UPDATE kids_checkins SET checkout_at = now() WHERE id = '<id>';
--   -- → todas as kids_chamadas desse checkin_id devem ficar com atendida_em
-- ============================================================================

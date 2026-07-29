-- Módulo de Inscrições · reparos da fundação pós-auditoria (2026-07-29)
-- Fecha 2 buracos da 20260729090000, que criou o ledger e o inventário de QR:
--   (1) `insc_checkin_eventos.ator_id` tinha FK ON DELETE SET NULL numa tabela
--       com trigger BEFORE UPDATE que RAISE EXCEPTION ('append-only'). SET NULL
--       É um UPDATE → apagar um profile que já operou a portaria falhava com
--       "insc_checkin_eventos é append-only", pra sempre. Num ledger append-only
--       o ator é SNAPSHOT: guarda-se o UUID, sem FK.
--   (2) revogar QR era irreversível — o token é HMAC determinístico do id da
--       inscrição, então o hash nunca muda; `fn_insc_qr_registrar` (ON CONFLICT)
--       não limpa `revogado_em` e não havia caminho de volta. Um clique errado
--       matava o comprovante da pessoa para sempre. Entram as colunas de
--       reativação + audit trigger da casa (histórico imutável em app_audit_log).
-- ADITIVA: nenhuma linha é apagada, nenhum comportamento existente muda.
-- ⚠️ Requer a 20260729090000 aplicada (as duas tabelas precisam existir).

SET lock_timeout = '5s';

-- ── 0. Pré-requisito explícito (falha ALTO, não em silêncio) ───────────────
DO $$
BEGIN
  IF to_regclass('public.insc_checkin_eventos') IS NULL
     OR to_regclass('public.insc_qr_tokens') IS NULL THEN
    RAISE EXCEPTION
      'Aplique primeiro a migration 20260729090000_inscricoes_catalogo_qr_checkin_audit.sql (insc_checkin_eventos / insc_qr_tokens ausentes)';
  END IF;
END $$;

-- ── PARTE 1 · insc_checkin_eventos: ator vira snapshot (sem FK) ────────────
-- Se der 40P01 (deadlock de DDL), rode a PARTE 1 e a PARTE 2 em colagens
-- separadas — são tabelas diferentes.
DO $$
DECLARE v_fk TEXT;
BEGIN
  SELECT con.conname INTO v_fk
  FROM pg_constraint con
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
  WHERE con.conrelid = 'public.insc_checkin_eventos'::regclass
    AND con.contype = 'f'
    AND array_length(con.conkey, 1) = 1
    AND att.attname = 'ator_id';

  IF v_fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.insc_checkin_eventos DROP CONSTRAINT %I', v_fk);
    RAISE NOTICE 'FK % removida de insc_checkin_eventos.ator_id (ator = snapshot)', v_fk;
  ELSE
    RAISE NOTICE 'insc_checkin_eventos.ator_id já estava sem FK';
  END IF;
END $$;

COMMENT ON COLUMN public.insc_checkin_eventos.ator_id IS
  'UUID do profile que operou (SNAPSHOT, sem FK de propósito: a tabela é append-only e ON DELETE SET NULL colidiria com o trigger de imutabilidade).';

-- ── PARTE 2 · insc_qr_tokens: reativação + histórico imutável ──────────────
ALTER TABLE public.insc_qr_tokens
  ADD COLUMN IF NOT EXISTS reativado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reativado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reativacao_motivo TEXT;

-- Histórico de revogação/reativação no audit_log genérico da casa
-- (20260521230000): app_audit_log é imutável por RLS e guarda o diff coluna a
-- coluna, então revogar→reativar→revogar não perde nenhum passo.
-- ⚠️ Escrita vem do backend (service_role, auth.uid() NULL) → `user_id` do log
-- fica nulo; a autoria REAL é `revogado_por`/`reativado_por`, gravada pela rota.
DROP TRIGGER IF EXISTS trg_audit_insc_qr_tokens ON public.insc_qr_tokens;
CREATE TRIGGER trg_audit_insc_qr_tokens
AFTER INSERT OR UPDATE OR DELETE ON public.insc_qr_tokens
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'revogado_em,revogado_por,revogacao_motivo,reativado_em,reativado_por,reativacao_motivo'
);

COMMENT ON COLUMN public.insc_qr_tokens.reativado_em IS
  'Revogação desfeita em. O token é HMAC determinístico do id da inscrição: revogar não gira segredo nem gera QR novo, então precisa haver volta.';

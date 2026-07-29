-- Módulo de Inscrições · fundação arquitetural pós-auditoria (2026-07-28)
-- ADITIVA: nenhuma tabela/rota/inscrição existente é removida ou reescrita.

-- ── 1. Inventário de portas agregado no banco ──────────────────────────────
-- Evita transportar toda vw_inscricoes_unificadas ao Node só para contar.
CREATE OR REPLACE FUNCTION public.fn_insc_portas_resumo(
  p_portas TEXT[],
  p_corte_30d TIMESTAMPTZ
)
RETURNS TABLE (
  porta TEXT,
  total BIGINT,
  ultimos_30d BIGINT,
  edicao_rotulo TEXT,
  edicao_total BIGINT,
  ultima_em TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      v.porta,
      COALESCE(v.edicao_rotulo, 'sem edição') AS edicao_rotulo,
      v.criado_em
    FROM public.vw_inscricoes_unificadas v
    WHERE v.porta = ANY(COALESCE(p_portas, ARRAY[]::TEXT[]))
      AND v.status_canonico <> 'cancelada'
  ), totais AS (
    SELECT
      b.porta,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE b.criado_em >= p_corte_30d) AS ultimos_30d
    FROM base b
    GROUP BY b.porta
  ), edicoes AS (
    SELECT
      b.porta,
      b.edicao_rotulo,
      COUNT(*) AS edicao_total,
      MAX(b.criado_em) AS ultima_em
    FROM base b
    GROUP BY b.porta, b.edicao_rotulo
  )
  SELECT t.porta, t.total, t.ultimos_30d,
         e.edicao_rotulo, e.edicao_total, e.ultima_em
  FROM totais t
  JOIN edicoes e USING (porta)
  ORDER BY t.porta, e.ultima_em DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.fn_insc_portas_resumo(TEXT[], TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insc_portas_resumo(TEXT[], TIMESTAMPTZ) TO service_role;

-- ── 2. Trilha imutável do check-in ─────────────────────────────────────────
ALTER TABLE public.insc_checkins
  ADD COLUMN IF NOT EXISTS override_pendente BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_motivo TEXT;

CREATE TABLE IF NOT EXISTS public.insc_checkin_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL,
  inscricao_id UUID NOT NULL REFERENCES public.inscricoes(id) ON DELETE RESTRICT,
  evento_id UUID NOT NULL REFERENCES public.insc_eventos(id) ON DELETE RESTRICT,
  acao TEXT NOT NULL CHECK (acao IN ('checkin','checkin_override_pendente','desfeito')),
  ator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  modo TEXT CHECK (modo IN ('busca','qr')),
  motivo TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (checkin_id, acao, em)
);

CREATE INDEX IF NOT EXISTS idx_insc_checkin_eventos_inscricao_em
  ON public.insc_checkin_eventos(inscricao_id, em DESC);
CREATE INDEX IF NOT EXISTS idx_insc_checkin_eventos_evento_em
  ON public.insc_checkin_eventos(evento_id, em DESC);

ALTER TABLE public.insc_checkin_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.insc_checkin_eventos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_insc_checkin_eventos_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'insc_checkin_eventos é append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_insc_checkin_eventos_imutavel ON public.insc_checkin_eventos;
CREATE TRIGGER trg_insc_checkin_eventos_imutavel
  BEFORE UPDATE OR DELETE ON public.insc_checkin_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_insc_checkin_eventos_imutavel();

-- Backfill dos check-ins atuais. Em produção eram zero na auditoria, mas o SQL
-- é seguro caso uma marca seja criada entre revisão e aplicação da migration.
INSERT INTO public.insc_checkin_eventos
  (checkin_id, inscricao_id, evento_id, acao, ator_id, modo, motivo, metadata, em)
SELECT
  c.id, c.inscricao_id, i.evento_id,
  CASE WHEN c.override_pendente THEN 'checkin_override_pendente' ELSE 'checkin' END,
  c.por, c.modo, c.override_motivo, '{}'::jsonb, c.em
FROM public.insc_checkins c
JOIN public.inscricoes i ON i.id = c.inscricao_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.insc_checkin_eventos a
  WHERE a.checkin_id = c.id AND a.acao IN ('checkin','checkin_override_pendente')
);

CREATE OR REPLACE FUNCTION public.fn_insc_checkin_marcar(
  p_inscricao_id UUID,
  p_por UUID,
  p_modo TEXT,
  p_override_pendente BOOLEAN DEFAULT false,
  p_override_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checkin_id UUID;
  v_em TIMESTAMPTZ;
  v_evento_id UUID;
BEGIN
  IF p_modo NOT IN ('busca','qr') THEN
    RAISE EXCEPTION 'modo de check-in inválido';
  END IF;

  SELECT i.evento_id INTO v_evento_id
  FROM public.inscricoes i
  WHERE i.id = p_inscricao_id AND i.deleted_at IS NULL;
  IF v_evento_id IS NULL THEN
    RAISE EXCEPTION 'inscrição não encontrada';
  END IF;

  INSERT INTO public.insc_checkins
    (inscricao_id, por, modo, override_pendente, override_motivo)
  VALUES
    (p_inscricao_id, p_por, p_modo, COALESCE(p_override_pendente, false),
     NULLIF(trim(p_override_motivo), ''))
  ON CONFLICT (inscricao_id) DO NOTHING
  RETURNING id, em INTO v_checkin_id, v_em;

  IF v_checkin_id IS NULL THEN
    SELECT c.id, c.em INTO v_checkin_id, v_em
    FROM public.insc_checkins c WHERE c.inscricao_id = p_inscricao_id;
    RETURN jsonb_build_object('ok', true, 'ja_checkin', true, 'em', v_em);
  END IF;

  INSERT INTO public.insc_checkin_eventos
    (checkin_id, inscricao_id, evento_id, acao, ator_id, modo, motivo, metadata, em)
  VALUES
    (v_checkin_id, p_inscricao_id, v_evento_id,
     CASE WHEN COALESCE(p_override_pendente, false)
       THEN 'checkin_override_pendente' ELSE 'checkin' END,
     p_por, p_modo, NULLIF(trim(p_override_motivo), ''),
     jsonb_build_object('override_pendente', COALESCE(p_override_pendente, false)), v_em);

  RETURN jsonb_build_object('ok', true, 'ja_checkin', false, 'em', v_em);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_insc_checkin_desfazer(
  p_evento_id UUID,
  p_inscricao_id UUID,
  p_por UUID,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_checkin public.insc_checkins%ROWTYPE;
BEGIN
  DELETE FROM public.insc_checkins c
  USING public.inscricoes i
  WHERE c.inscricao_id = p_inscricao_id
    AND i.id = c.inscricao_id
    AND i.evento_id = p_evento_id
  RETURNING c.* INTO v_checkin;

  IF v_checkin.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'ja_desfeito', true);
  END IF;

  INSERT INTO public.insc_checkin_eventos
    (checkin_id, inscricao_id, evento_id, acao, ator_id, modo, motivo, metadata)
  VALUES
    (v_checkin.id, p_inscricao_id, p_evento_id, 'desfeito', p_por,
     v_checkin.modo, NULLIF(trim(p_motivo), ''),
     jsonb_build_object(
       'checkin_em', v_checkin.em,
       'checkin_por', v_checkin.por,
       'override_pendente', v_checkin.override_pendente,
       'override_motivo', v_checkin.override_motivo
     ));

  RETURN jsonb_build_object('ok', true, 'ja_desfeito', false);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_insc_checkin_marcar(UUID, UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_insc_checkin_desfazer(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insc_checkin_marcar(UUID, UUID, TEXT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_insc_checkin_desfazer(UUID, UUID, UUID, TEXT) TO service_role;

-- ── 3. Inventário de QR emitido ─────────────────────────────────────────────
-- Guarda somente SHA-256 do token. O token bruto continua exclusivamente com
-- a pessoa; a tela administrativa identifica inscrição/evento, não expõe QR.
CREATE TABLE IF NOT EXISTS public.insc_qr_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_id UUID NOT NULL REFERENCES public.inscricoes(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  primeira_emissao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_emissao_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  emissoes INTEGER NOT NULL DEFAULT 1 CHECK (emissoes > 0),
  canais TEXT[] NOT NULL DEFAULT '{}'::text[],
  revogado_em TIMESTAMPTZ,
  revogado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revogacao_motivo TEXT,
  UNIQUE (inscricao_id, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_insc_qr_tokens_ativos
  ON public.insc_qr_tokens(inscricao_id, ultima_emissao_em DESC)
  WHERE revogado_em IS NULL;

ALTER TABLE public.insc_qr_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.insc_qr_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_insc_qr_registrar(
  p_inscricao_id UUID,
  p_token_hash TEXT,
  p_canal TEXT DEFAULT 'api'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id UUID;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'hash de QR inválido';
  END IF;
  INSERT INTO public.insc_qr_tokens (inscricao_id, token_hash, canais)
  VALUES (p_inscricao_id, p_token_hash, ARRAY[COALESCE(NULLIF(trim(p_canal), ''), 'api')])
  ON CONFLICT (inscricao_id, token_hash) DO UPDATE SET
    ultima_emissao_em = now(),
    emissoes = public.insc_qr_tokens.emissoes + 1,
    canais = CASE
      WHEN COALESCE(NULLIF(trim(p_canal), ''), 'api') = ANY(public.insc_qr_tokens.canais)
        THEN public.insc_qr_tokens.canais
      ELSE array_append(public.insc_qr_tokens.canais, COALESCE(NULLIF(trim(p_canal), ''), 'api'))
    END
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_insc_qr_registrar(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_insc_qr_registrar(UUID, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.insc_checkin_eventos IS
  'Ledger append-only da operação de portaria: entrada, override de pendência e desfazer.';
COMMENT ON TABLE public.insc_qr_tokens IS
  'Inventário de comprovantes QR emitidos; armazena somente hash e permite revogação individual.';

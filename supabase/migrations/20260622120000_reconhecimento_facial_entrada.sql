-- ============================================================================
-- Reconhecimento facial na entrada do templo (2026-06-22)
--
-- Fundação de software (testável com webcam · device edge/Jetson pluga depois):
--   • mem_membros.face_descriptor (galeria de membros CONSENTIDOS · vector 128
--     = mesmo embedding do face-api já usado no voluntariado)
--   • face_anonimos: rostos NÃO identificados, recorrentes, PSEUDONIMIZADOS
--     (só o vetor + best-shot pra revisão humana + nº de visitas + retenção)
--   • face_presencas: evento de presença, liga a MEMBRO ou a um ANÔNIMO
--   • match por pgvector nas DUAS galerias + expurgo por retenção (LGPD)
--
-- ⚠️ LGPD: biometria é dado SENSÍVEL. Membros = consentimento (face_consentimento).
-- Anônimos = pseudonimizados, retenção curta (expurgar_em) e acesso restrito.
-- Go-live exige aval do jurídico/DPO + aviso na entrada (decisão da liderança).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Galeria de MEMBROS (consentidos) ────────────────────────────────────────
ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS face_descriptor vector(128),
  ADD COLUMN IF NOT EXISTS face_consentimento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_consentimento_em timestamptz,
  ADD COLUMN IF NOT EXISTS face_cadastrado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_mem_membros_face
  ON public.mem_membros USING ivfflat (face_descriptor vector_cosine_ops)
  WHERE face_descriptor IS NOT NULL;

-- ── Galeria ANÔNIMA (pseudonimizada · retenção curta) ───────────────────────
CREATE TABLE IF NOT EXISTS public.face_anonimos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embedding     vector(128) NOT NULL,
  best_shot_path text,                       -- bucket privado · só pra revisão humana
  primeira_vez  timestamptz NOT NULL DEFAULT now(),
  ultima_vez    timestamptz NOT NULL DEFAULT now(),
  visitas       integer NOT NULL DEFAULT 1,
  entrada       text,
  ultimo_culto_id uuid,
  expurgar_em   timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','descartado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_face_anonimos_emb
  ON public.face_anonimos USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_face_anonimos_expurgo ON public.face_anonimos (expurgar_em);
CREATE INDEX IF NOT EXISTS idx_face_anonimos_status ON public.face_anonimos (status, ultima_vez DESC);

-- ── Eventos de PRESENÇA (membro OU anônimo) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.face_presencas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id     uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  anon_id       uuid REFERENCES public.face_anonimos(id) ON DELETE SET NULL,
  culto_id      uuid,
  entrada       text,
  confianca     float,
  reconhecido_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT face_presenca_alvo CHECK (membro_id IS NOT NULL OR anon_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_face_presencas_membro ON public.face_presencas (membro_id, reconhecido_em DESC);
CREATE INDEX IF NOT EXISTS idx_face_presencas_anon ON public.face_presencas (anon_id);
CREATE INDEX IF NOT EXISTS idx_face_presencas_culto ON public.face_presencas (culto_id);
CREATE INDEX IF NOT EXISTS idx_face_presencas_data ON public.face_presencas (reconhecido_em);

-- ── Match por pgvector ──────────────────────────────────────────────────────
-- Membro: só consentidos com descriptor. Distância L2 (face-api · limiar ~0.55).
CREATE OR REPLACE FUNCTION public.face_match_membro(query_descriptor vector(128), match_threshold float DEFAULT 0.55)
RETURNS TABLE(membro_id uuid, nome text, distance float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.nome, (m.face_descriptor <-> query_descriptor)::float
  FROM mem_membros m
  WHERE m.deleted_at IS NULL AND m.face_consentimento = true AND m.face_descriptor IS NOT NULL
    AND (m.face_descriptor <-> query_descriptor) < match_threshold
  ORDER BY m.face_descriptor <-> query_descriptor
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.face_match_anonimo(query_descriptor vector(128), match_threshold float DEFAULT 0.55)
RETURNS TABLE(anon_id uuid, visitas integer, distance float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.visitas, (a.embedding <-> query_descriptor)::float
  FROM face_anonimos a
  WHERE a.status = 'pendente'
    AND (a.embedding <-> query_descriptor) < match_threshold
  ORDER BY a.embedding <-> query_descriptor
  LIMIT 1;
$$;

-- Salva o descriptor do membro (enrollment) · exige 128 dimensões.
CREATE OR REPLACE FUNCTION public.face_save_membro(p_membro_id uuid, descriptor real[], p_consent boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF array_length(descriptor, 1) != 128 THEN
    RAISE EXCEPTION 'Descriptor precisa de 128 dimensões, veio %', array_length(descriptor, 1);
  END IF;
  UPDATE mem_membros SET
    face_descriptor = array_to_vector(descriptor, 128, true),
    face_consentimento = COALESCE(p_consent, face_consentimento),
    face_consentimento_em = CASE WHEN p_consent THEN now() ELSE face_consentimento_em END,
    face_cadastrado_em = now(),
    updated_at = now()
  WHERE id = p_membro_id;
  RETURN FOUND;
END;
$$;

-- Expurgo por retenção (LGPD) · chamado pelo cron. Apaga anônimos vencidos.
CREATE OR REPLACE FUNCTION public.face_expurgar_anonimos()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH del AS (DELETE FROM face_anonimos WHERE expurgar_em < now() RETURNING id)
  SELECT count(*) INTO n FROM del;
  RETURN n;
END;
$$;

-- ── Resolver anônimo · "pegar o rosto e vincular/cadastrar/descartar" ───────
-- Vincular: copia o embedding do anônimo pro MEMBRO (enrolla c/ consentimento),
-- migra o histórico de presença pro membro e apaga o anônimo. Devolve o
-- best_shot_path (pra o backend apagar a miniatura do storage). NULL se não achou.
CREATE OR REPLACE FUNCTION public.face_resolver_vincular(p_anon_id uuid, p_membro_id uuid, p_consent boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emb vector(128); v_shot text;
BEGIN
  SELECT embedding, best_shot_path INTO v_emb, v_shot FROM face_anonimos WHERE id = p_anon_id;
  IF v_emb IS NULL THEN RETURN NULL; END IF;
  UPDATE mem_membros SET
    face_descriptor = v_emb,
    face_consentimento = COALESCE(p_consent, face_consentimento),
    face_consentimento_em = CASE WHEN p_consent THEN now() ELSE face_consentimento_em END,
    face_cadastrado_em = now(),
    updated_at = now()
  WHERE id = p_membro_id;
  -- migra a presença anônima pro membro (deixa de ser anônima)
  UPDATE face_presencas SET membro_id = p_membro_id, anon_id = NULL WHERE anon_id = p_anon_id;
  DELETE FROM face_anonimos WHERE id = p_anon_id;
  RETURN COALESCE(v_shot, '');
END;
$$;

-- Descartar: anônimo que não é alguém de interesse (passante/equipe). Apaga a
-- presença anônima + o anônimo. Devolve o best_shot_path pra apagar a miniatura.
CREATE OR REPLACE FUNCTION public.face_anonimo_descartar(p_anon_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shot text;
BEGIN
  SELECT best_shot_path INTO v_shot FROM face_anonimos WHERE id = p_anon_id;
  DELETE FROM face_presencas WHERE anon_id = p_anon_id;
  DELETE FROM face_anonimos WHERE id = p_anon_id;
  RETURN COALESCE(v_shot, '');
END;
$$;

-- ── Bucket PRIVADO do best-shot (revisão humana · acesso só via signed URL) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-anonimos', 'face-anonimos', false)
ON CONFLICT (id) DO NOTHING;

-- ── Módulo no menu/permissões (slug 'face') · seed a partir de 'membresia' ──
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'face', 'Reconhecimento Facial', '/ministerial/reconhecimento-facial', 'ministerial', 999,
       'Reconhecimento facial na entrada · presença + rostos a resolver', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'face');

DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'membresia';
  IF base_modulo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
      CROSS JOIN public.modulos novo
     WHERE cmp.modulo_id = base_modulo_id
       AND novo.slug = 'face'
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

-- ── RLS · biometria é sensível · acesso só pelo backend (service_role) ──────
ALTER TABLE public.face_anonimos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_presencas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY face_anonimos_service ON public.face_anonimos FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY face_anonimos_super ON public.face_anonimos FOR SELECT TO authenticated USING (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY face_presencas_service ON public.face_presencas FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY face_presencas_super ON public.face_presencas FOR SELECT TO authenticated USING (public.is_super_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

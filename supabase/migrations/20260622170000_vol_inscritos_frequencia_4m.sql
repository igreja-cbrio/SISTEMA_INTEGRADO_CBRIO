-- ============================================================================
-- Frequência do voluntariado · inativos = 0 serviços em 4 meses (2026-06-22)
--
-- Problema: a aba Frequência montava a lista a partir de EVENTOS de serviço
-- (vol_servicos_historico). Quem serviu 0 vezes não tem evento → some da lista.
-- O líder precisa ver justamente quem DEIXOU de servir (inativo) pra contatar.
--
-- Solução: cadastro de INSCRITOS (coluna "Inscritos (fixo)" da planilha) como
-- base; a view passa a ser INSCRITO ⟕ serviços nos últimos 4 MESES.
--   • ativo  = serviu ≥1 vez nos últimos 4 meses
--   • inativo = 0 serviços em 4 meses → candidato a contato
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vol_inscritos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_planilha  text NOT NULL,
  nome_norm      text NOT NULL,
  vol_profile_id uuid REFERENCES public.vol_profiles(id) ON DELETE SET NULL,
  membro_id      uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  origem         text NOT NULL DEFAULT 'planilha_2026',
  ativo          boolean NOT NULL DEFAULT true,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vol_inscritos_uq UNIQUE (nome_norm, origem)
);
CREATE INDEX IF NOT EXISTS idx_vol_inscritos_profile ON public.vol_inscritos (vol_profile_id);
CREATE INDEX IF NOT EXISTS idx_vol_inscritos_membro ON public.vol_inscritos (membro_id);

ALTER TABLE public.vol_inscritos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY vol_inscritos_service ON public.vol_inscritos FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vol_inscritos_sel ON public.vol_inscritos FOR SELECT TO authenticated
    USING (public.current_user_module_level('voluntariado') >= 1 OR public.current_user_module_level('membresia') >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── View de frequência (roster-based · janela de 4 meses) ───────────────────
-- Mantém as colunas que a tela já usa (chave, vol_profile_id, nome_norm, nome,
-- total_servicos, ultimo_servico, ativo) e acrescenta servicos_4m / telefone /
-- membro_id. ativo agora = serviu nos últimos 4 meses.
DROP VIEW IF EXISTS public.vw_vol_frequencia;
CREATE VIEW public.vw_vol_frequencia AS
WITH roster AS (
  -- inscritos cadastrados (inclui quem serviu 0 vezes)
  SELECT
    COALESCE(i.vol_profile_id::text, 'n:' || i.nome_norm) AS chave,
    i.vol_profile_id::text AS vol_profile_id,
    i.nome_norm,
    i.nome_planilha AS nome,
    i.membro_id::text AS membro_id
  FROM public.vol_inscritos i
  WHERE i.deleted_at IS NULL AND i.ativo
  UNION
  -- nomes que aparecem no histórico mas não estão nos inscritos
  SELECT
    COALESCE(h.vol_profile_id::text, 'n:' || h.nome_norm) AS chave,
    h.vol_profile_id::text,
    h.nome_norm,
    (array_agg(h.nome_planilha ORDER BY h.created_at NULLS LAST))[1] AS nome,
    NULL::text
  FROM public.vol_servicos_historico h
  WHERE h.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.vol_inscritos i2
      WHERE i2.deleted_at IS NULL
        AND COALESCE(i2.vol_profile_id::text, 'n:' || i2.nome_norm) = COALESCE(h.vol_profile_id::text, 'n:' || h.nome_norm))
  GROUP BY COALESCE(h.vol_profile_id::text, 'n:' || h.nome_norm), h.vol_profile_id, h.nome_norm
),
serv AS (
  SELECT
    COALESCE(h.vol_profile_id::text, 'n:' || h.nome_norm) AS chave,
    count(*)::int AS total_geral,
    count(*) FILTER (WHERE h.data >= (current_date - interval '4 months'))::int AS servicos_4m,
    max(h.data) AS ultimo_servico
  FROM public.vol_servicos_historico h
  WHERE h.deleted_at IS NULL
  GROUP BY COALESCE(h.vol_profile_id::text, 'n:' || h.nome_norm)
)
SELECT
  r.chave,
  r.vol_profile_id,
  r.nome_norm,
  r.nome,
  COALESCE(s.servicos_4m, 0)  AS servicos_4m,
  COALESCE(s.total_geral, 0)  AS total_servicos,
  s.ultimo_servico,
  (COALESCE(s.servicos_4m, 0) > 0) AS ativo,
  COALESCE(mm.telefone, vp.phone) AS telefone,
  COALESCE(NULLIF(r.membro_id, ''), vp.membresia_id::text) AS membro_id
FROM roster r
LEFT JOIN serv s ON s.chave = r.chave
LEFT JOIN public.vol_profiles vp ON vp.id = NULLIF(r.vol_profile_id, '')::uuid
LEFT JOIN public.mem_membros mm ON mm.id = COALESCE(NULLIF(r.membro_id, '')::uuid, vp.membresia_id);

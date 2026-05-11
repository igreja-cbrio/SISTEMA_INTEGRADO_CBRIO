-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ Módulo NPS — pesquisas e respostas                                ║
-- ║ • nps_pesquisas: pesquisa criada por admin/diretor                ║
-- ║   (valor, objetivo, perguntas geradas pela IA, link público)      ║
-- ║ • nps_respostas: respostas individuais (logado ou público)        ║
-- ║ Integração: alimenta dados_brutos com tipo nps_* via backend.     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.nps_pesquisas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  valor text NOT NULL CHECK (valor IN ('seguir','conectar','investir','servir','generosidade')),
  objetivo text NOT NULL,
  contexto_kpi text NOT NULL DEFAULT 'nps_geral'
    CHECK (contexto_kpi IN ('nps_geral','nps_next','nps_lideres','nps_voluntarios')),
  area text NOT NULL DEFAULT 'geral',
  perguntas jsonb NOT NULL,
  ia_modelo text DEFAULT 'claude-haiku-4-5-20251001',
  ia_prompt text,
  link_publico_token text,
  permite_publico boolean NOT NULL DEFAULT true,
  data_inicio date NOT NULL DEFAULT current_date,
  data_fim date,
  status text NOT NULL DEFAULT 'ativa'
    CHECK (status IN ('rascunho','ativa','encerrada','arquivada')),
  analise_ia jsonb,
  analise_atualizada_em timestamptz,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_pesquisas_status   ON public.nps_pesquisas(status);
CREATE INDEX IF NOT EXISTS idx_nps_pesquisas_valor    ON public.nps_pesquisas(valor);
CREATE INDEX IF NOT EXISTS idx_nps_pesquisas_criadopor ON public.nps_pesquisas(criado_por);
CREATE UNIQUE INDEX IF NOT EXISTS uq_nps_pesquisas_token
  ON public.nps_pesquisas(link_publico_token)
  WHERE link_publico_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.nps_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id uuid NOT NULL REFERENCES public.nps_pesquisas(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome_publico text,
  email_publico text,
  score smallint NOT NULL CHECK (score >= 0 AND score <= 10),
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  comentario text,
  origem text NOT NULL DEFAULT 'logado'
    CHECK (origem IN ('logado','publico')),
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Um colaborador logado responde no máximo uma vez por pesquisa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nps_respostas_profile
  ON public.nps_respostas(pesquisa_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nps_respostas_pesquisa ON public.nps_respostas(pesquisa_id);
CREATE INDEX IF NOT EXISTS idx_nps_respostas_created  ON public.nps_respostas(created_at DESC);

-- ── updated_at trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_nps_pesquisas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nps_pesquisas_updated_at ON public.nps_pesquisas;
CREATE TRIGGER trg_nps_pesquisas_updated_at
BEFORE UPDATE ON public.nps_pesquisas
FOR EACH ROW EXECUTE FUNCTION public.set_nps_pesquisas_updated_at();

-- ── View agregada por pesquisa ─────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_nps_pesquisa_stats AS
SELECT
  p.id                                                  AS pesquisa_id,
  p.titulo,
  p.valor,
  p.contexto_kpi,
  p.area,
  p.status,
  p.data_inicio,
  p.data_fim,
  COUNT(r.id)                                           AS total_respostas,
  COALESCE(ROUND(AVG(r.score)::numeric, 2), 0)          AS score_medio,
  COUNT(r.id) FILTER (WHERE r.score >= 9)               AS promoters,
  COUNT(r.id) FILTER (WHERE r.score BETWEEN 7 AND 8)    AS passives,
  COUNT(r.id) FILTER (WHERE r.score <= 6)               AS detractors,
  CASE
    WHEN COUNT(r.id) = 0 THEN 0
    ELSE ROUND(
      ((COUNT(r.id) FILTER (WHERE r.score >= 9))::numeric
        - (COUNT(r.id) FILTER (WHERE r.score <= 6))::numeric)
      / COUNT(r.id)::numeric * 100, 1)
  END                                                   AS nps_score
FROM public.nps_pesquisas p
LEFT JOIN public.nps_respostas r ON r.pesquisa_id = p.id
GROUP BY p.id;

-- ── RLS ────────────────────────────────────────────────────────────
-- Backend usa service role (bypass RLS). RLS protege acesso direto via
-- cliente Supabase com chave anon (caso algum frontend leia direto).
ALTER TABLE public.nps_pesquisas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_respostas ENABLE ROW LEVEL SECURITY;

-- Pesquisas: leitura por autenticados; escrita só pelo dono ou via backend.
DROP POLICY IF EXISTS nps_pesquisas_read_auth ON public.nps_pesquisas;
CREATE POLICY nps_pesquisas_read_auth ON public.nps_pesquisas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS nps_pesquisas_write_owner ON public.nps_pesquisas;
CREATE POLICY nps_pesquisas_write_owner ON public.nps_pesquisas
  FOR ALL TO authenticated
  USING (criado_por = auth.uid())
  WITH CHECK (criado_por = auth.uid());

-- Respostas: cada usuário só lê as próprias (admin/diretor via backend
-- com service role acessa tudo).
DROP POLICY IF EXISTS nps_respostas_read_own ON public.nps_respostas;
CREATE POLICY nps_respostas_read_own ON public.nps_respostas
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS nps_respostas_insert_self ON public.nps_respostas;
CREATE POLICY nps_respostas_insert_self ON public.nps_respostas
  FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

COMMENT ON TABLE public.nps_pesquisas IS
  'Pesquisas NPS criadas via assistente de IA (valor + objetivo → perguntas geradas).';
COMMENT ON TABLE public.nps_respostas IS
  'Respostas individuais às pesquisas NPS (logado ou via link público).';
COMMENT ON VIEW  public.vw_nps_pesquisa_stats IS
  'Estatísticas agregadas por pesquisa: total, média, NPS score, promoters/passives/detractors.';

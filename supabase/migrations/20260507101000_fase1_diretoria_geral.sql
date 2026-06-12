-- ============================================================================
-- FASE 1 · Diretoria Geral (subconjunto nominal de profiles)
--
-- A "diretoria geral" da CBRio sao 5+ pessoas especificas que:
--   - Recebem alertas criticos no /painel
--   - Participam do ritual mensal (registram causa-decisao-resp-proximo passo)
--
-- Distincao:
--   - role = 'diretor'              -> acesso a /gestao (Marcos, Matheus, Eduardo, ...)
--   - is_diretoria_geral = true     -> participa do ritual + recebe alertas (5 pessoas)
--
-- Uma pessoa pode ser ambos (Eduardo: diretor + diretoria_geral).
-- Uma pessoa pode ser so um (Pr. Pedrao: nao mexe no sistema mas e diretoria geral).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_diretoria_geral boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS funcao_diretoria text;

COMMENT ON COLUMN public.profiles.is_diretoria_geral IS 'Pessoa faz parte da diretoria geral da CBRio (lideres maximos). Recebe alertas criticos e participa do ritual mensal de revisao de OKRs.';
COMMENT ON COLUMN public.profiles.funcao_diretoria IS 'Funcao na diretoria geral (ex: Pastor Senior, Lider de Gestao, Lider Ministerial). Mostrado no /ritual e no painel da diretoria.';

CREATE INDEX IF NOT EXISTS idx_profiles_diretoria ON public.profiles (is_diretoria_geral) WHERE is_diretoria_geral = true;

-- ----------------------------------------------------------------------------
-- View: lista atual da diretoria geral (usada no /gestao e /ritual)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_diretoria_geral AS
SELECT
  p.id,
  p.name,
  p.email,
  p.role,
  p.funcao_diretoria,
  p.active
FROM public.profiles p
WHERE p.is_diretoria_geral = true
  AND p.active = true
ORDER BY
  CASE
    WHEN p.funcao_diretoria ILIKE '%senior%'     THEN 1
    WHEN p.funcao_diretoria ILIKE '%presidente%' THEN 2
    WHEN p.funcao_diretoria ILIKE '%gestao%'     THEN 3
    WHEN p.funcao_diretoria ILIKE '%ministerial%' THEN 4
    WHEN p.funcao_diretoria ILIKE '%criativo%'   THEN 5
    ELSE 9
  END,
  p.name;

GRANT SELECT ON public.vw_diretoria_geral TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Seed: marcar as 5 pessoas se ja existirem com email conhecido
-- (cuidado: nao duplicar; so atualiza is_diretoria_geral)
-- Os emails reais vou marcar via UI no /gestao depois — este seed e
-- deixado vazio porque nao temos os emails confirmados aqui.
--
-- Ex futuro:
-- UPDATE profiles SET is_diretoria_geral = true, funcao_diretoria = 'Pastor Senior'
--   WHERE email = 'pedrao@cbrio.com.br';
-- ----------------------------------------------------------------------------

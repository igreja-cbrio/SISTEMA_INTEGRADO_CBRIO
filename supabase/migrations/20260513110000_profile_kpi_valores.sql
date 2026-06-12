-- ============================================================================
-- Adiciona campo kpi_valores em profiles
--
-- Marcos: "alinhe as permissoes, isso que e importante, uma pessoa nao
--          precisa ver os kpi's de outra area ou valor alem do proprio,
--          isso e uma area chamada 'Meus KPI'S' logo, preciso que mostre
--          so os dela. Vamos comecar com as areas dos valores: seguir a
--          jesus, conectar-se com pessoas, investir tempo com Deus, Servir
--          em comunidade, Viver Generosamente"
--
-- Igual ao campo kpi_areas (text array), mas pra valores da Jornada.
-- Lider responsavel por "Seguir Jesus" → kpi_valores = ['seguir']
-- Pode ter multiplos (ex: ['conectar', 'servir'])
-- Empty array = sem responsabilidade por valor
--
-- Permissoes (regra futura):
-- - admin/diretor: ve tudo
-- - usuario: ve KPI se kpi.area in profile.kpi_areas OR kpi.valores ∩ profile.kpi_valores
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kpi_valores text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.profiles.kpi_valores IS
  'Valores da Jornada que o usuario e responsavel por preencher dados (seguir/conectar/investir/servir/generosidade)';

-- Indice GIN pra busca rapida por valor
CREATE INDEX IF NOT EXISTS idx_profiles_kpi_valores ON public.profiles USING GIN (kpi_valores);

-- ----------------------------------------------------------------------------
-- Conferencia (depois de rodar):
-- SELECT email, kpi_areas, kpi_valores FROM profiles WHERE active = true LIMIT 5;
-- ============================================================================

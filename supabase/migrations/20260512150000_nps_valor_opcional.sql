-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ NPS: permite criar pesquisa SEM um dos 5 valores                      ║
-- ║                                                                       ║
-- ║ Antes: valor era NOT NULL e CHECK exigia 1 dos 5 valores.             ║
-- ║        Não dava para criar pesquisa "só de área" (Compras, RH...).    ║
-- ║                                                                       ║
-- ║ Depois: valor é opcional. Cada pesquisa precisa ter AO MENOS UM       ║
-- ║         escopo definido — valor OU área específica (diferente de      ║
-- ║         'geral'). Pode ter os dois (NPS de RH dentro de Servir).      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- 1. Permitir valor IS NULL
ALTER TABLE public.nps_pesquisas
  ALTER COLUMN valor DROP NOT NULL;

-- 2. Substituir o CHECK antigo para aceitar NULL
ALTER TABLE public.nps_pesquisas
  DROP CONSTRAINT IF EXISTS nps_pesquisas_valor_check;

ALTER TABLE public.nps_pesquisas
  ADD CONSTRAINT nps_pesquisas_valor_check
    CHECK (valor IS NULL OR valor IN ('seguir','conectar','investir','servir','generosidade'));

-- 3. Garantir que toda pesquisa tem ao menos um escopo definido
ALTER TABLE public.nps_pesquisas
  DROP CONSTRAINT IF EXISTS nps_pesquisas_escopo_check;

ALTER TABLE public.nps_pesquisas
  ADD CONSTRAINT nps_pesquisas_escopo_check
    CHECK (
      valor IS NOT NULL
      OR (area IS NOT NULL AND lower(area) <> 'geral')
    );

COMMENT ON CONSTRAINT nps_pesquisas_escopo_check ON public.nps_pesquisas IS
  'Cada NPS precisa de pelo menos um escopo: ou um dos 5 valores CBRio, ou uma área específica (não-geral).';

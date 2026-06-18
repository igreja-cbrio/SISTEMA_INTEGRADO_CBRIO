-- ============================================================
-- Membresia · faixa etária derivada + ministério que frequenta (AMI/Bridge)
-- - frequenta_area: auto-declarado no cadastro do app (escolha única).
--   Alimenta a aba "Pessoas" dos módulos AMI e Bridge.
-- - fn_faixa_etaria: classifica pela data de nascimento.
--   Criança < 13 · Adolescente 13–17 · Jovem 18–30 · Adulto 31+.
-- ============================================================

-- 1. Coluna do ministério auto-declarado
ALTER TABLE public.mem_membros
  ADD COLUMN IF NOT EXISTS frequenta_area text
  CHECK (frequenta_area IN ('ami','bridge'));

CREATE INDEX IF NOT EXISTS idx_mem_membros_frequenta_area
  ON public.mem_membros (frequenta_area)
  WHERE frequenta_area IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.mem_membros.frequenta_area IS
  'Ministério que a pessoa declara frequentar (ami/bridge), informado no cadastro do app. Alimenta a aba Pessoas dos módulos AMI/Bridge.';

-- 2. Faixa etária derivada da data de nascimento
CREATE OR REPLACE FUNCTION public.fn_faixa_etaria(p_nasc date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_nasc IS NULL THEN NULL
    WHEN date_part('year', age(p_nasc)) < 13 THEN 'crianca'
    WHEN date_part('year', age(p_nasc)) <= 17 THEN 'adolescente'
    WHEN date_part('year', age(p_nasc)) <= 30 THEN 'jovem'
    ELSE 'adulto'
  END
$$;

COMMENT ON FUNCTION public.fn_faixa_etaria(date) IS
  'Faixa etária pela data de nascimento: crianca <13, adolescente 13-17, jovem 18-30, adulto 31+.';

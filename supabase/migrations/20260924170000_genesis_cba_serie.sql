-- ============================================================================
-- Genesis CBA vira SÉRIE PERMANENTE (2026-09-24 · pedido do Matheus)
-- ============================================================================
-- "Crie um evento Genesis CBA, deixe ele sempre aberto, e aí nós colocamos as
-- datas, ativamos ou inativamos, colocamos a igreja sede daquele Genesis, e
-- separamos as inscrições por evento" + "deixa o próprio CBA como responsável,
-- atrelado ao pastor Nélio".
--
-- Modelo: UMA série (`insc_series`, slug_base 'genesis') · cada Genesis é uma
-- EDIÇÃO (`insc_eventos`) com data e `igreja_id` (a igreja sede, parceira) ·
-- inscrições já são por edição. Nada de tabela nova.
--
-- 1. Área CBA no catálogo oficial (a espinha exige área de `areas`).
-- 2. `insc_series.responsavel_id` · quem responde pela série (recebe o aviso
--    de cada inscrição). FK pra profiles (lei nº 3: responsável é UUID).
-- 3. A série Genesis CBA, área CBA, responsável = o login do ERP do pastor
--    Nélio (resolvido por e-mail · NULL se a conta não existir).
--
-- Idempotente. Aplicação manual: 1 colagem.
-- ============================================================================
SET lock_timeout = '10s';

-- ── 1. Área CBA ──
INSERT INTO public.areas (nome, setor_id, descricao, ativo)
SELECT 'CBA', s.id, 'CBA · igrejas parceiras (Genesis CBA)', true
  FROM public.setores s
 WHERE s.nome ILIKE 'Ministerial%'
   AND NOT EXISTS (SELECT 1 FROM public.areas a WHERE lower(a.nome) = 'cba')
 LIMIT 1;

-- ── 2. Responsável da série ──
ALTER TABLE public.insc_series
  ADD COLUMN IF NOT EXISTS responsavel_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insc_series_responsavel_id_fkey') THEN
    ALTER TABLE public.insc_series
      ADD CONSTRAINT insc_series_responsavel_id_fkey
      FOREIGN KEY (responsavel_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
COMMENT ON COLUMN public.insc_series.responsavel_id IS
  'Quem responde pela série (recebe o aviso de cada nova inscrição das edições). NULL = só a regra da área.';

-- ── 3. Série Genesis CBA ──
INSERT INTO public.insc_series (nome, slug_base, area, periodicidade, tipo, ativo, responsavel_id)
SELECT 'Genesis CBA', 'genesis', 'CBA', 'custom', 'evento', true,
       (SELECT p.id FROM public.profiles p WHERE lower(p.email) = 'nelio.paiva@cbrio.org' LIMIT 1)
 WHERE NOT EXISTS (SELECT 1 FROM public.insc_series WHERE slug_base = 'genesis');

-- Conferência (rodar separado):
-- select s.nome, s.area, s.periodicidade, p.name as responsavel
--   from insc_series s left join profiles p on p.id = s.responsavel_id where s.slug_base = 'genesis';

NOTIFY pgrst, 'reload schema';

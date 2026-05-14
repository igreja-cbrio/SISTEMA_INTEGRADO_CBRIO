-- ============================================================================
-- Modal de culto adaptativo por tipo · campos de configuracao no service_type
--
-- Marcos: "quero que cada janela de preenchimento de culto seja diferente de
--          acordo com o culto, as janelas do culto de domingo nao usem
--          'adultos', use 'sede', coloque frequencia presencial, kids e online,
--          os cultos do ami, coloque apenas presencial e online pois nao tem
--          kids, e no bridge coloque apenas presencial pois nao tem online e
--          kids. Tente fazer dessa forma em todos os cultos"
--
-- Estrutura: 3 colunas em vol_service_types alimentam o ModalCulto.
-- Frontend le e mostra/esconde secoes · alterar config sem deploy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em vol_service_types
-- ----------------------------------------------------------------------------
ALTER TABLE public.vol_service_types
  ADD COLUMN IF NOT EXISTS presencial_label text NOT NULL DEFAULT 'Presencial',
  ADD COLUMN IF NOT EXISTS has_kids         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_online       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vol_service_types.presencial_label IS
  'Label do input de frequencia presencial no ModalCulto (ex: "Sede" pros cultos de domingo)';
COMMENT ON COLUMN public.vol_service_types.has_kids IS
  'Se true, mostra input "Kids" e decisoes_kids · so cultos com programacao infantil paralela';
COMMENT ON COLUMN public.vol_service_types.has_online IS
  'Se true, mostra secao "Transmissao online" + decisoes_online · so cultos que sao transmitidos';

-- ----------------------------------------------------------------------------
-- 2. Seed da configuracao por tipo
-- ----------------------------------------------------------------------------
-- Domingos (Sede) · 4 cultos · tem kids + online
UPDATE public.vol_service_types
   SET presencial_label = 'Sede',
       has_kids         = true,
       has_online       = true,
       updated_at       = now()
 WHERE name LIKE 'Domingo %';

-- AMI · presencial + online, sem kids
UPDATE public.vol_service_types
   SET presencial_label = 'Presencial',
       has_kids         = false,
       has_online       = true,
       updated_at       = now()
 WHERE name = 'AMI';

-- Quarta com Deus · presencial + online, sem kids
UPDATE public.vol_service_types
   SET presencial_label = 'Presencial',
       has_kids         = false,
       has_online       = true,
       updated_at       = now()
 WHERE name = 'Quarta com Deus';

-- Bridge · so presencial · sem kids, sem online
UPDATE public.vol_service_types
   SET presencial_label = 'Presencial',
       has_kids         = false,
       has_online       = false,
       updated_at       = now()
 WHERE name = 'Bridge';

-- ----------------------------------------------------------------------------
-- 3. Recria vw_culto_stats expondo os 3 campos novos pro frontend
--    (Frontend nao consulta vol_service_types direto pelo culto · usa view.)
--
-- DROP + CREATE em vez de CREATE OR REPLACE: o REPLACE so permite ADICIONAR
-- colunas no final · como cultos ganhou colunas novas ao longo do tempo
-- (visitantes, visitantes_online, voluntarios, culto_id em int_visitantes),
-- o `c.*` agora expande pra mais colunas e desloca service_type_name, o
-- que o REPLACE recusa com "cannot change name of view column".
-- Backend usa a view via SELECT simples · nada depende dela (sem CASCADE).
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_culto_stats;

CREATE VIEW public.vw_culto_stats AS
SELECT
  c.*,
  vst.name              AS service_type_name,
  vst.color             AS service_type_color,
  vst.presencial_label  AS service_type_presencial_label,
  vst.has_kids          AS service_type_has_kids,
  vst.has_online        AS service_type_has_online,
  ROUND(c.presencial_adulto::numeric / 1300 * 100, 1)                        AS taxa_ocupacao,
  (c.presencial_adulto + c.presencial_kids)                                   AS total_presencial,
  (COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0))      AS total_decisoes
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id;

-- ----------------------------------------------------------------------------
-- Conferencia:
--   SELECT name, presencial_label, has_kids, has_online
--     FROM vol_service_types WHERE is_active = true ORDER BY recurrence_day, recurrence_time;
-- Espera:
--   Domingo 08:30  | Sede        | t | t
--   Domingo 10:00  | Sede        | t | t
--   Domingo 11:30  | Sede        | t | t
--   Domingo 19:00  | Sede        | t | t
--   Quarta com Deus| Presencial  | f | t
--   Bridge         | Presencial  | f | f
--   AMI            | Presencial  | f | t
-- ============================================================================

-- ============================================================================
-- Cultos · flags de lançamento (frequência / decisões)
--
-- Marcos: o card "Cultos pendentes" de /integracao precisa direcionar pros
-- cultos certos, e quer um card novo "Cultos incompletos" — cultos preenchidos
-- PELA METADE (só frequência OU só decisão). A regra: mesmo que o número seja 0,
-- a pessoa DEVE digitar 0 pra concluir · senão o culto fica na lista a completar.
--
-- O schema tem DEFAULT 0 nas colunas numéricas, então "0 digitado" e "intocado"
-- são indistinguíveis hoje. Em vez de tornar as colunas nullable (rippla por
-- KPIs e dezenas de read-sites), adicionamos 2 flags booleanas que marcam
-- "esta seção foi lançada" (incluindo 0 explícito). Os números seguem
-- NOT NULL DEFAULT 0 · nada na cascata de KPI/NSM muda.
-- ============================================================================

ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS frequencia_lancada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decisoes_lancadas  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.cultos.frequencia_lancada IS
  'TRUE quando a frequência (presencial adulto/kids) foi lançada · inclui 0 '
  'digitado explicitamente. Distingue "lançado 0" de "intocado" pro card '
  'Cultos incompletos em /integracao. Não afeta KPI (números seguem em 0).';
COMMENT ON COLUMN public.cultos.decisoes_lancadas IS
  'TRUE quando as decisões (presenciais/online/kids) foram lançadas · inclui 0 '
  'digitado explicitamente. Distingue "lançado 0" de "intocado".';

-- Backfill: marca como lançado o que já tem qualquer número > 0 na seção. Cultos
-- com a seção inteira em 0 ficam false → surgem como pendente/incompleto pra
-- alguém confirmar (digitar o número real ou 0 explícito · pedido do Marcos).
UPDATE public.cultos
   SET frequencia_lancada = (COALESCE(presencial_adulto, 0) > 0 OR COALESCE(presencial_kids, 0) > 0),
       decisoes_lancadas  = (COALESCE(decisoes_presenciais, 0) > 0
                             OR COALESCE(decisoes_online, 0) > 0
                             OR COALESCE(decisoes_kids, 0) > 0);

-- ----------------------------------------------------------------------------
-- Recria vw_culto_stats pra expor as colunas novas.
--
-- ⚠️ Em PostgreSQL, `SELECT c.*` numa view é expandido pra lista fixa de colunas
-- no momento da criação · adicionar coluna na tabela NÃO entra na view sozinho
-- (a nota da migration 20260519150000 estava equivocada · `observacoes` também
-- ficou de fora). DROP + CREATE re-expande o `c.*` · traz frequencia_lancada,
-- decisoes_lancadas E observacoes. Definição idêntica à de 20260514120000.
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

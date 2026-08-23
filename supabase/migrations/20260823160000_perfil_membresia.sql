-- ============================================================================
-- PERFIL DA MEMBRESIA · a aba de análise demográfica (2026-08-23)
--
-- Pedido do Matheus: "um módulo estilo dashboards para análise dos membros —
-- mapa de onde se concentra a maior parte, gráfico de faixa de idade, gênero.
-- A partir do que já temos hoje; quando o censo for sendo feito esse módulo vai
-- sendo alimentado."
--
-- ⚠️⚠️ O QUE ESTA ENTREGA MEDE ANTES DE PROMETER (contagem real de 23/08/2026,
-- base ativa = 3.926 pessoas · 1.730 `membro_ativo`):
--
--   cidade            3.926 (100%)  — e é INÚTIL: é "Rio de Janeiro" em todas
--   data_nascimento   1.736 (44%)
--   genero            1.089 (28%)
--   endereco             178 (4,5%)
--   bairro               177 (4,5%)
--   cep                  154 (3,9%)
--   lat/lng                0 (0%)
--   estado_civil         193 (4,9%)
--   escolaridade          12 (0,3%)
--
-- Ou seja: o mapa nasce quase vazio, e isso é o ponto. A tela existe para
-- mostrar o TAMANHO do buraco cadastral — é o argumento visual do censo. Todo
-- corte declara sua `base` ("X de Y responderam"); nenhum percentual é
-- calculado sobre a base inteira fingindo que o não-informado não existe. Um
-- perfil com 28% de gênero preenchido que se apresenta como "a igreja é 65%
-- feminina" é uma mentira com aparência de dado.
--
-- ---------------------------------------------------------------------------
-- ⚠️ TRÊS COLUNAS DE `mem_membros` QUE PARECEM SERVIR E NÃO SERVEM
-- ---------------------------------------------------------------------------
-- Medido em 23/08 na base viva, com `active` e sem `deleted_at`:
--
--   mem_membros.batizado        = true em  **0** linhas
--   mem_membros.voluntario      = true em  **0** linhas
--   mem_membros.data_membresia  preenchida em **0** linhas
--
-- São colunas mortas. Um gráfico "batizados" alimentado por `m.batizado`
-- publicaria **0%** com toda a aparência de número apurado — e a igreja tem 492
-- batizados. Por isso:
--
--  · Engajamento (batizado, voluntário, grupo, Next, convertido, contribuinte,
--    5 valores) vem de **`vw_pessoas_papeis_mat`**, que já é a régua única do
--    `/admin/cruzamentos` (`cruzar_pessoas`). Uma régua, não duas. ⚠️ É
--    MATERIALIZADA: refresca no cron diário `/api/jornada/cron/refresh-papeis`
--    (05:00). O número pode ter até 24h — a tela mostra `atualizado_em`.
--  · `tempo_de_casa` continua no contrato do JSON, mas nasce com base 0. A tela
--    esconde corte de base 0 em vez de desenhar um gráfico vazio: quando o
--    censo preencher `data_membresia`, o corte aparece sozinho.
--  · `valor_investir` também é 0 hoje em toda a base — mesmo tratamento.
--
-- ---------------------------------------------------------------------------
-- DECISÕES DESTA MIGRATION
-- ---------------------------------------------------------------------------
--
-- 1. **A régua de faixa etária continua sendo `fn_faixa_etaria`** (LEI de
--    19/08: criança <13 · adolescente 13-17 · jovem 18-25 · adulto 26+). Não
--    existe régua nova aqui. O que existe é `faixa_detalhada`, um HISTOGRAMA de
--    leitura que NASCE DENTRO da régua: 0-12 / 13-17 / 18-25 são exatamente
--    criança/adolescente/jovem, e 26+ (que a régua trata como bloco único e é
--    88% da membresia) é aberto em 26-35 / 36-45 / 46-55 / 56-65 / 66+. Somar
--    as cinco últimas dá 'adulto' — o bloco de conferência no fim desta
--    migration ABORTA se deixar de dar. Refinar não é discordar.
--
-- 2. **O mapa é AGREGADO POR BAIRRO** (decisão do Matheus, 23/08). Círculo por
--    bairro, tamanho = nº de pessoas. Nenhum endereço individual sai do
--    servidor. Motivo: a tela é vista por líder de área, e "onde cada membro
--    mora" não é informação que precisa circular para responder "onde nossa
--    gente está".
--
-- 3. **Centróide de bairro mora em `dem_bairro_geo`, NUNCA em
--    `mem_membros.lat/lng`.** Mesma lição de `src/lib/pinosMapa.ts`: gravar o
--    centro do bairro como se fosse a coordenada da pessoa é inventar precisão,
--    e o levantamento cadastral futuro perderia a distinção entre endereço real
--    e chute. `mem_membros.lat/lng` só recebe acerto de logradouro. O mapa desta
--    aba não lê lat/lng de pessoa — lê o centróide do bairro e o CONTADOR.
--
-- 4. **Bairro digitado à mão precisa de APELIDO, senão o mapa mente.** Medido em
--    23/08 nos 178 endereços que existem: "barra da tijuca" (35), "Barra" (22) e
--    "Barra Olímpica" (20) são o MESMO lugar, e apareciam como três bolinhas
--    médias em vez de uma grande — exatamente o contrário do que a pergunta
--    "onde se concentra a maior parte" quer saber. `dem_bairro_geo.alias_de`
--    resolve na leitura. E "Rio de Janeiro" digitado no campo bairro não é
--    bairro: `ignorar` o tira do mapa em vez de inventar um centro para ele.
--
-- 5. **Enriquecimento por leitura, não por escrita.** `vw_dem_pessoa` completa
--    gênero/nascimento/CEP/endereço que faltam no cadastro com o que a pessoa já
--    declarou em `batismo_inscricoes`, `inscricoes` e `mem_cadastros_pendentes`
--    (ganho medido: o endereço sai de 178 para 685 linhas; entre os
--    `membro_ativo`, de ~10% para 33%). O cadastro NÃO é sobrescrito: quem
--    decide o valor principal de `mem_membros` é ação humana (LEI do Contrato de
--    porta, item 3). A view lê; o dado de origem continua rastreável.
--
-- 6. **`batismo_inscricoes.sexo` é legado 'M'/'F'** (17 linhas), não o canônico
--    `masculino|feminino` do Contrato de Inscrição. A view normaliza na leitura
--    em vez de migrar o dado: são linhas antigas, e dado legado não é reescrito.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Centróide e apelido por bairro
--
-- Geocodificar 4.000 pessoas no Nominatim (1,1s cada por política do serviço)
-- levaria mais de uma hora e devolveria, na esmagadora maioria, o centro do
-- bairro de novo. Geocodificar cada BAIRRO DISTINTO uma vez são algumas dezenas
-- de chamadas — e é exatamente a precisão que um mapa agregado usa.
--
-- `tentativas`/`ultima_tentativa_em` existem para o lote não bater eternamente
-- no mesmo bairro que o Nominatim não acha.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dem_bairro_geo (
  bairro_norm          text PRIMARY KEY,
  bairro               text NOT NULL,
  cidade               text,
  uf                   text,
  lat                  numeric,
  lng                  numeric,
  fonte                text,
  geocodificado_em     timestamptz,
  tentativas           integer NOT NULL DEFAULT 0,
  ultima_tentativa_em  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Apelido e lixo. Colunas separadas de propósito: `alias_de` diz "é outro lugar
-- com outro nome", `ignorar` diz "não é bairro nenhum". Misturar os dois num
-- campo só faria "Rio de Janeiro" virar apelido de algum bairro real.
ALTER TABLE public.dem_bairro_geo
  ADD COLUMN IF NOT EXISTS alias_de text,
  ADD COLUMN IF NOT EXISTS ignorar  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nota     text;

-- Apelido que aponta pra si mesmo faria o join laçar o próprio bairro.
ALTER TABLE public.dem_bairro_geo DROP CONSTRAINT IF EXISTS dem_bairro_geo_alias_nao_circular;
ALTER TABLE public.dem_bairro_geo
  ADD CONSTRAINT dem_bairro_geo_alias_nao_circular
  CHECK (alias_de IS NULL OR alias_de <> bairro_norm);

COMMENT ON TABLE public.dem_bairro_geo IS
  'Centroide, apelido e lixo por bairro, para o mapa agregado do Perfil da Membresia. O centroide NAO e a coordenada de ninguem: e o centro do bairro, usado so para posicionar o circulo agregado. Coordenada de PESSOA vive em mem_membros.lat/lng e so recebe acerto no nivel do logradouro.';
COMMENT ON COLUMN public.dem_bairro_geo.bairro_norm IS
  'Chave: f_unaccent(lower(trim(bairro))). Une "Barra da Tijuca", "barra da tijuca" e "Barra Da Tijuca " numa linha so.';
COMMENT ON COLUMN public.dem_bairro_geo.alias_de IS
  'bairro_norm CANONICO deste apelido. "Barra" e "Barra Olimpica" apontam para "barra da tijuca" — sem isso o mesmo lugar vira tres circulos medios no mapa em vez de um grande.';
COMMENT ON COLUMN public.dem_bairro_geo.ignorar IS
  'true = o texto nao e bairro (ex.: "Rio de Janeiro" digitado no campo bairro). Sai do mapa e dos cortes em vez de ganhar um centro inventado.';
COMMENT ON COLUMN public.dem_bairro_geo.tentativas IS
  'Quantas vezes o lote ja tentou geocodificar. Evita loop eterno num bairro que o Nominatim nao resolve.';

ALTER TABLE public.dem_bairro_geo ENABLE ROW LEVEL SECURITY;

-- Leitura: quem enxerga a Membresia (nível 1). Escrita passa pelo backend em
-- service_role, que aplica o gate de nível 3 no endpoint do lote.
DROP POLICY IF EXISTS dem_bairro_geo_select ON public.dem_bairro_geo;
CREATE POLICY dem_bairro_geo_select ON public.dem_bairro_geo
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('membresia') >= 1);

REVOKE ALL ON public.dem_bairro_geo FROM anon;

-- ---------------------------------------------------------------------------
-- 2 · `vw_dem_pessoa` · uma linha por pessoa viva, com o que dá para dizer dela
--
-- ⚠️ NÃO é fonte de PII para tela nenhuma: não traz nome, CPF, telefone nem
-- e-mail de propósito. Serve só de insumo para `fn_dem_perfil`, que agrega.
-- Quem precisa de pessoa nominal usa `/membresia/membros`, que tem o guard de
-- nível 2 e a régua de `dadosSensiveisPessoa`.
-- ---------------------------------------------------------------------------
-- DROP e não CREATE OR REPLACE: a view ganhou colunas NO MEIO (bairro_digitado,
-- bairro_norm_raw) e o REPLACE do Postgres só aceita coluna acrescentada no fim.
-- Sem CASCADE de propósito — se algum dia alguém pendurar uma view em cima
-- desta, é melhor a migration falhar do que derrubar a dependência em silêncio.
DROP VIEW IF EXISTS public.vw_dem_pessoa;

CREATE VIEW public.vw_dem_pessoa AS
WITH fontes AS (
  -- Portas que já coletam dado demográfico e apontam para o membro.
  SELECT
    b.membro_id,
    b.created_at AS quando,
    -- Legado 'M'/'F' normalizado na LEITURA (ver decisão 6 no cabeçalho).
    CASE lower(trim(coalesce(b.sexo, '')))
      WHEN 'm' THEN 'masculino' WHEN 'f' THEN 'feminino'
      WHEN 'masculino' THEN 'masculino' WHEN 'feminino' THEN 'feminino'
      ELSE NULL
    END                                                             AS genero,
    b.data_nascimento,
    nullif(regexp_replace(coalesce(b.cep, ''), '\D', '', 'g'), '')  AS cep,
    nullif(trim(b.endereco), '')                                    AS endereco,
    NULL::text                                                      AS bairro,
    NULL::text                                                      AS estado_civil
  FROM public.batismo_inscricoes b
  WHERE b.membro_id IS NOT NULL AND b.deleted_at IS NULL

  UNION ALL

  SELECT
    i.membro_id, i.created_at,
    nullif(lower(trim(i.sexo)), ''),
    i.data_nascimento,
    nullif(regexp_replace(coalesce(i.cep, ''), '\D', '', 'g'), ''),
    nullif(trim(i.endereco), ''),
    NULL, NULL
  FROM public.inscricoes i
  WHERE i.membro_id IS NOT NULL AND i.deleted_at IS NULL

  UNION ALL

  SELECT
    c.membro_id, c.created_at,
    nullif(lower(trim(c.genero)), ''),
    c.data_nascimento,
    nullif(regexp_replace(coalesce(c.cep, ''), '\D', '', 'g'), ''),
    nullif(trim(c.endereco), ''),
    nullif(trim(c.bairro), ''),
    nullif(lower(trim(c.estado_civil)), '')
  FROM public.mem_cadastros_pendentes c
  WHERE c.membro_id IS NOT NULL
),
enr AS (
  -- Vale a declaração MAIS RECENTE de cada campo, independente da porta: quem
  -- se inscreveu ontem informou o endereço de ontem.
  SELECT
    membro_id,
    (array_agg(genero          ORDER BY quando DESC NULLS LAST) FILTER (WHERE genero          IS NOT NULL))[1] AS genero,
    (array_agg(data_nascimento ORDER BY quando DESC NULLS LAST) FILTER (WHERE data_nascimento IS NOT NULL))[1] AS data_nascimento,
    (array_agg(cep             ORDER BY quando DESC NULLS LAST) FILTER (WHERE cep             IS NOT NULL))[1] AS cep,
    (array_agg(endereco        ORDER BY quando DESC NULLS LAST) FILTER (WHERE endereco        IS NOT NULL))[1] AS endereco,
    (array_agg(bairro          ORDER BY quando DESC NULLS LAST) FILTER (WHERE bairro          IS NOT NULL))[1] AS bairro,
    (array_agg(estado_civil    ORDER BY quando DESC NULLS LAST) FILTER (WHERE estado_civil    IS NOT NULL))[1] AS estado_civil
  FROM fontes
  GROUP BY membro_id
),
p AS (
  SELECT
    m.id,
    m.status,
    m.origem_cadastro,
    m.data_membresia,
    -- Cadastro primeiro; o que faltar, o que a pessoa declarou numa porta.
    coalesce(nullif(lower(trim(m.genero)), ''),        e.genero)          AS genero,
    coalesce(m.data_nascimento,                        e.data_nascimento) AS data_nascimento,
    coalesce(nullif(lower(trim(m.estado_civil)), ''),  e.estado_civil)    AS estado_civil,
    nullif(lower(trim(m.escolaridade)), '')                               AS escolaridade,
    nullif(trim(m.profissao), '')                                         AS profissao,
    coalesce(nullif(regexp_replace(coalesce(m.cep, ''), '\D', '', 'g'), ''), e.cep) AS cep,
    coalesce(nullif(trim(m.bairro), ''),   e.bairro)                      AS bairro,
    coalesce(nullif(trim(m.endereco), ''), e.endereco)                    AS endereco,
    m.lat, m.lng
  FROM public.mem_membros m
  LEFT JOIN enr e ON e.membro_id = m.id
  WHERE m.active IS TRUE AND m.deleted_at IS NULL
),
b AS (
  SELECT p.*, nullif(public.f_unaccent(lower(trim(coalesce(p.bairro, '')))), '') AS bairro_norm_raw
  FROM p
)
SELECT
  b.id,
  b.status,
  b.origem_cadastro,
  b.genero,
  b.data_nascimento,
  -- A régua da igreja, sem cópia: chama a função (LEI de 19/08).
  public.fn_faixa_etaria(b.data_nascimento) AS faixa_etaria,
  -- Idade só quando a régua aceitou a data — data absurda não vira idade.
  CASE
    WHEN public.fn_faixa_etaria(b.data_nascimento) IS NULL THEN NULL
    ELSE date_part('year', age(b.data_nascimento))::int
  END AS idade,
  -- Histograma de leitura ANINHADO na régua (ver decisão 1 no cabeçalho).
  CASE
    WHEN public.fn_faixa_etaria(b.data_nascimento) IS NULL THEN NULL
    WHEN date_part('year', age(b.data_nascimento)) < 13 THEN '0-12'
    WHEN date_part('year', age(b.data_nascimento)) <= 17 THEN '13-17'
    WHEN date_part('year', age(b.data_nascimento)) <= 25 THEN '18-25'
    WHEN date_part('year', age(b.data_nascimento)) <= 35 THEN '26-35'
    WHEN date_part('year', age(b.data_nascimento)) <= 45 THEN '36-45'
    WHEN date_part('year', age(b.data_nascimento)) <= 55 THEN '46-55'
    WHEN date_part('year', age(b.data_nascimento)) <= 65 THEN '56-65'
    ELSE '66+'
  END AS faixa_detalhada,
  b.estado_civil,
  b.escolaridade,
  b.profissao,
  b.cep,
  -- Prefixo de 5 dígitos: no Rio ele já separa região. Guardado para o dia em
  -- que o volume justificar um mapa mais fino que bairro.
  CASE WHEN length(coalesce(b.cep, '')) = 8 THEN left(b.cep, 5) END AS cep_regiao,
  b.bairro                AS bairro_digitado,
  b.bairro_norm_raw,
  -- Bairro CANÔNICO: apelido resolvido, lixo virado NULL (decisão 4).
  CASE WHEN coalesce(g.ignorar, false) THEN NULL
       ELSE coalesce(g.alias_de, b.bairro_norm_raw) END AS bairro_norm,
  CASE WHEN coalesce(g.ignorar, false) THEN NULL
       ELSE coalesce(ga.bairro, g.bairro, b.bairro) END AS bairro,
  b.endereco,
  b.lat, b.lng,
  b.data_membresia,
  -- Tempo de casa em anos completos, só para quem tem data de membresia.
  -- ⚠️ Hoje ninguém tem: `data_membresia` está 0/3.926 (ver cabeçalho).
  CASE
    WHEN b.data_membresia IS NULL OR b.data_membresia > current_date THEN NULL
    ELSE date_part('year', age(b.data_membresia))::int
  END AS anos_de_casa,
  -- Engajamento: régua ÚNICA, a mesma do /admin/cruzamentos. NÃO derivar aqui
  -- (ver o bloco das três colunas mortas no cabeçalho).
  coalesce(pp.is_batizado,     false) AS batizado,
  coalesce(pp.is_voluntario,   false) AS voluntario,
  coalesce(pp.in_grupo_ativo,  false) AS em_grupo,
  coalesce(pp.fez_next,        false) AS fez_next,
  coalesce(pp.is_convertido,   false) AS convertido,
  coalesce(pp.is_contribuinte, false) AS contribuinte,
  coalesce(pp.valor_seguir,       false) AS valor_seguir,
  coalesce(pp.valor_conectar,     false) AS valor_conectar,
  coalesce(pp.valor_investir,     false) AS valor_investir,
  coalesce(pp.valor_servir,       false) AS valor_servir,
  coalesce(pp.valor_generosidade, false) AS valor_generosidade,
  pp.atualizado_em AS papeis_atualizado_em
FROM b
LEFT JOIN public.dem_bairro_geo g  ON g.bairro_norm = b.bairro_norm_raw
LEFT JOIN public.dem_bairro_geo ga ON ga.bairro_norm = g.alias_de
LEFT JOIN public.vw_pessoas_papeis_mat pp ON pp.membresia_id = b.id;

COMMENT ON VIEW public.vw_dem_pessoa IS
  'Uma linha por pessoa VIVA (active, sem deleted_at) com o retrato demografico ja enriquecido pelas portas (batismo/inscricoes/cadastros pendentes) e o engajamento vindo de vw_pessoas_papeis_mat (regua unica do /admin/cruzamentos, materializada, refresca no cron das 05:00). Insumo de fn_dem_perfil. NAO traz nome/CPF/telefone/email de proposito — perfil e agregado, pessoa nominal sai por /membresia/membros com guard de nivel 2.';

-- A view nasce sem porta pública: quem lê é o backend em service_role.
REVOKE ALL ON public.vw_dem_pessoa FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · `fn_dem_semear_bairros` · registra bairro novo que apareceu na base
--
-- Chamada pelo lote de geocodificação antes de geocodificar: cadastro novo com
-- bairro inédito precisa existir aqui para poder ganhar coordenada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dem_semear_bairros()
RETURNS integer
LANGUAGE sql
VOLATILE
SET search_path TO 'public', 'extensions'
AS $function$
  WITH novos AS (
    INSERT INTO public.dem_bairro_geo (bairro_norm, bairro, cidade, uf)
    SELECT DISTINCT ON (bairro_norm_raw)
           bairro_norm_raw, bairro_digitado, 'Rio de Janeiro', 'RJ'
      FROM public.vw_dem_pessoa
     WHERE bairro_norm_raw IS NOT NULL
     ORDER BY bairro_norm_raw, bairro_digitado
    ON CONFLICT (bairro_norm) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int FROM novos;
$function$;

COMMENT ON FUNCTION public.fn_dem_semear_bairros() IS
  'Registra em dem_bairro_geo os bairros que apareceram na base e ainda nao tem linha. Devolve quantos entraram. Chamada pelo lote de geocodificacao antes de geocodificar.';

REVOKE ALL ON FUNCTION public.fn_dem_semear_bairros() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · `fn_dem_perfil` · o retrato inteiro numa ida ao banco
--
-- Agregar no Postgres e não no Node é decisão de CORREÇÃO, não de performance:
-- o PostgREST corta em 1.000 linhas por padrão, e uma base de 3.926 pessoas
-- lida "crua" viria truncada — a tela mostraria o perfil de 1/4 da igreja com
-- cara de perfil da igreja inteira.
--
-- Todo corte devolve `base` (quantos responderam aquele campo) além de `total`
-- (quantos existem no recorte). Quem calcula percentual usa `base`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_dem_perfil(
  p_status text DEFAULT NULL,   -- NULL/'' = base inteira · 'membro_ativo', 'visitante', ...
  p_bairro text DEFAULT NULL    -- bairro_norm canônico, para recortar num bairro só
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
WITH base AS (
  SELECT * FROM public.vw_dem_pessoa
   WHERE (p_status IS NULL OR p_status = '' OR status = p_status)
     AND (p_bairro IS NULL OR p_bairro = '' OR bairro_norm = p_bairro)
),
tot AS (SELECT count(*)::int AS n FROM base),
corte_faixa AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY ord) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (
    SELECT faixa_etaria AS valor, count(*)::int AS n,
           array_position(ARRAY['crianca','adolescente','jovem','adulto'], faixa_etaria) AS ord
      FROM base WHERE faixa_etaria IS NOT NULL GROUP BY 1
  ) s
),
corte_faixa_det AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY ord) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (
    SELECT faixa_detalhada AS valor, count(*)::int AS n,
           array_position(ARRAY['0-12','13-17','18-25','26-35','36-45','46-55','56-65','66+'], faixa_detalhada) AS ord
      FROM base WHERE faixa_detalhada IS NOT NULL GROUP BY 1
  ) s
),
corte_genero AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY n DESC) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (SELECT genero AS valor, count(*)::int AS n FROM base WHERE genero IS NOT NULL GROUP BY 1) s
),
corte_ec AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY n DESC) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (SELECT estado_civil AS valor, count(*)::int AS n FROM base WHERE estado_civil IS NOT NULL GROUP BY 1) s
),
corte_escol AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY n DESC) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (SELECT escolaridade AS valor, count(*)::int AS n FROM base WHERE escolaridade IS NOT NULL GROUP BY 1) s
),
corte_status AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY n DESC) AS j
  FROM (SELECT coalesce(status, '(sem status)') AS valor, count(*)::int AS n FROM base GROUP BY 1) s
),
corte_origem AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY n DESC) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (SELECT origem_cadastro AS valor, count(*)::int AS n FROM base WHERE origem_cadastro IS NOT NULL GROUP BY 1) s
),
corte_bairro AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'norm', norm, 'total', n) ORDER BY n DESC) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (
    SELECT min(bairro) AS valor, bairro_norm AS norm, count(*)::int AS n
      FROM base WHERE bairro_norm IS NOT NULL GROUP BY bairro_norm
  ) s
),
corte_casa AS (
  SELECT jsonb_agg(jsonb_build_object('valor', valor, 'total', n) ORDER BY ord) AS j,
         coalesce(sum(n), 0)::int AS base
  FROM (
    SELECT
      CASE WHEN anos_de_casa < 1 THEN 'menos de 1 ano'
           WHEN anos_de_casa <= 2 THEN '1 a 2 anos'
           WHEN anos_de_casa <= 5 THEN '3 a 5 anos'
           WHEN anos_de_casa <= 10 THEN '6 a 10 anos'
           ELSE 'mais de 10 anos' END AS valor,
      CASE WHEN anos_de_casa < 1 THEN 1
           WHEN anos_de_casa <= 2 THEN 2
           WHEN anos_de_casa <= 5 THEN 3
           WHEN anos_de_casa <= 10 THEN 4
           ELSE 5 END AS ord,
      count(*)::int AS n
      FROM base WHERE anos_de_casa IS NOT NULL GROUP BY 1, 2
  ) s
),
-- Pirâmide etária: gênero DENTRO de cada faixa. Só entra quem tem os DOIS
-- campos — é o corte com a menor cobertura da tela, e o front avisa isso.
piramide AS (
  SELECT jsonb_agg(jsonb_build_object(
           'faixa', faixa, 'masculino', masc, 'feminino', fem, 'total', masc + fem
         ) ORDER BY ord) AS j,
         coalesce(sum(masc + fem), 0)::int AS base
  FROM (
    SELECT faixa_detalhada AS faixa,
           array_position(ARRAY['0-12','13-17','18-25','26-35','36-45','46-55','56-65','66+'], faixa_detalhada) AS ord,
           count(*) FILTER (WHERE genero = 'masculino')::int AS masc,
           count(*) FILTER (WHERE genero = 'feminino')::int  AS fem
      FROM base
     WHERE faixa_detalhada IS NOT NULL AND genero IN ('masculino', 'feminino')
     GROUP BY 1, 2
  ) s
),
engajamento AS (
  SELECT jsonb_build_object(
    'total',        (SELECT n FROM tot),
    'atualizado_em', max(papeis_atualizado_em),
    'em_grupo',     count(*) FILTER (WHERE em_grupo)::int,
    'voluntario',   count(*) FILTER (WHERE voluntario)::int,
    'batizado',     count(*) FILTER (WHERE batizado)::int,
    'fez_next',     count(*) FILTER (WHERE fez_next)::int,
    'convertido',   count(*) FILTER (WHERE convertido)::int,
    'contribuinte', count(*) FILTER (WHERE contribuinte)::int,
    'valores', jsonb_build_object(
      'seguir',       count(*) FILTER (WHERE valor_seguir)::int,
      'conectar',     count(*) FILTER (WHERE valor_conectar)::int,
      'investir',     count(*) FILTER (WHERE valor_investir)::int,
      'servir',       count(*) FILTER (WHERE valor_servir)::int,
      'generosidade', count(*) FILTER (WHERE valor_generosidade)::int
    )
  ) AS j
  FROM base
),
cobertura AS (
  SELECT jsonb_build_object(
    'total',           (SELECT n FROM tot),
    'genero',          count(*) FILTER (WHERE genero IS NOT NULL)::int,
    'nascimento',      count(*) FILTER (WHERE data_nascimento IS NOT NULL)::int,
    'faixa_etaria',    count(*) FILTER (WHERE faixa_etaria IS NOT NULL)::int,
    'estado_civil',    count(*) FILTER (WHERE estado_civil IS NOT NULL)::int,
    'escolaridade',    count(*) FILTER (WHERE escolaridade IS NOT NULL)::int,
    'profissao',       count(*) FILTER (WHERE profissao IS NOT NULL)::int,
    'cep',             count(*) FILTER (WHERE cep IS NOT NULL)::int,
    'bairro',          count(*) FILTER (WHERE bairro_norm IS NOT NULL)::int,
    'endereco',        count(*) FILTER (WHERE endereco IS NOT NULL)::int,
    'data_membresia',  count(*) FILTER (WHERE data_membresia IS NOT NULL)::int
  ) AS j
  FROM base
),
-- Mapa: bairro com gente + centróide já resolvido. Bairro sem centróide sai da
-- lista `bairros` (não dá para desenhar) mas continua no corte `bairro`, e
-- `pessoas_fora_do_mapa` diz quantas pessoas o mapa está deixando de fora —
-- mapa que esconde o próprio buraco é pior que mapa vazio.
mapa AS (
  SELECT
    jsonb_agg(jsonb_build_object(
      'bairro', valor, 'norm', norm, 'total', n, 'lat', lat, 'lng', lng
    ) ORDER BY n DESC) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) AS j,
    coalesce(sum(n) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL), 0)::int AS pessoas_no_mapa,
    coalesce(sum(n) FILTER (WHERE lat IS NULL OR lng IS NULL), 0)::int          AS pessoas_fora_do_mapa,
    count(*) FILTER (WHERE lat IS NULL OR lng IS NULL)::int                     AS bairros_sem_coordenada
  FROM (
    SELECT min(b.bairro) AS valor, b.bairro_norm AS norm, count(*)::int AS n,
           max(g.lat) AS lat, max(g.lng) AS lng
      FROM base b
      LEFT JOIN public.dem_bairro_geo g ON g.bairro_norm = b.bairro_norm
     WHERE b.bairro_norm IS NOT NULL
     GROUP BY b.bairro_norm
  ) s
)
SELECT jsonb_build_object(
  'total',      (SELECT n FROM tot),
  'filtros',    jsonb_build_object('status', p_status, 'bairro', p_bairro),
  'cobertura',  (SELECT j FROM cobertura),
  'cortes', jsonb_build_object(
    'faixa_etaria',    jsonb_build_object('base', (SELECT base FROM corte_faixa),     'valores', coalesce((SELECT j FROM corte_faixa), '[]'::jsonb)),
    'faixa_detalhada', jsonb_build_object('base', (SELECT base FROM corte_faixa_det), 'valores', coalesce((SELECT j FROM corte_faixa_det), '[]'::jsonb)),
    'genero',          jsonb_build_object('base', (SELECT base FROM corte_genero),    'valores', coalesce((SELECT j FROM corte_genero), '[]'::jsonb)),
    'estado_civil',    jsonb_build_object('base', (SELECT base FROM corte_ec),        'valores', coalesce((SELECT j FROM corte_ec), '[]'::jsonb)),
    'escolaridade',    jsonb_build_object('base', (SELECT base FROM corte_escol),     'valores', coalesce((SELECT j FROM corte_escol), '[]'::jsonb)),
    'origem_cadastro', jsonb_build_object('base', (SELECT base FROM corte_origem),    'valores', coalesce((SELECT j FROM corte_origem), '[]'::jsonb)),
    'bairro',          jsonb_build_object('base', (SELECT base FROM corte_bairro),    'valores', coalesce((SELECT j FROM corte_bairro), '[]'::jsonb)),
    'tempo_de_casa',   jsonb_build_object('base', (SELECT base FROM corte_casa),      'valores', coalesce((SELECT j FROM corte_casa), '[]'::jsonb)),
    'status',          jsonb_build_object('base', (SELECT n FROM tot),                'valores', coalesce((SELECT j FROM corte_status), '[]'::jsonb))
  ),
  'piramide',    jsonb_build_object('base', (SELECT base FROM piramide), 'valores', coalesce((SELECT j FROM piramide), '[]'::jsonb)),
  'engajamento', (SELECT j FROM engajamento),
  'mapa', jsonb_build_object(
    'bairros',                coalesce((SELECT j FROM mapa), '[]'::jsonb),
    'pessoas_no_mapa',        (SELECT pessoas_no_mapa FROM mapa),
    'pessoas_fora_do_mapa',   (SELECT pessoas_fora_do_mapa FROM mapa),
    'bairros_sem_coordenada', (SELECT bairros_sem_coordenada FROM mapa)
  )
)
$function$;

COMMENT ON FUNCTION public.fn_dem_perfil(text, text) IS
  'Retrato demografico agregado da membresia numa ida ao banco. Todo corte devolve base (quantos responderam) alem de total (quantos existem) — percentual se calcula sobre a base, nunca sobre o total. Agrega no Postgres porque o PostgREST corta em 1000 linhas e a base ja passou disso. Engajamento vem de vw_pessoas_papeis_mat (materializada, ate 24h de atraso — o campo atualizado_em vai no JSON).';

-- Backend chama em service_role. Sem porta para anon/authenticated (mesma
-- limpeza das 114 funcoes SECURITY DEFINER de agosto).
REVOKE ALL ON FUNCTION public.fn_dem_perfil(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · Semeia os bairros que já existem e resolve os apelidos conhecidos
--
-- Os apelidos abaixo NÃO são chute de mapa: são os casos medidos na base em
-- 23/08 (ver decisão 4). Bairro novo que aparecer depois entra sem apelido — se
-- for mais um nome do mesmo lugar, alguém acrescenta a linha aqui.
-- ---------------------------------------------------------------------------
SELECT public.fn_dem_semear_bairros();

-- Rotulo canonico da Barra: o alias foi semeado a partir do texto normalizado
-- (minusculo, sem acento), entao o mapa exibiria "barra da tijuca". O geocode
-- canonicaliza o resto a partir do nome que o ViaCEP/Nominatim devolve; este
-- e o unico que ja nasce consolidado e precisa do rotulo escrito a mao.
UPDATE public.dem_bairro_geo
   SET bairro = 'Barra da Tijuca'
 WHERE bairro_norm = 'barra da tijuca'
   AND bairro IS DISTINCT FROM 'Barra da Tijuca';

UPDATE public.dem_bairro_geo SET alias_de = 'barra da tijuca',
       nota = 'Sub-regiao da Barra da Tijuca · apelido medido em 23/08/2026'
 WHERE bairro_norm IN ('barra', 'barra olimpica', 'barra da tijuca - rio de janeiro')
   AND bairro_norm <> 'barra da tijuca' AND alias_de IS DISTINCT FROM 'barra da tijuca';

UPDATE public.dem_bairro_geo SET alias_de = 'recreio dos bandeirantes',
       nota = 'Mesmo bairro escrito curto · apelido medido em 23/08/2026'
 WHERE bairro_norm IN ('recreio') AND alias_de IS DISTINCT FROM 'recreio dos bandeirantes';

UPDATE public.dem_bairro_geo SET alias_de = 'freguesia (jacarepagua)',
       nota = 'Mesmo bairro escrito sem a regiao · apelido medido em 23/08/2026'
 WHERE bairro_norm IN ('freguesia') AND alias_de IS DISTINCT FROM 'freguesia (jacarepagua)';

-- "Rio de Janeiro" no campo bairro é a CIDADE digitada no lugar errado.
UPDATE public.dem_bairro_geo SET ignorar = true,
       nota = 'E a cidade digitada no campo bairro, nao um bairro'
 WHERE bairro_norm IN ('rio de janeiro', 'rj', 'brasil') AND ignorar IS NOT TRUE;

-- ---------------------------------------------------------------------------
-- Conferência · aborta se o contrato desta migration não valer
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v jsonb;
  v_faixa_soma int;
  v_det_soma   int;
  v_barra      int;
BEGIN
  v := public.fn_dem_perfil(NULL, NULL);

  IF (v->>'total')::int IS NULL OR (v->>'total')::int <= 0 THEN
    RAISE EXCEPTION 'fn_dem_perfil devolveu base vazia — a view nao esta enxergando a membresia';
  END IF;

  -- O histograma detalhado tem de FECHAR com a régua da igreja: se somar
  -- diferente, alguém abriu uma segunda régua sem perceber.
  SELECT coalesce(sum((x->>'total')::int), 0) INTO v_faixa_soma
    FROM jsonb_array_elements(v->'cortes'->'faixa_etaria'->'valores') x;
  SELECT coalesce(sum((x->>'total')::int), 0) INTO v_det_soma
    FROM jsonb_array_elements(v->'cortes'->'faixa_detalhada'->'valores') x;
  IF v_faixa_soma <> v_det_soma THEN
    RAISE EXCEPTION 'faixa_detalhada (%) nao fecha com fn_faixa_etaria (%) — viraram duas reguas', v_det_soma, v_faixa_soma;
  END IF;

  -- Cobertura nunca passa do total: seria enriquecimento duplicando pessoa.
  IF (v->'cobertura'->>'genero')::int > (v->>'total')::int
     OR (v->'cobertura'->>'bairro')::int > (v->>'total')::int THEN
    RAISE EXCEPTION 'cobertura maior que o total — o enriquecimento esta multiplicando linha';
  END IF;

  -- Os apelidos precisam ter COLAPSADO a Barra numa linha só. Se voltarem a
  -- aparecer três, o join de alias parou de funcionar.
  SELECT count(*) INTO v_barra
    FROM jsonb_array_elements(v->'cortes'->'bairro'->'valores') x
   WHERE x->>'norm' IN ('barra', 'barra olimpica');
  IF v_barra > 0 THEN
    RAISE EXCEPTION 'apelido de bairro nao aplicou — "Barra"/"Barra Olimpica" ainda saem separados da Barra da Tijuca';
  END IF;

  -- Engajamento não pode vir zerado: seria o retorno das colunas mortas.
  IF (v->'engajamento'->>'batizado')::int <= 0 THEN
    RAISE EXCEPTION 'engajamento.batizado = 0 — voltou a ler mem_membros.batizado (coluna morta) em vez de vw_pessoas_papeis_mat';
  END IF;

  RAISE NOTICE 'fn_dem_perfil: % pessoas · % com faixa etaria · % com bairro · % batizados',
    (v->>'total')::int, v_faixa_soma, (v->'cobertura'->>'bairro')::int, (v->'engajamento'->>'batizado')::int;
END $$;

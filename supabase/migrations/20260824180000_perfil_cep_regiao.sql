-- Perfil da Membresia · mapa por TRECHO DE CEP (2026-08-24)
--
-- O mapa só sabia agregar por bairro, e bairro no Rio é grosso: "Barra da
-- Tijuca" é uma faixa de 10 km. O trecho de CEP (os 5 primeiros dígitos) é a
-- unidade postal logo abaixo do bairro — algumas dezenas de ruas — e é o corte
-- que o Matheus pediu para "ficar mais específico ainda".
--
-- ⚠️⚠️ POR QUE 5 DÍGITOS E NÃO O CEP INTEIRO. CEP completo é RUA. Com a base
-- de hoje (197 pessoas com CEP em 114 CEPs distintos) quase todo ponto teria
-- uma pessoa só, e um ponto de uma pessoa no mapa É o endereço dela — o que
-- contradiz o contrato escrito da aba ("nenhuma destas rotas devolve endereço
-- de pessoa") e vale para nível 1, ou seja, todo mundo que enxerga Membresia.
-- Trecho de 5 dígitos + piso de 3 pessoas por ponto resolve os dois lados:
-- mais específico que bairro, e nunca aponta a rua de um indivíduo.
--
-- ⚠️ O CACHE é por CEP COMPLETO mesmo assim, porque é o que o ViaCEP e o
-- Nominatim sabem responder — a agregação por trecho acontece na leitura.
-- `dem_cep_geo` é dado de REFERÊNCIA sobre código postal (público), não sobre
-- pessoa: não tem membro_id, não tem nome, e a coluna que a liga a alguém
-- (`cep`) já está em `mem_membros.cep`.

CREATE TABLE IF NOT EXISTS public.dem_cep_geo (
  cep                 text PRIMARY KEY CHECK (cep ~ '^[0-9]{8}$'),
  logradouro          text,
  bairro              text,
  cidade              text,
  uf                  text,
  lat                 numeric,
  lng                 numeric,
  fonte               text,
  geocodificado_em    timestamptz,
  tentativas          integer     NOT NULL DEFAULT 0,
  ultima_tentativa_em timestamptz,
  ignorar             boolean     NOT NULL DEFAULT false,
  nota                text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- A fila do lote lê "sem coordenada, menos tentativas primeiro".
CREATE INDEX IF NOT EXISTS dem_cep_geo_fila_idx
  ON public.dem_cep_geo (tentativas, cep) WHERE lat IS NULL AND ignorar = false;
-- A leitura do mapa agrupa por trecho.
CREATE INDEX IF NOT EXISTS dem_cep_geo_trecho_idx ON public.dem_cep_geo (left(cep, 5));

ALTER TABLE public.dem_cep_geo ENABLE ROW LEVEL SECURITY;

-- Espelha `dem_bairro_geo_select`: leitura para quem tem Membresia nível 1.
-- Escrita é só do backend (service_role, que ignora RLS) — a rota que grava é
-- nível 3, porque coordenada errada desloca o ponto de dezenas de pessoas.
DROP POLICY IF EXISTS dem_cep_geo_select ON public.dem_cep_geo;
CREATE POLICY dem_cep_geo_select ON public.dem_cep_geo
  FOR SELECT TO authenticated
  USING (current_user_module_level('membresia') >= 1);

-- Semeia a fila com os CEPs que a base já tem. Idempotente: cadastro novo traz
-- CEP inédito e a próxima rodada do lote o encontra.
CREATE OR REPLACE FUNCTION public.fn_dem_semear_ceps()
RETURNS integer
LANGUAGE sql
SET search_path TO 'public', 'extensions'
AS $function$
  WITH novos AS (
    INSERT INTO public.dem_cep_geo (cep)
    SELECT DISTINCT cep
      FROM public.vw_dem_pessoa
     WHERE cep IS NOT NULL AND cep ~ '^[0-9]{8}$'
    ON CONFLICT (cep) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int FROM novos;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- fn_dem_perfil ganha o corte por trecho de CEP.
--
-- ⚠️ DROP + CREATE, não CREATE OR REPLACE: parâmetro novo muda a assinatura, e
-- as duas versões convivendo deixariam a chamada de 2 argumentos AMBÍGUA (erro
-- em runtime, mapa em branco). Chamada antiga por argumento nomeado continua
-- funcionando contra a versão de 3 parâmetros porque o novo tem DEFAULT.
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.fn_dem_perfil(text, text);
DROP FUNCTION IF EXISTS public.fn_dem_perfil(text, text, text);

CREATE FUNCTION public.fn_dem_perfil(
  p_status      text DEFAULT NULL,
  p_bairro      text DEFAULT NULL,
  p_cep_regiao  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
-- ⚠️⚠️ PISO DE 3 PESSOAS POR PONTO. Vale para desenhar E para filtrar. Sem ele,
-- clicar num trecho de 1 pessoa mostraria o perfil completo dessa pessoa
-- (gênero, idade, estado civil, escolaridade, profissão) numa tela que promete
-- ser agregada. Trecho abaixo do piso não vira ponto e não vira filtro — a
-- função IGNORA o filtro e devolve `cep_regiao_bloqueado`, para a tela dizer o
-- que aconteceu em vez de mostrar um recorte errado em silêncio.
WITH ce_n AS (
  SELECT CASE WHEN nullif(p_cep_regiao, '') IS NULL THEN NULL
              ELSE (SELECT count(*)::int FROM public.vw_dem_pessoa v
                     WHERE (nullif(p_status, '') IS NULL OR v.status = p_status)
                       AND v.cep_regiao = nullif(p_cep_regiao, ''))
         END AS n
),
par AS (
  SELECT CASE WHEN (SELECT n FROM ce_n) >= 3 THEN nullif(p_cep_regiao, '') END AS ce,
         coalesce((SELECT n FROM ce_n) < 3, false) AS ce_bloqueado
),
base AS (
  SELECT * FROM public.vw_dem_pessoa
   WHERE (p_status IS NULL OR p_status = '' OR status = p_status)
     AND (p_bairro IS NULL OR p_bairro = '' OR bairro_norm = p_bairro)
     AND ((SELECT ce FROM par) IS NULL OR cep_regiao = (SELECT ce FROM par))
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
    'cep_regiao',      count(*) FILTER (WHERE cep_regiao IS NOT NULL)::int,
    'bairro',          count(*) FILTER (WHERE bairro_norm IS NOT NULL)::int,
    'endereco',        count(*) FILTER (WHERE endereco IS NOT NULL)::int,
    'data_membresia',  count(*) FILTER (WHERE data_membresia IS NOT NULL)::int
  ) AS j
  FROM base
),
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
),
-- ⚠️ A coordenada do trecho é a MÉDIA SOBRE PESSOAS, não sobre CEPs: `avg`
-- roda no join com `base`, então rua onde moram 8 pessoas pesa 8 vezes mais
-- que rua onde mora 1. O ponto cai onde a gente está, não no meio geométrico
-- da faixa postal. `avg` ignora NULL, então CEP ainda não geocodificado não
-- puxa o ponto para lugar nenhum — só não contribui.
cep_bruto AS (
  SELECT b.cep_regiao AS regiao,
         count(*)::int AS n,
         avg(g.lat) AS lat,
         avg(g.lng) AS lng,
         count(g.lat)::int AS pessoas_com_coordenada,
         mode() WITHIN GROUP (ORDER BY g.bairro) AS bairro
    FROM base b
    LEFT JOIN public.dem_cep_geo g
           ON g.cep = b.cep AND g.ignorar = false
   WHERE b.cep_regiao IS NOT NULL
   GROUP BY b.cep_regiao
),
mapa_cep AS (
  SELECT
    jsonb_agg(jsonb_build_object(
      'regiao', regiao, 'bairro', bairro, 'total', n, 'lat', lat, 'lng', lng
    ) ORDER BY n DESC) FILTER (WHERE lat IS NOT NULL AND n >= 3) AS j,
    coalesce(sum(n) FILTER (WHERE lat IS NOT NULL AND n >= 3), 0)::int AS pessoas_no_mapa,
    coalesce(sum(n) FILTER (WHERE lat IS NOT NULL AND n < 3), 0)::int  AS pessoas_sem_massa,
    coalesce(sum(n) FILTER (WHERE lat IS NULL), 0)::int                AS pessoas_fora_do_mapa,
    count(*) FILTER (WHERE lat IS NULL)::int                            AS trechos_sem_coordenada,
    count(*) FILTER (WHERE lat IS NOT NULL AND n < 3)::int              AS trechos_sem_massa,
    count(*)::int                                                       AS trechos
  FROM cep_bruto
)
SELECT jsonb_build_object(
  'total',      (SELECT n FROM tot),
  'filtros',    jsonb_build_object(
    'status', p_status,
    'bairro', p_bairro,
    'cep_regiao', (SELECT ce FROM par),
    'cep_regiao_bloqueado', (SELECT ce_bloqueado FROM par)
  ),
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
  ),
  'mapa_cep', jsonb_build_object(
    'minimo',                  3,
    'trechos',                 coalesce((SELECT j FROM mapa_cep), '[]'::jsonb),
    'trechos_conhecidos',      coalesce((SELECT trechos FROM mapa_cep), 0),
    'pessoas_no_mapa',         coalesce((SELECT pessoas_no_mapa FROM mapa_cep), 0),
    'pessoas_sem_massa',       coalesce((SELECT pessoas_sem_massa FROM mapa_cep), 0),
    'pessoas_fora_do_mapa',    coalesce((SELECT pessoas_fora_do_mapa FROM mapa_cep), 0),
    'trechos_sem_coordenada',  coalesce((SELECT trechos_sem_coordenada FROM mapa_cep), 0),
    'trechos_sem_massa',       coalesce((SELECT trechos_sem_massa FROM mapa_cep), 0)
  )
)
$function$;

-- ⚠️⚠️ DROP FUNCTION LEVA OS GRANTS EMBORA. Os grants da versão antiga eram
-- `postgres` e `service_role` — e SÓ eles: `authenticated` foi revogado na
-- faxina de segurança do Supabase de propósito, porque `/membresia/perfil` roda
-- no Express com service_role e nunca é chamada com a chave pública. Regravar
-- `authenticated` aqui reabriria à mão o que aquela faxina fechou.
GRANT EXECUTE ON FUNCTION public.fn_dem_perfil(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_dem_semear_ceps() TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_dem_perfil(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_dem_semear_ceps() FROM anon, authenticated;

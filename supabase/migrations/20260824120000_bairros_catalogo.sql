-- Bairro validado nos formulários · catálogo único + gravação canônica
-- ============================================================================
-- Pedido do Matheus (24/08/2026): "nos formularios, o bairro da pessoa deve
-- aparecer automaticamente quando ela colocar o cep, deve existir um sistema de
-- validacao, com lista suspensa dos bairros."
--
-- ⚠️⚠️ O QUE A MEDIÇÃO ACHOU, e que é maior que o pedido: o formulário público
-- FABRICAVA duas grafias para o mesmo bairro. A lista suspensa dele tinha 11
-- APELIDOS CURTOS ('Barra', 'Recreio', 'Freguesia') e o ViaCEP devolve o nome
-- OFICIAL ('Barra da Tijuca', 'Recreio dos Bandeirantes', 'Freguesia
-- (Jacarepaguá)'). A comparação normalizada nunca casava, então:
--   · quem escolhia da lista gravava o nome curto;
--   · quem preenchia o CEP caía em "Outro" e gravava o nome longo.
-- Medido em produção (23/08), em mem_membros vivos:
--   Barra da Tijuca 33  ×  Barra 22
--   Recreio dos Bandeirantes 15  ×  Recreio 14
--   Freguesia (Jacarepaguá) 5  ×  Freguesia 4
-- Mais 4 registros com espaço no fim ('Barra da Tijuca ', 'Jacarepaguá ').
-- O `alias_de` que a migration do Perfil criou tratava o SINTOMA no mapa; esta
-- fecha a torneira.
--
-- ⚠️⚠️ A DISTINÇÃO QUE ESTA MIGRATION INTRODUZ, e por que ela importa:
-- `alias_de` estava carregando DUAS relações diferentes na mesma coluna.
--
--   'grafia'      · "Barra" É "Barra da Tijuca", escrito curto. Gravar o
--                   canônico no lugar NÃO perde nada — é a mesma informação.
--   'agrupamento' · "Barra Olímpica" fica DENTRO da Barra da Tijuca no mapa,
--                   mas é um lugar próprio. Gravar "Barra da Tijuca" no lugar
--                   APAGARIA onde a pessoa mora.
--
-- Sem separar as duas, canonicalizar na escrita destruiria granularidade real.
-- Por isso: a gravação segue SÓ alias de grafia; o mapa continua agregando os
-- dois. `alias_tipo` nasce 'grafia' porque é o caso comum e o único em que a
-- reescrita é segura — agrupamento é decisão humana e se declara.

BEGIN;

-- ── 1 · alias de GRAFIA × alias de AGRUPAMENTO ──────────────────────────────
ALTER TABLE public.dem_bairro_geo
  ADD COLUMN IF NOT EXISTS alias_tipo text NOT NULL DEFAULT 'grafia';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.dem_bairro_geo'::regclass
       AND conname  = 'dem_bairro_geo_alias_tipo_check'
  ) THEN
    ALTER TABLE public.dem_bairro_geo
      ADD CONSTRAINT dem_bairro_geo_alias_tipo_check
      CHECK (alias_tipo IN ('grafia', 'agrupamento'));
  END IF;
END $$;

COMMENT ON COLUMN public.dem_bairro_geo.alias_tipo IS
  'grafia = o mesmo lugar escrito de outro jeito (a gravacao troca pelo canonico). agrupamento = lugar proprio que o MAPA soma no canonico (a gravacao NAO troca, senao apaga onde a pessoa mora).';

-- "Barra Olímpica" é lugar próprio: some no mapa, permanece no cadastro.
UPDATE public.dem_bairro_geo
   SET alias_tipo = 'agrupamento'
 WHERE bairro_norm = 'barra olimpica';

-- ── 2 · rótulos com grafia herdada de quem digitou primeiro ─────────────────
-- ⚠️ Corrigidos NOMINALMENTE, não por initcap(): em português "da/de/dos" ficam
-- minúsculos e o initcap devolveria "Barra Da Tijuca". São 3 casos, medidos.
UPDATE public.dem_bairro_geo SET bairro = 'Barra da Tijuca' WHERE bairro_norm = 'barra da tijuca' AND bairro <> 'Barra da Tijuca';
UPDATE public.dem_bairro_geo SET bairro = 'Olaria'          WHERE bairro_norm = 'olaria'          AND bairro <> 'Olaria';
UPDATE public.dem_bairro_geo SET bairro = 'Vargem Pequena'  WHERE bairro_norm = 'vargem pequena'  AND bairro <> 'Vargem Pequena';

-- ── 3 · o catálogo que a lista suspensa lê ──────────────────────────────────
-- Devolve o que se PODE escolher: canônicos + aliases de agrupamento. Alias de
-- GRAFIA fica de fora — é ele que a lista antiga oferecia, e oferecer "Barra" e
-- "Barra da Tijuca" lado a lado é recriar o problema que esta migration fecha.
--
-- ⚠️ `apelidos` volta junto para a BUSCA do seletor casar "barra" e sugerir
-- "Barra da Tijuca". Sem isso, quem digita o apelido não acha nada e cria o
-- texto livre de novo.
-- ⚠️ Ordenado por PESSOAS: no totem o preenchimento é em pé, com fila atrás, e
-- os bairros da região precisam estar no topo sem ninguém digitar.
CREATE OR REPLACE FUNCTION public.fn_dem_bairros_catalogo()
RETURNS TABLE (
  bairro_norm text,
  bairro      text,
  pessoas     integer,
  apelidos    text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  WITH gente AS (
    SELECT nullif(public.f_unaccent(lower(btrim(m.bairro))), '') AS norm,
           count(*)::int AS n
      FROM public.mem_membros m
     WHERE m.deleted_at IS NULL
       AND nullif(btrim(m.bairro), '') IS NOT NULL
     GROUP BY 1
  ),
  -- Um alias de grafia empresta a gente dele ao canônico: quem gravou "Barra"
  -- mora na Barra da Tijuca, e a ordem da lista tem que refletir isso.
  resolvido AS (
    SELECT coalesce(a.alias_de, g.norm) AS norm, g.n
      FROM gente g
      LEFT JOIN public.dem_bairro_geo a
             ON a.bairro_norm = g.norm
            AND a.alias_de IS NOT NULL
            AND a.alias_tipo = 'grafia'
  ),
  soma AS (SELECT norm, sum(n)::int AS n FROM resolvido GROUP BY norm),
  apelido AS (
    SELECT alias_de AS norm, array_agg(bairro_norm ORDER BY bairro_norm) AS lista
      FROM public.dem_bairro_geo
     WHERE alias_de IS NOT NULL AND alias_tipo = 'grafia'
     GROUP BY alias_de
  )
  SELECT b.bairro_norm,
         b.bairro,
         coalesce(s.n, 0)::int,
         coalesce(ap.lista, ARRAY[]::text[])
    FROM public.dem_bairro_geo b
    LEFT JOIN soma    s  ON s.norm  = b.bairro_norm
    LEFT JOIN apelido ap ON ap.norm = b.bairro_norm
   WHERE NOT b.ignorar
     AND (b.alias_de IS NULL OR b.alias_tipo = 'agrupamento')
   ORDER BY coalesce(s.n, 0) DESC, b.bairro;
$function$;

COMMENT ON FUNCTION public.fn_dem_bairros_catalogo() IS
  'Bairros que a lista suspensa dos formularios pode oferecer. Exclui ignorados e alias de GRAFIA (oferecer "Barra" ao lado de "Barra da Tijuca" recria a duplicidade). Devolve apelidos para a busca casar o nome curto e sugerir o canonico. Ordenado por pessoas: no totem os bairros da regiao precisam estar no topo.';

-- ── 4 · o nome que vai para o cadastro ──────────────────────────────────────
-- ⚠️⚠️ SÓ arruma a GRAFIA. Segue alias 'grafia' (mesma informação, escrita de
-- outro jeito) e NUNCA alias 'agrupamento' — seguir agrupamento gravaria
-- "Barra da Tijuca" para quem mora na Barra Olímpica, que é apagar dado.
-- ⚠️ Bairro DESCONHECIDO devolve o texto trimado, nunca NULL: a porta pública
-- não pode recusar quem mora num bairro que a base ainda não viu. Ele entra no
-- catálogo depois e a próxima pessoa escolhe da lista.
CREATE OR REPLACE FUNCTION public.fn_dem_bairro_canonico(p_texto text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  WITH e AS (
    SELECT nullif(btrim(p_texto), '')                                AS cru,
           nullif(public.f_unaccent(lower(btrim(p_texto))), '')      AS norm
  ),
  direto AS (
    SELECT b.bairro, b.alias_de, b.alias_tipo
      FROM public.dem_bairro_geo b, e
     WHERE b.bairro_norm = e.norm
  )
  SELECT coalesce(
    (SELECT c.bairro
       FROM direto d
       JOIN public.dem_bairro_geo c ON c.bairro_norm = d.alias_de
      WHERE d.alias_de IS NOT NULL AND d.alias_tipo = 'grafia'),
    (SELECT d.bairro FROM direto d),
    (SELECT cru FROM e)
  );
$function$;

COMMENT ON FUNCTION public.fn_dem_bairro_canonico(text) IS
  'Texto digitado -> rotulo canonico do bairro. Segue alias de GRAFIA (mesma informacao) e nunca de AGRUPAMENTO (gravaria Barra da Tijuca para quem mora na Barra Olimpica). Bairro desconhecido volta trimado, nunca NULL: porta publica nao recusa quem mora onde a base ainda nao viu.';

-- ⚠️ Sem grant para anon/authenticated (lei de 10/08): quem chama e o backend
-- com service_role. A anon key do bundle nao precisa disso.
REVOKE ALL ON FUNCTION public.fn_dem_bairros_catalogo()      FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_dem_bairro_canonico(text)   FROM anon, authenticated;

-- ── 5 · verificação · aborta se a régua não fizer o que promete ─────────────
DO $$
DECLARE
  v_barra   text;
  v_olimp   text;
  v_novo    text;
  v_espaco  text;
  v_lista   int;
  v_vazando int;
BEGIN
  -- apelido de grafia vira o canônico
  SELECT public.fn_dem_bairro_canonico('barra')            INTO v_barra;
  IF v_barra IS DISTINCT FROM 'Barra da Tijuca' THEN
    RAISE EXCEPTION 'alias de grafia nao canonicalizou: "barra" -> % (esperado "Barra da Tijuca")', v_barra;
  END IF;

  -- espaço/caixa some, mas o lugar continua o mesmo
  SELECT public.fn_dem_bairro_canonico('  BARRA DA TIJUCA ') INTO v_espaco;
  IF v_espaco IS DISTINCT FROM 'Barra da Tijuca' THEN
    RAISE EXCEPTION 'grafia com espaco/caixa nao normalizou: %', v_espaco;
  END IF;

  -- ⚠️ agrupamento NAO pode ser reescrito: apagaria onde a pessoa mora
  SELECT public.fn_dem_bairro_canonico('Barra Olímpica')    INTO v_olimp;
  IF v_olimp IS DISTINCT FROM 'Barra Olímpica' THEN
    RAISE EXCEPTION 'alias de AGRUPAMENTO foi reescrito: % — isso apaga dado', v_olimp;
  END IF;

  -- bairro que a base nunca viu passa, trimado
  SELECT public.fn_dem_bairro_canonico('  Vila Nova Inexistente ') INTO v_novo;
  IF v_novo IS DISTINCT FROM 'Vila Nova Inexistente' THEN
    RAISE EXCEPTION 'bairro novo nao passou: %', v_novo;
  END IF;

  IF public.fn_dem_bairro_canonico('   ') IS NOT NULL THEN
    RAISE EXCEPTION 'texto vazio deveria devolver NULL';
  END IF;

  -- a lista existe e nao oferece apelido de grafia
  SELECT count(*) INTO v_lista FROM public.fn_dem_bairros_catalogo();
  IF v_lista < 10 THEN
    RAISE EXCEPTION 'catalogo veio com % linhas — semeadura nao rodou?', v_lista;
  END IF;

  SELECT count(*) INTO v_vazando
    FROM public.fn_dem_bairros_catalogo() c
    JOIN public.dem_bairro_geo b ON b.bairro_norm = c.bairro_norm
   WHERE b.alias_de IS NOT NULL AND b.alias_tipo = 'grafia';
  IF v_vazando > 0 THEN
    RAISE EXCEPTION '% apelido(s) de grafia na lista suspensa — e a duplicidade de volta', v_vazando;
  END IF;

  RAISE NOTICE 'OK · catalogo com % bairros oferecíveis', v_lista;
END $$;

COMMIT;

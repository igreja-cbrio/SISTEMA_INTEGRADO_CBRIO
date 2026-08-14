-- ============================================================================
-- Voluntariado · turno (bloco) de um serviço vira FONTE ÚNICA + reconhece 09:30
--
-- CONTEXTO: os cultos de domingo mudam em 24/08/2026 (o 08:30 encerra e nasce um
-- 09:30 — ver docs/cultos-domingo/). A varredura de 11/08 achou que o
-- voluntariado classifica culto por PREFIXO DE TEXTO do nome, e que o ramo
-- desconhecido é DESCARTADO, não zerado:
--
--     bloco NULL  →  WHERE bloco_id IS NOT NULL  →  a linha some
--
-- Ou seja: no primeiro domingo com "Domingo 09:30", os check-ins de voluntário
-- desapareceriam do Dashboard Semanal **sem erro, sem log e sem virar um zero
-- visível**. Hoje ~520 check-ins já dependem desses literais.
--
-- ⚠️ POR ISSO ESTA MIGRATION VAI AO AR **ANTES** DE O TIPO 09:30 EXISTIR.
-- Se o tipo nascer primeiro, perde-se o primeiro domingo e ninguém percebe.
--
-- O QUE MUDA: a régua estava DUPLICADA em 3 objetos (o gate, o CASE da view e o
-- CASE da composição). Acrescentar um 4º literal em 3 lugares perpetuaria
-- exatamente a duplicação que causou o problema, então a régua passa a ter
-- **uma fonte** (`fn_dash_vol_bloco_nome`) e os outros a delegam.
--
-- `fn_dashboard_voluntariado_resumo` e `_pessoas` **não precisam mudar**: elas já
-- chamavam o gate, então herdam a correção. (A varredura falava em "5 cópias";
-- medido no banco, os literais estavam em 3 objetos SQL + 1 arquivo TS.)
--
-- ⚠️ ZERO MUDANÇA DE COMPORTAMENTO HOJE — provado antes de aplicar: sobre os 18
-- `service_type_name` distintos que existem em `vol_services`, a régua antiga e a
-- nova classificam **igual** (0 divergências). Nenhum nome começa com
-- "Domingo 09" ainda. É seguro publicar 10 dias antes do corte.
--
-- ⚠️ O que este arquivo DELIBERADAMENTE não faz: mexer na hora-âncora
-- '08:30:00' do bloco "Domingo Manhã" (o CTE `blocos`). Ela não é exibida — o
-- `shortLabel` do front mostra o NOME do bloco — e só entra na ordenação, onde
-- 08:30 e 09:30 ordenam igual (ambos antes das 19:00). Fica para a fase do corte
-- de dado, junto com o resto, para que ESTA migration seja um no-op provável.
-- ============================================================================

-- ── A régua, agora com um dono ───────────────────────────────────────────────
-- Devolve o NOME do bloco, ou NULL quando o serviço não é culto (ex.: "GC 12
-- HORAS" — 5 dos 18 nomes de hoje caem aqui, e é o comportamento correto).
CREATE OR REPLACE FUNCTION public.fn_dash_vol_bloco_nome(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    -- Manhã de domingo. `Domingo - Manhã`/`CBKIDS - Manhã` são os serviços de
    -- TURNO do Planning Center (onde vive a escala); `Domingo 08/09/10/11` são
    -- os cultos do nosso catálogo (onde caem os check-ins). Todos = mesmo turno.
    WHEN p_nome ~~* 'Domingo - Manh%'  OR p_nome ~~* 'CBKIDS - Manh%'
      OR p_nome ~~* 'Domingo 08%'      OR p_nome ~~* 'Domingo 09%'
      OR p_nome ~~* 'Domingo 10%'      OR p_nome ~~* 'Domingo 11%'
      THEN 'Domingo Manhã'
    WHEN p_nome ~~* 'Domingo - Noite%' OR p_nome ~~* 'CBKIDS - Noite%'
      OR p_nome ~~* 'Domingo 18%'      OR p_nome ~~* 'Domingo 19%'
      OR p_nome ~~* 'Domingo 20%'
      THEN 'Domingo Noite'
    WHEN p_nome ~~* 'Quarta%'          OR p_nome ~~* 'CBKIDS - Quarta%' THEN 'Quarta'
    WHEN p_nome ~~* 'AMI%'             OR p_nome ~~* 'Culto AMI%'       THEN 'AMI'
    WHEN p_nome ~~* '%Bridge%'                                          THEN 'Bridge'
  END;
$function$;

COMMENT ON FUNCTION public.fn_dash_vol_bloco_nome(text) IS
  'FONTE ÚNICA do turno (bloco) de um serviço de voluntariado, por prefixo do nome. Espelhada em src/pages/ministerial/voluntariado/volMatch.ts (blocoDoServico) — mudou aqui, muda lá. Horário de culto novo entra AQUI, e só aqui, no lado SQL.';

-- Mesma régua, devolvendo o id sintético do bloco (os `b10c…` da 20260705140000).
CREATE OR REPLACE FUNCTION public.fn_dash_vol_bloco_id(p_nome text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE public.fn_dash_vol_bloco_nome(p_nome)
    WHEN 'Domingo Manhã' THEN 'b10c0000-0000-0000-0000-000000000001'::uuid
    WHEN 'Domingo Noite' THEN 'b10c0000-0000-0000-0000-000000000002'::uuid
    WHEN 'Quarta'        THEN 'b10c0000-0000-0000-0000-000000000003'::uuid
    WHEN 'AMI'           THEN 'b10c0000-0000-0000-0000-000000000004'::uuid
    WHEN 'Bridge'        THEN 'b10c0000-0000-0000-0000-000000000005'::uuid
  END;
$function$;

-- O gate passa a DELEGAR (era a 1ª cópia do literal).
CREATE OR REPLACE FUNCTION public.fn_dash_vol_service_no_bloco(p_nome text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT public.fn_dash_vol_bloco_nome(p_nome) IS NOT NULL;
$function$;

-- ── A view (era a 2ª cópia) ──────────────────────────────────────────────────
-- Corpo idêntico ao que estava em produção; só o CASE do `bloco_id` virou
-- chamada da função. Colunas, tipos, ordem e GROUP BY preservados — é
-- CREATE OR REPLACE, então divergir aqui falharia na hora.
CREATE OR REPLACE VIEW public.vw_dashboard_voluntariado AS
 WITH blocos(service_type_id, service_type_name, service_type_color, recurrence_day, recurrence_time) AS (
         VALUES ('b10c0000-0000-0000-0000-000000000001'::uuid,'Domingo Manhã'::text,'#0ea5e9'::text,0,'08:30:00'::time without time zone),
                ('b10c0000-0000-0000-0000-000000000002'::uuid,'Domingo Noite'::text,'#6366f1'::text,0,'19:00:00'::time without time zone),
                ('b10c0000-0000-0000-0000-000000000003'::uuid,'Quarta'::text,'#f59e0b'::text,3,'20:00:00'::time without time zone),
                ('b10c0000-0000-0000-0000-000000000004'::uuid,'AMI'::text,'#10b981'::text,6,'20:00:00'::time without time zone),
                ('b10c0000-0000-0000-0000-000000000005'::uuid,'Bridge'::text,'#ec4899'::text,6,'17:00:00'::time without time zone)
        ), checkins AS (
         SELECT (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS data,
            COALESCE(sc.planning_center_person_id, vp.planning_center_id, vp.id::text, lower(btrim(sc.volunteer_name)), lower(btrim(c.volunteer_name))) AS pessoa,
            public.fn_dash_vol_bloco_id(s.service_type_name) AS bloco_id
           FROM vol_check_ins c
             JOIN vol_services s ON s.id = c.service_id
             LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
             LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
        )
 SELECT EXTRACT(isoyear FROM ci.data)::integer AS ano_iso,
    EXTRACT(week FROM ci.data)::integer AS semana_iso,
    EXTRACT(year FROM ci.data)::integer AS ano_calendario,
    EXTRACT(month FROM ci.data)::integer AS mes,
    b.service_type_id,
    b.service_type_name,
    b.service_type_color,
    b.recurrence_day,
    b.recurrence_time,
    count(DISTINCT ci.data)::integer AS total_cultos,
    0 AS frequencia,
    0 AS frequencia_kids,
    0 AS aceitacoes,
    0 AS aceitacoes_online,
    0 AS ao_vivo,
    0 AS online_ds,
    0 AS online_ddus,
    count(DISTINCT ci.pessoa)::integer AS voluntariado,
    0 AS total_presencial,
    0 AS aceitacoes_kids
   FROM checkins ci
     JOIN blocos b ON b.service_type_id = ci.bloco_id
  WHERE ci.bloco_id IS NOT NULL AND ci.pessoa IS NOT NULL
  GROUP BY (EXTRACT(isoyear FROM ci.data)::integer), (EXTRACT(week FROM ci.data)::integer), (EXTRACT(year FROM ci.data)::integer), (EXTRACT(month FROM ci.data)::integer), b.service_type_id, b.service_type_name, b.service_type_color, b.recurrence_day, b.recurrence_time;

-- ── A composição (era a 3ª cópia) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_dashboard_voluntariado_composicao(p_ano_iso integer, p_semana_iso integer)
RETURNS TABLE(bloco text, culto text, pessoas integer, sem_identificacao integer)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  WITH ci AS (
    SELECT
      s.service_type_name AS culto,
      lower(btrim(COALESCE(NULLIF(btrim(vp.full_name), ''), NULLIF(btrim(sc.volunteer_name), ''),
               NULLIF(btrim(c.volunteer_name), '')))) AS pessoa,
      public.fn_dash_vol_bloco_nome(s.service_type_name) AS bloco
    FROM vol_check_ins c
    JOIN vol_services s ON s.id = c.service_id
    LEFT JOIN vol_schedules sc ON sc.id = c.schedule_id
    LEFT JOIN vol_profiles vp ON vp.id = c.volunteer_id
    WHERE EXTRACT(isoyear FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_ano_iso
      AND EXTRACT(week    FROM (s.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date) = p_semana_iso
      AND public.fn_dash_vol_bloco_nome(s.service_type_name) IS NOT NULL
  )
  SELECT
    bloco,
    culto,
    count(DISTINCT pessoa)::int AS pessoas,
    count(*) FILTER (WHERE pessoa IS NULL)::int AS sem_identificacao
  FROM ci
  WHERE bloco IS NOT NULL
  GROUP BY bloco, culto
  ORDER BY bloco, culto;
$function$;

-- ── Conferência (rodar depois de aplicar; o SQL Editor não mostra RAISE NOTICE)
--
-- 1) Os 4 nomes de domingo classificam certo, inclusive o futuro:
--    SELECT n, public.fn_dash_vol_bloco_nome(n)
--    FROM (VALUES ('Domingo 08:30'),('Domingo 09:30'),('Domingo 10:00'),
--                 ('Domingo 11:30'),('Domingo 19:00'),('Domingo - Manhã'),
--                 ('CBKIDS - Manhã'),('Quarta Com Deus'),('Culto AMI'),
--                 ('Bridge'),('GC 12 HORAS')) v(n);
--    Esperado: Manhã · Manhã · Manhã · Manhã · Noite · Manhã · Manhã · Quarta ·
--              AMI · Bridge · NULL
--
-- 2) Nada mudou no dado atual (tem de dar 0):
--    SELECT count(*) FROM vol_services
--    WHERE service_type_name IS NOT NULL
--      AND (public.fn_dash_vol_bloco_nome(service_type_name) IS NOT NULL)
--       <> (public.fn_dash_vol_service_no_bloco(service_type_name));
--
-- 3) A view continua devolvendo o mesmo total da última semana fechada:
--    SELECT ano_iso, semana_iso, sum(voluntariado) FROM vw_dashboard_voluntariado
--    GROUP BY 1,2 ORDER BY 1 DESC, 2 DESC LIMIT 5;

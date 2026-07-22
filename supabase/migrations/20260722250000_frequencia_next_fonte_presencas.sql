-- Frequência do Next · corrige a FONTE do KPI + colapsa pra 1 número global.
--
-- Problema: o KPI "% crescimento frequência por semana Next" (AMI-03/BRG-04/
-- KIDS-12/ONL-12/SED-23 · delta_pct semanal YoY) lia
-- `next_inscricoes.check_in_at`, que está VAZIO em 2026 → atual=0 toda semana →
-- -100%/-333% falso. A frequência REAL do Next vive em `next_presencas`
-- (presença por encontro · 2025=2050, 2026=889 · YoY viável).
--
-- Correção 1: troca a fonte do ramo `frequencia_next` de `_kpi_agregar_dado`
-- pra contar presenças reais (`next_presencas` ⋈ `next_encontros.data`). Feito
-- por reescrita segura: pega a definição VIVA da função, normaliza CRLF, troca
-- só o trecho da fonte e re-cria (aborta se o trecho não bater · não transcreve
-- a função inteira à mão).
--
-- Correção 2: o Next NÃO tem dimensão de área de culto (turma = nome/horário).
-- Decisão do Matheus: mostrar 1 número GLOBAL (igreja toda), não 5 cards por
-- área repetindo o mesmo valor. Desativa AMI-03/BRG-04/KIDS-12/ONL-12 (reversível)
-- e mantém SED-23 como o indicador único, relabelado "(igreja toda)".
--
-- Idempotente. Após aplicar: recalcular os KPIs de frequencia_next (o cron
-- diário cobre, ou POST /api/kpis/v2/coletar). NÃO afeta os outros dado_tipos.

-- ── Correção 1 · fonte da função ────────────────────────────────────────────
DO $mig$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public._kpi_agregar_dado(text,text,date,date)'::regprocedure);
  src := replace(src, chr(13), ''); -- CRLF → LF (o replace abaixo usa LF)

  src := replace(
    src,
$old$      SELECT count(*) INTO v_resultado
        FROM public.next_inscricoes
       WHERE check_in_at IS NOT NULL
         AND check_in_at::date BETWEEN p_data_inicio AND p_data_fim;$old$,
$new$      SELECT count(*) INTO v_resultado
        FROM public.next_presencas pr
        JOIN public.next_encontros e ON e.id = pr.encontro_id
       WHERE pr.presente = true
         AND e.data BETWEEN p_data_inicio AND p_data_fim;$new$
  );

  -- Guarda: se o trecho não foi encontrado/trocado, aborta (não recria errado).
  IF position('next_presencas pr' IN src) = 0 THEN
    RAISE EXCEPTION 'frequencia_next: trecho da fonte não encontrado — revisar a migration antes de aplicar';
  END IF;

  EXECUTE src;
END $mig$;

-- ── Correção 2 · colapsa pra 1 KPI global ───────────────────────────────────
UPDATE public.kpi_indicadores_taticos
   SET ativo = false, updated_at = now()
 WHERE id IN ('AMI-03', 'BRG-04', 'KIDS-12', 'ONL-12');

UPDATE public.kpi_indicadores_taticos
   SET indicador = '% crescimento da frequência do Next por semana (igreja toda)',
       updated_at = now()
 WHERE id = 'SED-23';

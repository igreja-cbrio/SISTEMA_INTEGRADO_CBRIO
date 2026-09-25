-- ════════════════════════════════════════════════════════════════════════════
--  A data do batismo deixa de ser CONTA e vira CADASTRO.
--
--  Pedido do Matheus (25/09/2026): inscrição para batismos futuros, escolhendo
--  o mês, no formulário público E no app de membros.
--
--  ⚠️⚠️ POR QUE UMA TABELA, E NÃO SÓ "CALCULAR MAIS TRÊS 4ºs DOMINGOS":
--  medidas as 32 cerimônias desde fev/2024, a fórmula do 4º domingo acerta 31.
--  A que falhou foi **dez/2024, antecipado para 15/12** (3º domingo). Com
--  inscrição aberta para 3 meses, alguém reserva em setembro uma data que a
--  igreja ainda pode mover — e uma conta não tem como ser movida.
--
--  ⚠️ A fórmula NÃO morre: vira o SEMEADOR (12 meses à frente). Isso mata o
--  único risco real do cadastro — tabela vazia deixando o formulário mudo.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.batismo_eventos (
  data        date PRIMARY KEY,
  aberto      boolean NOT NULL DEFAULT true,
  observacao  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.batismo_eventos IS
  'Datas de batismo. Semeada pela fórmula do 4º domingo (fn_proximo_quarto_domingo); o gestor edita a exceção. Ver backend/utils/batismoData.js.';

ALTER TABLE public.batismo_eventos ENABLE ROW LEVEL SECURITY;
-- Sem policy: só o backend (service_role) lê e escreve. O formulário público
-- passa pelo endpoint, nunca pelo PostgREST direto.

-- ── Semeadura: 12 meses de 4º domingo a partir do mês corrente ──────────────
-- ⚠️ ON CONFLICT DO NOTHING: rodar de novo não reabre data que o gestor fechou
-- nem sobrescreve exceção cadastrada à mão.
INSERT INTO public.batismo_eventos (data)
SELECT public.fn_proximo_quarto_domingo(
         (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)
          + (g || ' months')::interval)::date)
  FROM generate_series(0, 11) g
ON CONFLICT (data) DO NOTHING;

-- ⚠️ As datas PASSADAS que já têm gente inscrita entram fechadas, para o
-- histórico da tela de gestão não ter buraco — mas sem reabrir inscrição.
INSERT INTO public.batismo_eventos (data, aberto, observacao)
SELECT DISTINCT bi.data_batismo, false, 'importada do histórico'
  FROM public.batismo_inscricoes bi
 WHERE bi.data_batismo IS NOT NULL AND bi.deleted_at IS NULL
ON CONFLICT (data) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
--  As N próximas datas abertas. É ela que o formulário e o app consomem.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_batismo_datas_abertas(p_n integer DEFAULT 3)
RETURNS TABLE(data date)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $fn$
  SELECT e.data
    FROM public.batismo_eventos e
   WHERE e.aberto
     AND e.data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
   ORDER BY e.data
   LIMIT GREATEST(COALESCE(p_n, 3), 1);
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
--  A "próxima data", agora lendo o CADASTRO — com a fórmula como rede.
--
--  ⚠️⚠️ Função NOVA de propósito: `fn_proximo_quarto_domingo` é IMMUTABLE e tem
--  10 pontos de chamada em JS. Trocá-la por uma que lê tabela mudaria a
--  volatilidade e o significado dela no mesmo passo. Ela continua sendo a
--  FÓRMULA (e o semeador); esta é a VERDADE.
--
--  ⚠️ O fallback para a fórmula não é preguiça: é o que garante que apagar a
--  tabela por engano não trave a inscrição de batismo da igreja inteira.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_batismo_proxima_data()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $fn$
  SELECT COALESCE(
    (SELECT d FROM public.fn_batismo_datas_abertas(1) d LIMIT 1),
    public.fn_proximo_quarto_domingo()
  );
$fn$;

-- ⚠️ 'YYYY-MM-DD' válido vira date; qualquer outra coisa vira NULL. Existe
-- porque '2026-02-31' passa no regex e ESTOURA no cast — sem isto, um payload
-- torto do app derrubaria o fan-out inteiro (voluntariado junto).
CREATE OR REPLACE FUNCTION public.fn_data_iso_segura(p_txt text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_txt IS NULL OR p_txt !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN p_txt::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_batismo_datas_abertas(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_batismo_datas_abertas(integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_batismo_datas_abertas(integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_batismo_proxima_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_batismo_proxima_data() FROM anon;
REVOKE ALL ON FUNCTION public.fn_batismo_proxima_data() FROM authenticated;

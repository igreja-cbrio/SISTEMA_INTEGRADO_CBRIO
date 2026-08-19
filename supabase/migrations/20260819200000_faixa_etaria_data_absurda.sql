-- ============================================================================
-- FAIXA ETÁRIA · data de nascimento ABSURDA não vira faixa (2026-08-19)
--
-- Achado ao propagar o nascimento da Renata: os DOIS espelhos da régua
-- discordavam exatamente no caso lixo.
--
--   `src/lib/faixaEtaria.ts` → `idadeEmAnos` devolve NULL quando a idade dá
--   negativa ou passa de 130 ("data absurda não vira idade"), e a tela escreve
--   "Sem data de nascimento".
--
--   `fn_faixa_etaria` → não tinha guarda nenhuma. `age()` de data FUTURA
--   devolve 0 anos, e 0 < 13 ⇒ **'crianca'**.
--
-- ⚠️⚠️ Medido em produção em 19/08: **3 mulheres adultas** apareciam como
-- CRIANÇA na Membresia e entravam no filtro "Crianças" —
-- HELIANE CAVALCANTE (2026-08-29), MONICA CIANELLA G.C (2026-11-08) e
-- ROSANE RODRIGUES (2026-11-21), todas do `grupos_import_2026` de 19/06. É o
-- padrão de import que carimba o ano corrente num aniversário que veio só com
-- dia e mês. Uma quarta linha, POLYANA CALABRIA (1886-03-15 · 140 anos),
-- contava como 'adulto' — inofensivo no rótulo, mas igualmente inventado.
--
-- ⚠️ Isto NÃO conserta o dado: as 4 datas continuam erradas. O que muda é que
-- a régua para de AFIRMAR uma faixa em cima delas — NULL é lido por toda tela
-- como "Sem data de nascimento", que é a verdade. Corrigir a data de cada uma
-- é decisão de cadastro (o ano certo não é derivável).
--
-- Espelhos (mudou aqui, muda em todos · ver a LEI no CLAUDE.md):
--   src/lib/faixaEtaria.ts · backend/utils/membrosPagina.js
--   backend/routes/membresia.js · backend/routes/painelArea.js
--   src/lib/categoriaBatismo.ts (delega)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_faixa_etaria(p_nasc date)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN p_nasc IS NULL THEN NULL
    -- Data absurda não vira faixa (espelha `idadeEmAnos`): futuro ou >130 anos.
    WHEN date_part('year', age(p_nasc)) < 0 THEN NULL
    WHEN date_part('year', age(p_nasc)) > 130 THEN NULL
    WHEN p_nasc > current_date THEN NULL
    WHEN date_part('year', age(p_nasc)) < 13 THEN 'crianca'
    WHEN date_part('year', age(p_nasc)) <= 17 THEN 'adolescente'
    WHEN date_part('year', age(p_nasc)) <= 25 THEN 'jovem'
    ELSE 'adulto'
  END
$function$;

COMMENT ON FUNCTION public.fn_faixa_etaria(date) IS
  'Faixa etaria da igreja (decisao de 19/08/2026): crianca <13 · adolescente 13-17 · jovem 18-25 · adulto 26+. Data absurda (futura ou >130 anos) devolve NULL em vez de faixa inventada. Espelhos em src/lib/faixaEtaria.ts, backend/utils/membrosPagina.js, backend/routes/membresia.js e backend/routes/painelArea.js — mudou aqui, muda em todos.';

-- Conferencia: aborta se a guarda nao pegar o caso que motivou a migration.
DO $$
BEGIN
  IF public.fn_faixa_etaria((current_date + 90)::date) IS NOT NULL THEN
    RAISE EXCEPTION 'data futura ainda vira faixa';
  END IF;
  IF public.fn_faixa_etaria('1886-03-15'::date) IS NOT NULL THEN
    RAISE EXCEPTION 'idade acima de 130 ainda vira faixa';
  END IF;
  IF public.fn_faixa_etaria((current_date - interval '25 years')::date) <> 'jovem'
     OR public.fn_faixa_etaria((current_date - interval '26 years')::date) <> 'adulto'
     OR public.fn_faixa_etaria((current_date - interval '12 years')::date) <> 'crianca'
     OR public.fn_faixa_etaria((current_date - interval '17 years')::date) <> 'adolescente' THEN
    RAISE EXCEPTION 'os cortes da regua mudaram — a guarda nao pode alterar faixa valida';
  END IF;
  RAISE NOTICE 'fn_faixa_etaria: guarda de data absurda ativa, cortes intactos';
END $$;

-- ============================================================================
-- FAIXA ETÁRIA · a régua da igreja passa a ser uma só (2026-08-19)
--
-- Decisão do Matheus, depois de definir as faixas no batismo: **"essa régua deve
-- ser para a igreja toda"**. Até aqui havia DUAS:
--
--   fn_faixa_etaria (Membresia, painel de área, lista impressa de inscritos)
--     crianca <13 · adolescente 13–17 · jovem 18–30 · adulto 31+
--   tg_batismo_categoria_etaria (batismo · migration 20260819160000)
--     crianca <13 · adolescente 13–17 · jovem 18–25 · adulto 26+
--
-- Agora vale a segunda em todo lugar:
--   Criança      0 a 12 anos, 11 meses e 29 dias   → idade < 13
--   Adolescente  13 a 17 anos, 11 meses e 29 dias  → 13 a 17
--   Jovem        18 a 25 anos, 11 meses e 29 dias  → 18 a 25
--   Adulto       26 em diante                      → 26+
--
-- ⚠️ ISTO MUDA NÚMERO QUE JÁ ESTÁ PUBLICADO: medido em 19/08, **154 membros**
-- com 26 a 30 anos deixam de contar como "jovem" e passam a "adulto" na
-- Membresia e no painel de área. Não é erro de dado — é a régua nova. Quem
-- comparar com um print antigo vai ver a diferença, e ela é essa.
--
-- ⚠️ A função é `STABLE` e derivada da data: não há valor gravado para
-- recalcular. Toda tela que a usa passa a responder com as faixas novas na
-- próxima leitura.
--
-- Espelhos que precisam andar junto (todos nesta mesma leva):
--   src/lib/faixaEtaria.ts        · régua + rótulos
--   src/lib/categoriaBatismo.ts   · passa a delegar a régua (nada de 2ª cópia)
--   backend/routes/painelArea.js  · espelho JS + janela adolescente/jovem
--   backend/routes/membresia.js   · janelas de data do filtro por faixa
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_faixa_etaria(p_nasc date)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT CASE
    WHEN p_nasc IS NULL THEN NULL
    WHEN date_part('year', age(p_nasc)) < 13 THEN 'crianca'
    WHEN date_part('year', age(p_nasc)) <= 17 THEN 'adolescente'
    WHEN date_part('year', age(p_nasc)) <= 25 THEN 'jovem'
    ELSE 'adulto'
  END
$function$;

COMMENT ON FUNCTION public.fn_faixa_etaria(date) IS
  'Faixa etaria da igreja (decisao de 19/08/2026): crianca <13 · adolescente 13-17 · jovem 18-25 · adulto 26+. Espelhos em src/lib/faixaEtaria.ts, backend/routes/painelArea.js e nas janelas de data de backend/routes/membresia.js — mudou aqui, muda em todos.';

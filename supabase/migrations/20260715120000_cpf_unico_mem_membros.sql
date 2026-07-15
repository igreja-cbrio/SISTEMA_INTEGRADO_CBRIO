-- ════════════════════════════════════════════════════════════════════════
-- CPF único entre membros vivos (Marcos · 2026-07-15)
-- "Não deve ter duas pessoas com o mesmo CPF, nunca — se o mesmo CPF for
--  digitado, deve se tratar da mesma pessoa."
--
-- As portas de entrada já LIGAM por CPF (matcher acha e reusa o cadastro em
-- vez de criar outro). Este índice é a trava final no banco: nem corrida de
-- requests simultâneos nem import/script consegue gravar um 2º cadastro
-- ativo com o mesmo CPF (o INSERT/UPDATE falha com 23505).
--
-- Verificado em prod (2026-07-15): 0 CPFs repetidos entre membros ativos
-- (628 com CPF · 100% armazenados só-dígitos). A pré-checagem abaixo faz a
-- aplicação falhar com mensagem clara se algum duplicado surgir no meio
-- tempo — nesse caso, fundir os cadastros (aba Duplicatas do /grupos ou
-- Duplicados da Membresia) e reaplicar.
--
-- Índice em EXPRESSÃO normalizada (só dígitos · defende contra um INSERT
-- futuro com máscara "123.456.789-01") e PARCIAL: cadastro soft-deletado
-- libera o CPF pro cadastro vivo.
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE v_dups int;
BEGIN
  SELECT count(*) INTO v_dups FROM (
    SELECT regexp_replace(cpf, '\D', '', 'g') AS c
    FROM public.mem_membros
    WHERE cpf IS NOT NULL AND deleted_at IS NULL
    GROUP BY 1
    HAVING count(*) > 1
  ) t;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Há % CPF(s) repetidos entre membros ativos — funda os cadastros duplicados (aba Duplicatas do /grupos ou Duplicados da Membresia) antes de aplicar esta migration.', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_membros_cpf_ativo
  ON public.mem_membros ((regexp_replace(cpf, '\D', '', 'g')))
  WHERE cpf IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.uniq_mem_membros_cpf_ativo IS
  'CPF é identidade única: no máximo 1 membro não-deletado por CPF (expressão normalizada só-dígitos). Mesmo CPF = mesma pessoa → fundir os cadastros, nunca duplicar.';

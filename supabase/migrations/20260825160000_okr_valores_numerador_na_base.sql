-- ============================================================================
-- OKR 2 · o numerador contava gente FORA do denominador (2026-08-25)
--
-- Pergunta do Matheus: "% de membros com cadastro de voluntário é exatamente
-- o quê?". Ao abrir a conta, o defeito apareceu nos TRÊS componentes do OKR
-- "Engajamento médio nos valores": o denominador é `membros ativos`, e os
-- numeradores NÃO filtravam nada — contavam qualquer pessoa com vínculo,
-- inclusive quem não é membro ativo.
--
-- Medido em 25/08 (base 1.746 membros ativos):
--            publicado        correto     fora da base
--   grupos     1.043 (59,7%)   817 (46,8%)    226
--   volunt.      595 (34,1%)   439 (25,1%)    156
--   dizim.       247 (14,1%)   175 (10,0%)     72
--   média do OKR  36,0%   →   27,3%
--
-- ⚠️⚠️ ISTO CORRIGE UM ERRO DE MEDIÇÃO, não registra piora de operação. O
-- número caiu porque estava inflado, e ele já foi publicado assim no relatório
-- de agosto mandado ao Pr. Juninho — a v2 do relatório traz a correção
-- declarada.
--
-- ⚠️ O filtro de `mem_grupos.ativo` foi conferido e NÃO muda nada: existem
-- ZERO grupos inativos com vínculo ainda aberto. O único efeito é o
-- `membro_ativo` no numerador.
--
-- ⚠️⚠️ PATCH DINÂMICO sobre a definição VIVA (lei do projeto): a função tem
-- ~200 linhas e já foi editada em produção fora do git. `CREATE OR REPLACE`
-- com corpo estático reverteria em silêncio o que só existe lá.
-- Idempotente: se o filtro já estiver no corpo, não faz nada.
-- ============================================================================

do $$
declare
  d text; n int; novo text;
  filtro constant text :=
    ' AND membro_id IN (SELECT id FROM mem_membros WHERE status=''membro_ativo'' AND deleted_at IS NULL)';
  a1 constant text := 'FROM mem_grupo_membros gm WHERE gm.saiu_em IS NULL AND gm.deleted_at IS NULL';
  a2 constant text := 'FROM mem_voluntarios WHERE ate IS NULL AND deleted_at IS NULL';
  a3 constant text := 'FROM mem_contribuicoes WHERE deleted_at IS NULL AND data >= CURRENT_DATE - INTERVAL ''6 months''';
begin
  d := pg_get_functiondef('public.fn_monitoramento_okr_raw()'::regprocedure);

  if strpos(d, filtro) > 0 then
    raise notice 'ja aplicado — nada a fazer';
    return;
  end if;

  -- ⚠️ guardas de OCORRÊNCIA: a forma viva tem que ser a que foi lida ao
  -- escrever isto. Divergiu? aborta em vez de remendar às cegas.
  n := (length(d) - length(replace(d, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'grupos: esperava 1 ocorrencia, achei %', n; end if;
  n := (length(d) - length(replace(d, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'voluntarios: esperava 1 ocorrencia, achei %', n; end if;
  n := (length(d) - length(replace(d, a3, ''))) / length(a3);
  if n <> 2 then raise exception 'dizimistas: esperava 2 ocorrencias (pct e n), achei %', n; end if;

  novo := replace(d,    a1, a1 || filtro);
  novo := replace(novo, a2, a2 || filtro);
  novo := replace(novo, a3, a3 || filtro);
  execute novo;

  -- confere no corpo resultante, não no silêncio do EXECUTE
  d := pg_get_functiondef('public.fn_monitoramento_okr_raw()'::regprocedure);
  n := (length(d) - length(replace(d, filtro, ''))) / length(filtro);
  if n <> 4 then raise exception 'esperava 4 filtros no corpo final, achei %', n; end if;
  raise notice 'patch aplicado · 4 filtros';
end $$;

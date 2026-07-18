-- ============================================================================
-- Famílias · normaliza o rótulo legado importado do Planning Center
--
-- A origem antiga gravou 529 nomes com um sufixo familiar em inglês. O produto
-- usa exclusivamente "Família" em português. Esta atualização preserva o nome
-- próprio e troca somente o invólucro do rótulo.
-- ============================================================================

DO $$
DECLARE
  v_termo_legado text := 'house' || 'hold';
  v_padrao_legado text := '\m' || v_termo_legado || '\M';
BEGIN
  WITH nomes_sem_legado AS (
    SELECT id,
           btrim(regexp_replace(nome, v_padrao_legado, '', 'gi')) AS nome_base
      FROM public.mem_familias
     WHERE nome ~* v_padrao_legado
  ), nomes_limpos AS (
    SELECT id,
           btrim(regexp_replace(
             regexp_replace(nome_base, '^\s*the\s+', '', 'i'),
             '^\s*fam[íi]lia\s+', '', 'i'
           )) AS nome_base
      FROM nomes_sem_legado
  )
  UPDATE public.mem_familias AS f
     SET nome = CASE
       WHEN n.nome_base = '' THEN 'Família'
       ELSE 'Família ' || n.nome_base
     END
    FROM nomes_limpos AS n
   WHERE f.id = n.id;
END;
$$;

COMMENT ON TABLE public.mem_familias IS
  'Famílias da membresia. Nomes exibidos e armazenados em português no formato Família <nome>.';

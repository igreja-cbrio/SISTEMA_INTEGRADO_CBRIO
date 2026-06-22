-- ============================================================================
-- Grupos · RPC fn_grupos_ultima_frequencia() — data da última presença de cada
-- pessoa nos encontros de grupo (presente=true · encontro ativo · grupo ativo).
--
-- Alimenta a coluna "Última frequência" + o "Status de frequência" da aba
-- Pessoas (censo de quem está nos grupos · pedido do Marcos 2026-06-22).
-- 1 linha por membro que tem ≥1 presença · agregação no banco (escala melhor
-- que paginar mem_grupo_encontro_presencas no backend). Mesma fonte da aba
-- Relatórios e do dado-tipo frequencia_grupos (#1210).
--
-- STABLE SECURITY DEFINER (par? com fn_grupos_kpis_relatorio) · só leitura.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_grupos_ultima_frequencia()
RETURNS TABLE(membro_id uuid, ultima_data date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.membro_id, max(e.data) AS ultima_data
    FROM public.mem_grupo_encontro_presencas p
    JOIN public.mem_grupo_encontros e
      ON e.id = p.encontro_id AND e.deleted_at IS NULL
    JOIN public.mem_grupos g
      ON g.id = e.grupo_id AND coalesce(g.ativo, true) = true AND g.deleted_at IS NULL
   WHERE p.presente = true
   GROUP BY p.membro_id;
$$;

COMMENT ON FUNCTION public.fn_grupos_ultima_frequencia() IS
  'Data da última presença (presente=true) de cada membro em encontros de grupos ativos. Alimenta a aba Pessoas (status/última frequência) do módulo Grupos.';

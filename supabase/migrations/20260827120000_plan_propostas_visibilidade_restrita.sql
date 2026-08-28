-- =====================================================================
-- Planejamento Anual · restringe QUEM VÊ O CONTEÚDO das propostas
-- (nome/área/descrição/custo) a: proponente · diretoria geral · Pastor
-- presidente · super-admin (decisão do Diego · 2026-08-27).
--
-- Até aqui, a policy plan_propostas_select liberava SELECT a qualquer
-- autenticado com nível ≥1 no módulo planejamento-anual — decisão
-- original documentada em CLAUDE.md ("Propostas = todos com módulo
-- ≥1"). O acesso REAL era ainda mais amplo do que essa RLS sozinha
-- sugere: o backend (service_role) lista TODAS as propostas do ciclo
-- pra qualquer usuário do módulo, e o GET /propostas/:id devolvia o
-- conteúdo completo (nome/área/descrição/custo) pra qualquer um desses
-- via `projetarProposta` no papel 'observador' — só as notas/devolutivas
-- já eram restritas. O ajuste no backend (routes/planejamentoAnual.js)
-- fecha esses dois GETs; esta migration é a defesa em profundidade da
-- RLS (a anon key está no bundle público — sem isso, alguém com JWT
-- válido conseguiria ler `plan_propostas` direto via PostgREST,
-- contornando o backend).
--
-- ⚠️ 'diretoria' aqui é `profiles.is_diretoria_geral` (o flag canônico
-- dos "5 nominais" — ver CLAUDE.md), NÃO `profiles.role`. Medido no
-- banco antes de escrever: Pedro Paulo Menezes e o Pastor Presidente
-- têm role='assistente' mas is_diretoria_geral=true — e são exatamente
-- 2 dos 4 avaliadores do ciclo em curso. Usar role='diretor'/'admin'
-- teria excluído quem precisa avaliar as propostas.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_user_e_diretoria_ou_pastor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.is_diretoria_geral = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.cargos c ON c.id = u.cargo_id
    JOIN auth.users au ON lower(au.email) = lower(u.email)
    WHERE au.id = auth.uid() AND u.ativo = true AND c.slug = 'pastor-presidente'
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_e_diretoria_ou_pastor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_e_diretoria_ou_pastor() TO authenticated;

DROP POLICY IF EXISTS plan_propostas_select ON public.plan_propostas;
CREATE POLICY plan_propostas_select ON public.plan_propostas
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR lider_id = auth.uid()
    OR preenchido_por_id = auth.uid()
    OR created_by = auth.uid()
    OR public.current_user_e_diretoria_ou_pastor()
  );

-- plan_propostas_delete e plan_propostas_service não mudam (delete já era
-- super-admin only; service_role segue com bypass total pro backend).

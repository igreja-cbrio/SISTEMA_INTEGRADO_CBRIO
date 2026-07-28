-- Correção de desenho (pedido do usuário 2026-07-29, ainda na mesma leva da
-- revisão periódica / migration 20260729050000): o coordenador do processo
-- NÃO é por localização — é um único "Coordenador de Operações/Logística"
-- para todo o sistema de revisão, que acompanha os indicadores e pode ajustar
-- as rotinas. Granularidade de poderes (o que exatamente ele pode fazer vs.
-- o responsável pelas conferências) fica pra uma próxima leva.
--
-- ⚠️ `pat_localizacoes.coordenador_id` (criada na migration anterior) fica
-- DORMENTE — não é mais escrita pelo backend/frontend, mas não é dropada
-- aqui (coluna nova, vazia, sem dependentes; manter é mais seguro que uma
-- migration destrutiva sem necessidade).

CREATE TABLE IF NOT EXISTS public.pat_revisao_coordenador (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  coordenador_id uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pat_revisao_coordenador ENABLE ROW LEVEL SECURITY;

CREATE POLICY pat_revisao_coordenador_sel ON public.pat_revisao_coordenador FOR SELECT TO authenticated
  USING (public.current_user_module_level('patrimonio') >= 1);
CREATE POLICY pat_revisao_coordenador_srv ON public.pat_revisao_coordenador FOR ALL TO service_role USING (true) WITH CHECK (true);

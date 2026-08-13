-- Revisão periódica de patrimônio (pedido do usuário 2026-07-28): ciclo
-- trimestral único para toda a igreja, com UM funcionário responsável fazendo
-- todas as conferências físicas por localização. Gera métrica de pontualidade
-- (cumpriu o prazo?) e velocidade (tempo de execução, clock iniciado só
-- quando o responsável abre a convocação) — SEMPRE separadas (decisão do
-- conselho: velocidade sozinha não é ranking de desempenho, precisa vir com
-- sinal de qualidade/divergência ao lado).
--
-- ⚠️ Mesma ressalva de drift do `20260728180000_patrimonio_dashboard_indicadores.sql`:
-- pat_bens/pat_categorias/pat_localizacoes nunca foram versionadas — colunas
-- usadas aqui são as mesmas já em uso extensivo em backend/routes/patrimonio.js.

-- Coordenador de área: quem acompanha os indicadores/revisões da própria
-- localização. Não existia nenhum campo de "dono" da localização até aqui.
ALTER TABLE public.pat_localizacoes
  ADD COLUMN IF NOT EXISTS coordenador_id uuid REFERENCES public.profiles(id);

CREATE TABLE IF NOT EXISTS public.pat_revisao_ciclos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  responsavel_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'encerrado')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pat_revisao_convocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id uuid NOT NULL REFERENCES public.pat_revisao_ciclos(id) ON DELETE CASCADE,
  localizacao_id uuid NOT NULL REFERENCES public.pat_localizacoes(id),
  prazo date NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida')),
  data_inicio timestamptz,
  data_conclusao timestamptz,
  total_bens_esperados integer NOT NULL DEFAULT 0,
  total_bens_conferidos integer NOT NULL DEFAULT 0,
  total_divergencias integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pat_revisao_convocacoes_ciclo ON public.pat_revisao_convocacoes (ciclo_id);
CREATE INDEX IF NOT EXISTS idx_pat_revisao_convocacoes_localizacao ON public.pat_revisao_convocacoes (localizacao_id);

CREATE TABLE IF NOT EXISTS public.pat_revisao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convocacao_id uuid NOT NULL REFERENCES public.pat_revisao_convocacoes(id) ON DELETE CASCADE,
  bem_id uuid NOT NULL REFERENCES public.pat_bens(id),
  encontrado boolean,
  status_fisico text CHECK (status_fisico IN ('ok', 'danificado', 'nao_encontrado')),
  observacao text,
  data_revisao timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pat_revisao_itens_convocacao ON public.pat_revisao_itens (convocacao_id);

ALTER TABLE public.pat_revisao_ciclos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pat_revisao_convocacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pat_revisao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY pat_revisao_ciclos_sel ON public.pat_revisao_ciclos FOR SELECT TO authenticated
  USING (public.current_user_module_level('patrimonio') >= 1);
CREATE POLICY pat_revisao_ciclos_srv ON public.pat_revisao_ciclos FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY pat_revisao_convocacoes_sel ON public.pat_revisao_convocacoes FOR SELECT TO authenticated
  USING (public.current_user_module_level('patrimonio') >= 1);
CREATE POLICY pat_revisao_convocacoes_srv ON public.pat_revisao_convocacoes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY pat_revisao_itens_sel ON public.pat_revisao_itens FOR SELECT TO authenticated
  USING (public.current_user_module_level('patrimonio') >= 1);
CREATE POLICY pat_revisao_itens_srv ON public.pat_revisao_itens FOR ALL TO service_role USING (true) WITH CHECK (true);

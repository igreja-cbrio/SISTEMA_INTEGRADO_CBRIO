-- ===========================================================================
-- Devocional · planos mensais + itens diarios + tracking de adesao
--
-- Estrutura pra admin (Cuidados) criar planos de devocional mensais (pode
-- usar IA pra sugerir), e ter dashboard de adesao por membro. Membro faz
-- check-in via mem_devocionais existente · adicionamos FK opcional pra
-- linkar com o item do plano que ele cumpriu.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.devocional_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (data_fim >= data_inicio)
);

ALTER TABLE public.devocional_planos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_devocional_planos" ON public.devocional_planos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_devocional_planos" ON public.devocional_planos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_devocional_planos_ativo
  ON public.devocional_planos(ativo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_devocional_planos_periodo
  ON public.devocional_planos(data_inicio, data_fim);


CREATE TABLE IF NOT EXISTS public.devocional_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id uuid NOT NULL REFERENCES public.devocional_planos(id) ON DELETE CASCADE,
  data date NOT NULL,
  titulo text NOT NULL,
  passagem text,
  passagem_texto text,
  reflexao text NOT NULL,
  aplicacao text,
  oracao text,
  gerado_por_ia boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plano_id, data)
);

ALTER TABLE public.devocional_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_devocional_itens" ON public.devocional_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_devocional_itens" ON public.devocional_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_devocional_itens_plano_data
  ON public.devocional_itens(plano_id, data);


-- Link opcional do check-in com o item do plano
ALTER TABLE public.mem_devocionais
  ADD COLUMN IF NOT EXISTS devocional_item_id uuid REFERENCES public.devocional_itens(id);

CREATE INDEX IF NOT EXISTS idx_mem_devocionais_item
  ON public.mem_devocionais(devocional_item_id) WHERE devocional_item_id IS NOT NULL;


-- View agregada · 1 linha por (plano, dia) com contagem de check-ins
CREATE OR REPLACE VIEW public.vw_devocional_adesao_dia AS
SELECT
  i.plano_id,
  i.id AS item_id,
  i.data,
  i.titulo,
  i.passagem,
  COUNT(DISTINCT d.membro_id) FILTER (WHERE d.id IS NOT NULL) AS check_ins
FROM public.devocional_itens i
LEFT JOIN public.mem_devocionais d
  ON d.data_devocional = i.data
 AND (d.devocional_item_id = i.id OR d.devocional_item_id IS NULL)
GROUP BY i.plano_id, i.id, i.data, i.titulo, i.passagem;


-- View detalhada · 1 linha por (item, membro_ativo) indicando se concluiu
-- Materializa o cross-join · cara em volume grande (50k+) · usar com WHERE plano_id
CREATE OR REPLACE VIEW public.vw_devocional_adesao_membro AS
SELECT
  i.plano_id,
  i.id AS item_id,
  i.data,
  m.id AS membro_id,
  m.nome AS membro_nome,
  m.foto_url,
  EXISTS (
    SELECT 1 FROM public.mem_devocionais d
    WHERE d.membro_id = m.id
      AND d.data_devocional = i.data
      AND (d.devocional_item_id = i.id OR d.devocional_item_id IS NULL)
  ) AS concluido
FROM public.devocional_itens i
CROSS JOIN public.mem_membros m
WHERE m.active = true
  AND m.status IN ('membro_ativo','membro','frequentador');

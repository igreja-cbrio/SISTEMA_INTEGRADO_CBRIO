-- Adiciona colunas que existem na planilha ministerial mas não tinham campo na tabela
ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS visitantes          integer CHECK (visitantes >= 0),
  ADD COLUMN IF NOT EXISTS visitantes_online   integer CHECK (visitantes_online >= 0),
  ADD COLUMN IF NOT EXISTS voluntarios         integer CHECK (voluntarios >= 0);

-- Atualiza a view para incluir os novos campos (recria por ser OR REPLACE)
CREATE OR REPLACE VIEW public.vw_culto_stats AS
SELECT
  c.*,
  vst.name        AS service_type_name,
  vst.color       AS service_type_color,
  ROUND(c.presencial_adulto::numeric / 1300 * 100, 1)                        AS taxa_ocupacao,
  (c.presencial_adulto + c.presencial_kids)                                   AS total_presencial,
  (COALESCE(c.decisoes_presenciais, 0) + COALESCE(c.decisoes_online, 0))      AS total_decisoes
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON c.service_type_id = vst.id;

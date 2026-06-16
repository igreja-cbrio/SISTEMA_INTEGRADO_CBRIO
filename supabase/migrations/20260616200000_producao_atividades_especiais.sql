-- ============================================================================
-- Produção · atividades especiais no cronograma do culto
--
-- Marcos (2026-06-16): além dos momentos padrão (travados), a equipe pode
-- inserir uma ATIVIDADE ESPECIAL (Ceia, Batismo, Apresentação de bebês, Outros)
-- na posição em que ela entrou. Serve pra MAPEAR/explicar por que o culto passa
-- de 60min: quantos cultos têm atividade especial, de rotina (ceia/batismo/
-- apresentação) × outras.
--
-- A atividade especial é só mais uma etapa (secao='culto'), etiquetada por
-- `tipo='especial'` + `categoria_especial`. Entra no tempo TOTAL do culto
-- (a pontualidade segue medindo o total · decisão do Marcos), e o previsto
-- dela fica NULL (não estava no roteiro planejado).
--
-- ADITIVA · idempotente.
-- ============================================================================

ALTER TABLE public.culto_producao_etapas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'padrao'
    CHECK (tipo IN ('padrao', 'especial')),
  ADD COLUMN IF NOT EXISTS categoria_especial text
    CHECK (categoria_especial IS NULL OR categoria_especial IN
      ('ceia', 'batismo', 'apresentacao_bebes', 'outros'));

CREATE INDEX IF NOT EXISTS idx_culto_prod_etapas_especial
  ON public.culto_producao_etapas (categoria_especial)
  WHERE tipo = 'especial';

-- Re-etiqueta a "Apresentação de Criança/Bebês" já carregada (culto das 10h de
-- 2026-06-14) como atividade especial de rotina (apresentação de bebês).
UPDATE public.culto_producao_etapas
   SET tipo = 'especial', categoria_especial = 'apresentacao_bebes'
 WHERE tipo = 'padrao'
   AND lower(titulo) LIKE 'apresenta%';

-- Conferência:
--   SELECT titulo, tipo, categoria_especial FROM culto_producao_etapas
--    WHERE tipo='especial';
-- ============================================================================

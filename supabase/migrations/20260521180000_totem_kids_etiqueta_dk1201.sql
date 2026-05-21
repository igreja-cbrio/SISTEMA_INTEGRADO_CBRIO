-- ============================================================================
-- Totem Kids · ajuste tamanho de etiqueta · DK-1201 (29x90mm)
--
-- Marcos (2026-05-21): "O tamanho que usamos aqui na igreja é o de 29mmx90mm
-- DK 1201". A CBRio ja tem rolos DK-1201 em estoque. Trocar defaults de
-- 62x100 (DK-22251) pra 29x90 (DK-1201).
-- ============================================================================

BEGIN;

-- 1. Default das colunas
ALTER TABLE public.kids_estacoes
  ALTER COLUMN printer_largura_mm SET DEFAULT 29,
  ALTER COLUMN printer_altura_mm SET DEFAULT 90;

-- 2. Atualiza registros existentes que ainda estavam no default antigo
UPDATE public.kids_estacoes
   SET printer_largura_mm = 29,
       printer_altura_mm = 90
 WHERE printer_largura_mm = 62 AND printer_altura_mm = 100;

COMMIT;

-- Conferencia:
--   SELECT nome, printer_modelo, printer_largura_mm, printer_altura_mm
--     FROM kids_estacoes;
-- ============================================================================

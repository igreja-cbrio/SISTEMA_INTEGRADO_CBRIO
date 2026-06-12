-- ============================================================================
-- Totem Kids · ajuste tamanho de etiqueta · DK-1201 paisagem (90x29mm)
--
-- Marcos (2026-05-21): "O tamanho que usamos aqui na igreja é o de 29mmx90mm
-- DK 1201". A CBRio ja tem rolos DK-1201 em estoque. Etiqueta tipo endereco
-- · sai DEITADA da impressora · 90mm de comprimento x 29mm de altura.
--
-- Marcos depois (mesma data, apos preview): "está alta e não comprida" ·
-- confirmou que e paisagem (90 largura x 29 altura), nao retrato.
-- ============================================================================

BEGIN;

-- 1. Default das colunas · paisagem (largura > altura)
ALTER TABLE public.kids_estacoes
  ALTER COLUMN printer_largura_mm SET DEFAULT 90,
  ALTER COLUMN printer_altura_mm SET DEFAULT 29;

-- 2. Atualiza registros existentes (62x100 do default original ou 29x90
--    da primeira tentativa retrato)
UPDATE public.kids_estacoes
   SET printer_largura_mm = 90,
       printer_altura_mm = 29
 WHERE (printer_largura_mm = 62 AND printer_altura_mm = 100)
    OR (printer_largura_mm = 29 AND printer_altura_mm = 90);

COMMIT;

-- Conferencia:
--   SELECT nome, printer_modelo, printer_largura_mm, printer_altura_mm
--     FROM kids_estacoes;
-- ============================================================================

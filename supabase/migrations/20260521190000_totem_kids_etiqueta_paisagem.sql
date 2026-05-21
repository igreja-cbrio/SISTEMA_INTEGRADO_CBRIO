-- ============================================================================
-- Totem Kids · ajuste etiqueta DK-1201 retrato → paisagem
--
-- Marcos (2026-05-21, apos preview): "está alta e não comprida". A etiqueta
-- DK-1201 sai DEITADA (paisagem) · 90mm de comprimento x 29mm de altura.
-- Tipo etiqueta de endereco padrao Brother.
--
-- Esta migration corrige o erro da `20260521180000_totem_kids_etiqueta_dk1201`
-- que tinha definido 29x90 (retrato).
-- ============================================================================

BEGIN;

-- 1. Default das colunas · paisagem
ALTER TABLE public.kids_estacoes
  ALTER COLUMN printer_largura_mm SET DEFAULT 90,
  ALTER COLUMN printer_altura_mm SET DEFAULT 29;

-- 2. Atualiza registros existentes que estavam em retrato (29x90)
UPDATE public.kids_estacoes
   SET printer_largura_mm = 90,
       printer_altura_mm = 29
 WHERE printer_largura_mm = 29 AND printer_altura_mm = 90;

COMMIT;

-- Conferencia:
--   SELECT nome, printer_largura_mm, printer_altura_mm FROM kids_estacoes;
-- Esperado: largura=90, altura=29 em todas
-- ============================================================================

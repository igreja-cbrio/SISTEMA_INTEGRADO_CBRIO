-- Multi-campus · FASE 1 · Leva 3 · compras (isolado) + patrimônio (central)
-- Ref: docs/multicampus-plano.md §4.2/§5. Decisões da gestão (2026-07-01):
--   - Compras/Logística = POR CAMPUS (cada setor faz o próprio pedido, compra
--     específica do setor → pertence ao campus do setor) → carimba igreja_id.
--   - Patrimônio = CENTRAL (bem é da igreja; direcionamento por setor via
--     localização) → NÃO isola por campus; corrige escopo_campus p/ compartilhado.
-- ADITIVA e SEGURA (nada filtra por igreja_id ainda · Fase 2). DEFAULT Sede.
--
-- Financeiro/RH FICOU DE FORA: a gestão disse "Central", o que contradiz a
-- decisão #3 ("separado por campus + consolidado"). Aguarda confirmação.

-- 1) Compras/Logística · igreja_id nos documentos de compra (top-level).
--    Fornecedores ficam de fora (catálogo compartilhado · atende todos os campi).
DO $$
DECLARE
  v_sede CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  t text;
  tabelas text[] := ARRAY[
    'log_solicitacoes_compra', 'log_pedidos', 'log_compras', 'log_notas_fiscais'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;  -- guarda: pula se a tabela não existir
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS igreja_id uuid '
      'REFERENCES public.igrejas(id) ON DELETE SET NULL DEFAULT %L', t, v_sede);
    EXECUTE format('UPDATE public.%I SET igreja_id = %L WHERE igreja_id IS NULL', t, v_sede);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (igreja_id)',
      'idx_' || t || '_igreja', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.igreja_id IS %L', t,
      'Multi-campus (Fase 1) · campus da compra (setor que pediu). DEFAULT Sede transitorio; RLS por campus na Fase 2.');
  END LOOP;
END $$;

-- 2) Patrimônio = CENTRAL → corrige o escopo_campus que a Fase 0 semeou como
--    isolado (bem pertence à rede; direcionamento por setor é via localização).
UPDATE public.modulos SET escopo_campus = 'compartilhado' WHERE slug = 'patrimonio';
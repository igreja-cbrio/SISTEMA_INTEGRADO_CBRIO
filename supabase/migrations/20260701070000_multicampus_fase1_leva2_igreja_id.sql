-- Multi-campus · FASE 1 · Leva 2 · propaga igreja_id (2026-07-01)
-- Ref: docs/multicampus-plano.md §5. ADITIVA e SEGURA (nada filtra por
-- igreja_id ainda · Fase 2). DEFAULT Sede (...0001) evita nulos órfãos.
--
-- Leva 2 = operacional inequívoco por-campus (grupo A do checkpoint):
--   - mem_grupo_membros (membros de grupo · herda o campus do grupo)
--   - solicitacoes       (a solicitação nasce no campus de quem pede)
--
-- Fora (grupo B · decisão de negócio pendente): compras/logística, patrimônio,
-- financeiro/RH. Fora (grupo C · risco/agregadas): cultos, decisões, kpi_*,
-- dados_brutos, mem_contribuicoes + o UNIQUE de cultos.

DO $$
DECLARE
  v_sede CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  t text;
  tabelas text[] := ARRAY['mem_grupo_membros', 'solicitacoes'];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS igreja_id uuid '
      'REFERENCES public.igrejas(id) ON DELETE SET NULL DEFAULT %L', t, v_sede);
    EXECUTE format('UPDATE public.%I SET igreja_id = %L WHERE igreja_id IS NULL', t, v_sede);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (igreja_id)',
      'idx_' || t || '_igreja', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.igreja_id IS %L', t,
      'Multi-campus (Fase 1) · campus da operacao. DEFAULT Sede transitorio; nenhuma RLS filtra por ele ainda (Fase 2).');
  END LOOP;
END $$;
-- Multi-campus · FASE 1 · Leva 1 · propaga igreja_id (2026-07-01)
-- Ref: docs/multicampus-plano.md §5. ADITIVA e SEGURA: nada filtra por
-- igreja_id ainda (Fase 2). DEFAULT Sede (...0001) evita nulos órfãos que
-- sumiriam sob a RLS por campus futura; todo dado atual é Sede.
--
-- Leva 1 = núcleo da jornada + grupos + voluntários (tabelas NÃO agregadas,
-- claramente por-campus). NÃO inclui cultos/decisões/kpi_* (agregadas · exigem
-- varredura de read-sites antes de filtrar · levas posteriores com confirmação).
--
-- ⚠️ Transitório: o DEFAULT Sede é rede de segurança durante a transição.
-- Na Fase 3, o código deve setar igreja_id explicitamente no ato (o campus 2
-- NÃO pode herdar Sede por omissão) e o default será revisto.

DO $$
DECLARE
  v_sede CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  t text;
  tabelas text[] := ARRAY[
    'cui_convertidos', 'cui_acompanhamentos', 'cui_jornada180',
    'batismo_inscricoes', 'next_inscricoes', 'mem_grupos', 'mem_voluntarios'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS igreja_id uuid '
      'REFERENCES public.igrejas(id) ON DELETE SET NULL DEFAULT %L', t, v_sede);
    -- rede extra: qualquer linha que por acaso tenha ficado nula vira Sede
    EXECUTE format('UPDATE public.%I SET igreja_id = %L WHERE igreja_id IS NULL', t, v_sede);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (igreja_id)',
      'idx_' || t || '_igreja', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.igreja_id IS %L', t,
      'Multi-campus (Fase 1) · campus da operação. DEFAULT Sede transitório; '
      'nenhuma RLS filtra por ele ainda (Fase 2).');
  END LOOP;
END $$;
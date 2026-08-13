-- ============================================================================
-- 20260813150000 · Lote 3 dos cultos de domingo: vigência + chaves de lente
--                  + flag do véu (docs/cultos-domingo/ · corte 24/08/2026)
-- ============================================================================
-- 100% ADITIVA e IDEMPOTENTE. Nenhum código existente lê estas colunas — quem
-- as consome é o card de prévia do Dashboard Semanal (Lote 4), que tolera a
-- ausência delas (SELECT isolado · lição do parcelas_max). NÃO cria o tipo
-- "Domingo 09:30" (isso é o script do corte, Lote 5) e NÃO muda comportamento
-- de nenhuma tela.
--
-- O modelo (decisão do Matheus · NUNCA rename, NUNCA delete):
--   · linhagem_key     = lente CONTINUIDADE ("o 10:00 virou 09:30") — o tipo
--     novo herda a chave do 10:00 e a série atravessa o corte como UMA linha.
--   · consolidacao_key = lente CONSOLIDAÇÃO (pedido do Pr. Juninho): 08:30 +
--     10:00 SOMADOS POR SEMANA no passado × o 09:30 novo — mesma chave nos 3.
--   · vigente_de/ate   = janela de vigência do tipo (08:30 e 10:00 encerram em
--     23/08; o 09:30 nasce com vigente_de 24/08 no script do corte). É a base
--     do "lugares OFERECIDOS" da ocupação (1050 × cultos vigentes no domingo).
--   · cultos_config.lentes_domingo_publicas = o VÉU: false (default) = a
--     prévia só aparece pra super-admin; true = aparece pra todos. Destravar
--     em 24/08 = 1 UPDATE, sem deploy de domingo.
-- ============================================================================

-- ── 1 · Colunas novas em vol_service_types (aditivas · nada as lê ainda) ────
ALTER TABLE public.vol_service_types
  ADD COLUMN IF NOT EXISTS vigente_de       date,
  ADD COLUMN IF NOT EXISTS vigente_ate      date,
  ADD COLUMN IF NOT EXISTS linhagem_key     text,
  ADD COLUMN IF NOT EXISTS consolidacao_key text;

COMMENT ON COLUMN public.vol_service_types.vigente_de IS
  'Início da vigência do tipo (NULL = desde sempre). Base do cálculo de lugares OFERECIDOS (ocupação = freq_adulto ÷ 1050 × cultos vigentes) · docs/cultos-domingo/.';
COMMENT ON COLUMN public.vol_service_types.vigente_ate IS
  'Fim da vigência do tipo (NULL = sem fim). 08:30 e 10:00 encerram em 2026-08-23; encerrar NUNCA é deletar (mina nº 5) nem renomear (decisão do Matheus).';
COMMENT ON COLUMN public.vol_service_types.linhagem_key IS
  'Lente CONTINUIDADE: tipos com a mesma chave são a MESMA série através do tempo (Domingo 10:00 → Domingo 09:30 = ''domingo-0930''). O tipo novo herda a chave no script do corte.';
COMMENT ON COLUMN public.vol_service_types.consolidacao_key IS
  'Lente CONSOLIDAÇÃO (Pr. Juninho): tipos com a mesma chave são SOMADOS POR SEMANA antes de qualquer média (08:30 + 10:00 no passado × 09:30 novo = ''domingo-0930'').';

-- ── 2 · Seeds (só-onde-nulo · match por nome EXATO da grade vigente) ────────
UPDATE public.vol_service_types
   SET consolidacao_key = 'domingo-0930'
 WHERE name = 'Domingo 08:30' AND consolidacao_key IS NULL;

UPDATE public.vol_service_types
   SET linhagem_key     = 'domingo-0930',
       consolidacao_key = COALESCE(consolidacao_key, 'domingo-0930')
 WHERE name = 'Domingo 10:00' AND linhagem_key IS NULL;

-- vigência: os 2 tipos que encerram no corte (dado informativo — nenhuma tela
-- de operação lê; a prévia atrás do véu usa pra calcular lugares ofertados)
UPDATE public.vol_service_types
   SET vigente_ate = DATE '2026-08-23'
 WHERE name IN ('Domingo 08:30', 'Domingo 10:00') AND vigente_ate IS NULL;

-- ⚠️ O script do corte (Lote 5) completa: INSERT do tipo "Domingo 09:30" com
-- linhagem_key='domingo-0930', consolidacao_key='domingo-0930',
-- vigente_de=DATE '2026-08-24', has_kids/has_online/presencial_label corretos.

-- ── 3 · cultos_config (singleton · padrão app_config) + flag do véu ─────────
CREATE TABLE IF NOT EXISTS public.cultos_config (
  id boolean PRIMARY KEY DEFAULT true,
  -- O VÉU do redesenho de domingo: false = prévia (lentes + ocupação ofertada)
  -- visível SÓ pra super-admin; true = visível pra todos. Vira true no corte.
  lentes_domingo_publicas boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz,
  atualizado_por uuid,
  CONSTRAINT cultos_config_singleton CHECK (id = true)
);

INSERT INTO public.cultos_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.cultos_config IS
  'Config singleton do redesenho dos cultos de domingo (docs/cultos-domingo/). Destravar a prévia pra todos: UPDATE public.cultos_config SET lentes_domingo_publicas = true, atualizado_em = now() WHERE id = true;';

ALTER TABLE public.cultos_config ENABLE ROW LEVEL SECURITY;

-- catálogo de config sem PII: service_role opera; super-admin pode ler/escrever
-- direto (espelho do padrão da app_config · 20260807180000)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cultos_config' AND policyname = 'cultos_config_service') THEN
    CREATE POLICY cultos_config_service ON public.cultos_config
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cultos_config' AND policyname = 'cultos_config_super_admin') THEN
    CREATE POLICY cultos_config_super_admin ON public.cultos_config
      FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Conferência no CATÁLOGO (o SQL Editor não mostra NOTICE):
--
--   select name, is_active, vigente_de, vigente_ate, linhagem_key, consolidacao_key
--     from public.vol_service_types where recurrence_day = 0 order by recurrence_time;
--   -- esperado: 08:30 → cons 'domingo-0930' + ate 2026-08-23 · 10:00 → linh+cons
--   --           'domingo-0930' + ate 2026-08-23 · 11:30/19:00 → tudo NULL
--
--   select * from public.cultos_config;   -- 1 linha · lentes_domingo_publicas = false
--   select polname from pg_policies where tablename = 'cultos_config';
-- ============================================================================

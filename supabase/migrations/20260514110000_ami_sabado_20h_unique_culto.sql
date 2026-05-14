-- ============================================================================
-- AMI volta para sabado 20h + UNIQUE (service_type_id, data) em cultos
--
-- Marcos: "o culto do ami e aos sabados as 20 horas, pode mudar isso, acho
--          que eu mandei errado, garanta que cada culto tenha um id unico,
--          para compararmos uma serie historica de indicadores por culto"
--
-- Contexto: na migration anterior eu mudei AMI para domingo 19h baseado no
-- que o Marcos disse · ele acabou de corrigir. O original (e correto) e
-- sabado 20h. 33 cultos AMI domingo 19h foram gerados todos vazios.
--
-- Identidade unica do culto:
--   - cultos.id ja e uuid PRIMARY KEY (cada row tem id unico naturalmente)
--   - mas pra serie historica precisamos garantir que NAO existe 2 rows
--     pra mesmo slot logico (mesmo service_type na mesma data)
--   - solucao: UNIQUE (service_type_id, data)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reverter AMI para sabado 20h (recurrence_day=6, recurrence_time=20:00)
-- ----------------------------------------------------------------------------
UPDATE public.vol_service_types
   SET recurrence_day = 6,         -- sabado
       recurrence_time = '20:00:00',
       updated_at = now()
 WHERE name = 'AMI';

-- ----------------------------------------------------------------------------
-- 2. Deletar cultos AMI futuros vazios (gerados errado · 33 rows)
--    Protecao tripla:
--      a) so AMI (service_type_id especifico)
--      b) so futuros (data >= hoje)
--      c) so com TODOS os campos zerados (sem dados preenchidos)
-- ----------------------------------------------------------------------------
DELETE FROM public.cultos c
 WHERE c.service_type_id = (SELECT id FROM public.vol_service_types WHERE name = 'AMI')
   AND c.data >= CURRENT_DATE
   AND COALESCE(c.presencial_adulto, 0)    = 0
   AND COALESCE(c.presencial_kids, 0)      = 0
   AND COALESCE(c.decisoes_presenciais, 0) = 0
   AND COALESCE(c.decisoes_online, 0)      = 0
   AND COALESCE(c.visitantes, 0)           = 0
   AND COALESCE(c.visitantes_online, 0)    = 0
   AND COALESCE(c.voluntarios, 0)          = 0;

-- ----------------------------------------------------------------------------
-- 3. UNIQUE (service_type_id, data) · identidade unica do slot
--    Garantia estrutural pra serie historica · impossivel duplicar
--    o mesmo culto na mesma data, mesmo rodando gerar_cultos_recorrentes
--    varias vezes ou inserindo manualmente.
--
--    Usa DO block porque Postgres nao tem ADD CONSTRAINT IF NOT EXISTS
--    direto · checa pg_constraint pra evitar erro em re-run.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'uniq_culto_service_data'
       AND conrelid = 'public.cultos'::regclass
  ) THEN
    ALTER TABLE public.cultos
      ADD CONSTRAINT uniq_culto_service_data UNIQUE (service_type_id, data);
  END IF;
END $$;

COMMENT ON CONSTRAINT uniq_culto_service_data ON public.cultos IS
  'Garante 1 culto por (service_type, data) · serie historica nao ambigua';

-- ----------------------------------------------------------------------------
-- 4. Regerar cultos · funcao e idempotente, so cria os AMI sabado 20h
--    novos (resto ja existe, vai retornar status=ja_existia)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_inicio date := date_trunc('month', CURRENT_DATE)::date;
  v_fim    date := (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::date;
  v_criados int;
BEGIN
  SELECT count(*) INTO v_criados
    FROM public.gerar_cultos_recorrentes(v_inicio, v_fim) g
   WHERE g.out_status = 'criado';
  RAISE NOTICE 'Cultos AMI sabado 20h gerados de % a %: %', v_inicio, v_fim, v_criados;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (rodar no Studio depois):
--   SELECT name, recurrence_day, recurrence_time FROM vol_service_types WHERE name='AMI';
--     · Espera: recurrence_day=6 (sabado), recurrence_time=20:00:00
--
--   SELECT extract(dow FROM data) AS dow, count(*) FROM cultos
--    WHERE service_type_id=(SELECT id FROM vol_service_types WHERE name='AMI')
--      AND data >= CURRENT_DATE GROUP BY dow;
--     · Espera: dow=6 (sabado) com ~33 rows, dow=0 vazio
--
--   -- Tentativa de inserir duplicata · deve falhar:
--   INSERT INTO cultos (service_type_id, nome, data, hora) VALUES
--     ((SELECT id FROM vol_service_types WHERE name='AMI'),
--      'duplicate test', CURRENT_DATE + 7, '20:00');
--   INSERT INTO cultos (service_type_id, nome, data, hora) VALUES
--     ((SELECT id FROM vol_service_types WHERE name='AMI'),
--      'duplicate test 2', CURRENT_DATE + 7, '20:00');
--   · Espera: 2o INSERT falha com violacao de uniq_culto_service_data
-- ============================================================================

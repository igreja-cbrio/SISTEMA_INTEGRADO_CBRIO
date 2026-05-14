-- ============================================================================
-- Visitantes vinculados a cultos + gerar cultos recorrentes
--
-- Marcos: "coloque a area de visitantes tambem vinculado aos cultos e
--          lance culto todos os horarios que eu pedi, coloque como recorrentes"
--
-- Horarios pedidos:
--   - Domingo: 08:30, 10:00, 11:30, 19:00  (Sede)
--   - Domingo 19:00 AMI  (paralelo ao Sede)
--   - Quarta 20:00  (Quarta com Deus)
--   - Sabado 17:00 Bridge
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ajusta AMI · de sabado 20h para domingo 19h (conforme Marcos especificou)
--    Original: recurrence_day=6 (sabado), recurrence_time=20:00:00
-- ----------------------------------------------------------------------------
UPDATE public.vol_service_types
   SET recurrence_day = 0,  -- domingo
       recurrence_time = '19:00:00',
       updated_at = now()
 WHERE name = 'AMI';

-- ----------------------------------------------------------------------------
-- 2. Vincula visitante ao culto (opcional · pode ser cadastrado fora de culto)
-- ----------------------------------------------------------------------------
ALTER TABLE public.int_visitantes
  ADD COLUMN IF NOT EXISTS culto_id uuid REFERENCES public.cultos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_int_visitantes_culto
  ON public.int_visitantes (culto_id)
  WHERE culto_id IS NOT NULL;

COMMENT ON COLUMN public.int_visitantes.culto_id IS
  'Culto em que o visitante veio · alimenta KPI de visitantes por culto.';

-- ----------------------------------------------------------------------------
-- 3. Funcao gerar_cultos_recorrentes(data_inicio, data_fim)
--    Cria 1 row em public.cultos pra cada (service_type_ativo · ocorrencia
--    do dia da semana no range), pulando os que ja existem.
--    Idempotente · pode rodar varias vezes sem duplicar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_cultos_recorrentes(
  p_data_inicio date,
  p_data_fim    date
)
RETURNS TABLE(
  service_type text,
  data         date,
  status       text  -- 'criado' | 'ja_existia'
)
LANGUAGE plpgsql AS $$
DECLARE
  v_st       record;
  v_data     date;
  v_existe   boolean;
  v_nome     text;
BEGIN
  IF p_data_inicio > p_data_fim THEN
    RAISE EXCEPTION 'data_inicio > data_fim';
  END IF;

  FOR v_st IN
    SELECT id, name, recurrence_day, recurrence_time
      FROM public.vol_service_types
     WHERE is_active = true
       AND recurrence_day IS NOT NULL
       AND recurrence_time IS NOT NULL
  LOOP
    -- Itera dia a dia, mas o filtro de dia da semana faz pular rapido
    v_data := p_data_inicio;
    WHILE v_data <= p_data_fim LOOP
      IF extract(dow FROM v_data)::int = v_st.recurrence_day THEN
        -- Confere se ja existe esse (service_type_id, data)
        SELECT EXISTS (
          SELECT 1 FROM public.cultos
           WHERE service_type_id = v_st.id
             AND data = v_data
        ) INTO v_existe;

        IF NOT v_existe THEN
          v_nome := v_st.name || ' — ' || to_char(v_data, 'DD/MM/YYYY');
          INSERT INTO public.cultos (
            service_type_id, nome, data, hora,
            presencial_adulto, presencial_kids,
            decisoes_presenciais, decisoes_online,
            visitantes, visitantes_online, voluntarios
          ) VALUES (
            v_st.id, v_nome, v_data, v_st.recurrence_time,
            0, 0, 0, 0, 0, 0, 0
          );
          service_type := v_st.name;
          data         := v_data;
          status       := 'criado';
          RETURN NEXT;
        ELSE
          service_type := v_st.name;
          data         := v_data;
          status       := 'ja_existia';
          RETURN NEXT;
        END IF;
      END IF;
      v_data := v_data + INTERVAL '1 day';
    END LOOP;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.gerar_cultos_recorrentes IS
  'Gera cultos recorrentes para o range · idempotente · usa vol_service_types ativos';

-- ----------------------------------------------------------------------------
-- 4. Roda agora · gera cultos do mes atual ate fim do ano
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_inicio date := date_trunc('month', CURRENT_DATE)::date;
  v_fim    date := (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day')::date;
  v_criados int;
BEGIN
  SELECT count(*) INTO v_criados
    FROM public.gerar_cultos_recorrentes(v_inicio, v_fim)
   WHERE status = 'criado';
  RAISE NOTICE 'Cultos recorrentes gerados de % a %: %', v_inicio, v_fim, v_criados;
END $$;

-- ----------------------------------------------------------------------------
-- Conferencia (descomenta no Studio):
--   SELECT * FROM vol_service_types WHERE name = 'AMI';
--     · Espera: recurrence_day=0 (domingo), recurrence_time=19:00:00
--
--   SELECT extract(dow FROM data) AS dow, count(*) FROM cultos
--    WHERE data >= CURRENT_DATE GROUP BY dow ORDER BY dow;
--     · Espera: domingos (0), quartas (3), sabados (6) com varios cultos
--
--   SELECT service_type_name, count(*) FROM vw_culto_stats
--    WHERE data >= CURRENT_DATE GROUP BY service_type_name ORDER BY 2 DESC;
--     · Espera: cada tipo com ~30+ cultos no resto do ano
-- ============================================================================

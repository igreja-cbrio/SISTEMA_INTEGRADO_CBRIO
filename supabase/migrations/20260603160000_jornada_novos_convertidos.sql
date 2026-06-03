-- ============================================================================
-- Jornada do novo convertido · primeiros 90 dias + responsabilidade por área
-- ============================================================================
-- Marcos: medir 3 marcos por novo convertido, a partir da data da conversão:
--   1. Contato pastoral (marcar a reunião)  ≤ 3 dias
--   2. Batismo                              ≤ 90 dias
--   3. Next                                 ≤ 90 dias
--
-- Responsabilidade segue a ÁREA DE CULTO onde a pessoa se converteu:
--   AMI→Arthur · Online→Renata · Bridge→Lillian · Domingo/Sede→Marcelo.
-- Marcelo Soares (supervisor-jornada) acompanha tudo de Cuidados e cobra
-- quem não fez o contato.
--
-- Esta migration:
--   1) cui_convertidos += area (classifica de onde veio) + primeiro_contato_em/por
--      (relógio do contato de 3 dias).
--   2) Trigger que cria o convertido passa a gravar a area.
--   3) Backfill da area dos convertidos existentes (best-effort pelo culto).
-- Aditiva · idempotente. Kids continua FORA (LGPD · não vira convertido).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas
-- ----------------------------------------------------------------------------
ALTER TABLE public.cui_convertidos
  ADD COLUMN IF NOT EXISTS area                 text,
  ADD COLUMN IF NOT EXISTS primeiro_contato_em  timestamptz,
  ADD COLUMN IF NOT EXISTS primeiro_contato_por uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_cui_conv_area ON public.cui_convertidos(area) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.cui_convertidos.area IS
  'Área de culto da conversão · ami/bridge/online/sede · define o líder que acompanha os 90 dias';
COMMENT ON COLUMN public.cui_convertidos.primeiro_contato_em IS
  'Quando o pastor fez o 1º contato (agendou o encontro) · base do SLA de 3 dias';

-- ----------------------------------------------------------------------------
-- 2. Trigger · grava a area ao criar o convertido a partir da decisão de culto
--    (online se a decisão foi online; senão pelo nome do tipo de culto)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_to_cuidados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_culto date;
  v_st_name    text;
  v_area       text;
BEGIN
  -- Kids fora · LGPD
  IF COALESCE(NEW.tipo_decisao, 'presencial') = 'kids' THEN
    RETURN NEW;
  END IF;

  SELECT c.data, st.name INTO v_data_culto, v_st_name
    FROM public.cultos c
    LEFT JOIN public.vol_service_types st ON st.id = c.service_type_id
   WHERE c.id = NEW.culto_id;
  IF v_data_culto IS NULL THEN
    RETURN NEW;
  END IF;

  -- Classifica a área de culto
  IF COALESCE(NEW.tipo_decisao, 'presencial') = 'online' THEN
    v_area := 'online';
  ELSIF v_st_name ILIKE '%ami%' THEN
    v_area := 'ami';
  ELSIF v_st_name ILIKE '%bridge%' THEN
    v_area := 'bridge';
  ELSE
    v_area := 'sede';   -- domingo, quarta com Deus, etc
  END IF;

  -- Dedup · por membro_id ou nome+data
  IF EXISTS (
    SELECT 1 FROM public.cui_convertidos cv
    WHERE (NEW.membro_id IS NOT NULL AND cv.membro_id = NEW.membro_id)
       OR (
         NEW.membro_id IS NULL
         AND lower(trim(cv.nome)) = lower(trim(NEW.nome))
         AND cv.data_culto = v_data_culto
       )
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cui_convertidos
    (data_culto, culto_id, membro_id, nome, telefone, cpf,
     atendido_apos_culto, cadastrado, observacoes, area)
  VALUES
    (v_data_culto, NEW.culto_id, NEW.membro_id, TRIM(NEW.nome),
     NEW.telefone, NEW.cpf,
     false,
     (NEW.membro_id IS NOT NULL),
     NEW.observacoes,
     v_area);

  RETURN NEW;
END $$;

-- (o trigger z_dec_pessoas_to_cuidados já aponta pra essa função · não recriar)

-- ----------------------------------------------------------------------------
-- 3. Backfill da area dos convertidos existentes
--    a) pelo tipo de culto (onde area ainda é NULL e há culto vinculado)
--    b) override 'online' pros que vieram de decisão online (best-effort)
-- ----------------------------------------------------------------------------
UPDATE public.cui_convertidos cv
   SET area = CASE
     WHEN st.name ILIKE '%ami%'    THEN 'ami'
     WHEN st.name ILIKE '%bridge%' THEN 'bridge'
     ELSE 'sede'
   END
  FROM public.cultos c
  LEFT JOIN public.vol_service_types st ON st.id = c.service_type_id
 WHERE cv.culto_id = c.id
   AND cv.area IS NULL;

UPDATE public.cui_convertidos cv
   SET area = 'online'
  FROM public.cultos_decisoes_pessoas dp
  JOIN public.cultos c ON c.id = dp.culto_id
 WHERE dp.tipo_decisao = 'online'
   AND cv.area IS DISTINCT FROM 'online'
   AND (
     (cv.membro_id IS NOT NULL AND cv.membro_id = dp.membro_id)
     OR (cv.membro_id IS NULL
         AND lower(trim(cv.nome)) = lower(trim(dp.nome))
         AND cv.data_culto = c.data)
   );

-- ----------------------------------------------------------------------------
-- Conferência (rodar após aplicar):
--   SELECT area, count(*) FROM cui_convertidos WHERE deleted_at IS NULL GROUP BY area;
--   -- esperado: linhas pra ami/bridge/online/sede (+ NULL pros sem culto vinculado)
-- ============================================================================

-- ============================================================================
-- BATISMO · categoria etária com as 4 faixas da igreja (2026-08-19)
--
-- Faixas definidas pelo Matheus:
--   Criança      0 a 12 anos, 11 meses e 29 dias   (idade < 13)
--   Adolescente  13 a 17 anos, 11 meses e 29 dias  (13 a 17)
--   Jovem        18 a 25 anos, 11 meses e 29 dias  (18 a 25)
--   Adulto       26 em diante                      (>= 26)
--
-- ⚠️ O que existia divergia nas DUAS pontas: não havia `jovem`, e os cortes
-- eram `< 12` criança · `12 a 18` adolescente · `> 18` adulto. Ou seja, quem
-- tinha 12 anos era adolescente e quem tinha 18 também — os dois passam a estar
-- na faixa certa.
--
-- ⚠️ `EXTRACT(YEAR FROM age(...))` devolve anos COMPLETOS, então "12 anos, 11
-- meses e 29 dias" é 12 e cai em criança sem precisar de conta de dias.
--
-- ⚠️ `eh_crianca = true` continua mandando (é declaração de quem cadastrou, e o
-- fluxo do Kids depende dela): a data de nascimento só decide quando essa marca
-- não está lá.
--
-- ⚠️ A coluna é um SNAPSHOT — quem é jovem hoje vira adulto aos 26 e a linha
-- não se atualiza sozinha (o trigger só roda em INSERT/UPDATE). Por isso a TELA
-- deriva da data de nascimento sempre que ela existe, e só cai na coluna quando
-- não há data. Aqui o valor é mantido para quem lê a tabela direto (exports,
-- consultas, o app do staff).
-- ============================================================================

-- 1) CHECK aceita a faixa nova
ALTER TABLE public.batismo_inscricoes
  DROP CONSTRAINT IF EXISTS batismo_inscricoes_categoria_etaria_check;

ALTER TABLE public.batismo_inscricoes
  ADD CONSTRAINT batismo_inscricoes_categoria_etaria_check
  CHECK (categoria_etaria IS NULL OR categoria_etaria = ANY (ARRAY['crianca','adolescente','jovem','adulto']));

-- 2) Trigger com as 4 faixas
CREATE OR REPLACE FUNCTION public.tg_batismo_categoria_etaria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_idade int;
BEGIN
  -- Declaração de quem cadastrou vence a data (fluxo do Kids depende disso).
  IF NEW.eh_crianca = true THEN
    NEW.categoria_etaria := 'crianca';
    RETURN NEW;
  END IF;

  IF NEW.data_nascimento IS NULL THEN RETURN NEW; END IF;

  -- Anos COMPLETOS: 12a11m29d = 12.
  v_idade := EXTRACT(YEAR FROM age(NEW.data_nascimento))::int;

  IF    v_idade < 13 THEN NEW.categoria_etaria := 'crianca';
  ELSIF v_idade < 18 THEN NEW.categoria_etaria := 'adolescente';
  ELSIF v_idade < 26 THEN NEW.categoria_etaria := 'jovem';
  ELSE                    NEW.categoria_etaria := 'adulto';
  END IF;

  RETURN NEW;
END $function$;

COMMENT ON FUNCTION public.tg_batismo_categoria_etaria() IS
  'Categoria etaria do batizando pela data de nascimento (faixas da igreja, 19/08/2026): crianca <13 · adolescente 13-17 · jovem 18-25 · adulto 26+. eh_crianca=true vence a data. Espelho em src/lib/categoriaBatismo.ts — mudou aqui, muda la.';

-- 3) Recalcula o que já está gravado pela régua antiga (só onde muda)
DO $$
DECLARE
  v_n int;
BEGIN
  UPDATE public.batismo_inscricoes b
     SET categoria_etaria = CASE
           WHEN b.eh_crianca = true THEN 'crianca'
           WHEN EXTRACT(YEAR FROM age(b.data_nascimento))::int < 13 THEN 'crianca'
           WHEN EXTRACT(YEAR FROM age(b.data_nascimento))::int < 18 THEN 'adolescente'
           WHEN EXTRACT(YEAR FROM age(b.data_nascimento))::int < 26 THEN 'jovem'
           ELSE 'adulto'
         END
   WHERE (b.data_nascimento IS NOT NULL OR b.eh_crianca = true)
     AND b.categoria_etaria IS DISTINCT FROM CASE
           WHEN b.eh_crianca = true THEN 'crianca'
           WHEN EXTRACT(YEAR FROM age(b.data_nascimento))::int < 13 THEN 'crianca'
           WHEN EXTRACT(YEAR FROM age(b.data_nascimento))::int < 18 THEN 'adolescente'
           WHEN EXTRACT(YEAR FROM age(b.data_nascimento))::int < 26 THEN 'jovem'
           ELSE 'adulto'
         END;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'categoria_etaria recalculada em % inscricoes', v_n;
END $$;

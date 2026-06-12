-- ============================================================================
-- Batismos · categoria etaria, tamanho de camisa, deficiencia
--
-- Marcos: adicionar na inscricao de batismo:
--   - Tamanho da camisa (campo proprio · sai das observacoes)
--   - Categoria etaria · auto-calculada de data_nascimento:
--       <12 anos -> crianca
--       12-18    -> adolescente
--       >18      -> adulto
--     Pode ser forcado a 'crianca' via flag eh_crianca (uso quando nao
--     tem data de nascimento mas o time sabe)
--   - Deficiencia · flag + descricao livre · pinta o nome na lista
--   - Endereco · campo proprio (estava nas observacoes)
--
-- Tambem backfilla dados existentes parseando observacoes da planilha
-- seed (PR #470 e batismos historicos).
-- ============================================================================

-- 1) Colunas novas
ALTER TABLE public.batismo_inscricoes
  ADD COLUMN IF NOT EXISTS tamanho_camisa        text,
  ADD COLUMN IF NOT EXISTS eh_crianca            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS categoria_etaria      text
    CHECK (categoria_etaria IS NULL OR categoria_etaria IN ('crianca','adolescente','adulto')),
  ADD COLUMN IF NOT EXISTS possui_deficiencia    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deficiencia_descricao text,
  ADD COLUMN IF NOT EXISTS endereco              text;

-- 2) Funcao + trigger · recalcula categoria_etaria sempre que muda
--    data_nascimento ou eh_crianca
CREATE OR REPLACE FUNCTION public.tg_batismo_categoria_etaria()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_idade int;
BEGIN
  -- Override manual: marcou como crianca, sempre eh crianca
  IF NEW.eh_crianca = true THEN
    NEW.categoria_etaria := 'crianca';
    RETURN NEW;
  END IF;

  IF NEW.data_nascimento IS NULL THEN
    -- Sem data, mantem o que veio (NULL ou valor explicito)
    RETURN NEW;
  END IF;

  v_idade := EXTRACT(YEAR FROM age(NEW.data_nascimento))::int;

  IF v_idade < 12 THEN
    NEW.categoria_etaria := 'crianca';
  ELSIF v_idade BETWEEN 12 AND 18 THEN
    NEW.categoria_etaria := 'adolescente';
  ELSE
    NEW.categoria_etaria := 'adulto';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS batismo_categoria_etaria ON public.batismo_inscricoes;
CREATE TRIGGER batismo_categoria_etaria
  BEFORE INSERT OR UPDATE OF data_nascimento, eh_crianca ON public.batismo_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_batismo_categoria_etaria();

-- 3) Backfill · extrai das observacoes existentes
DO $$
DECLARE
  r RECORD;
  v_camisa text;
  v_endereco text;
  v_limitacao text;
  v_eh_crianca boolean;
  v_obs_clean text;
  v_idade int;
BEGIN
  FOR r IN
    SELECT id, observacoes, data_nascimento
      FROM public.batismo_inscricoes
     WHERE observacoes IS NOT NULL
       AND (tamanho_camisa IS NULL OR endereco IS NULL OR (deficiencia_descricao IS NULL AND possui_deficiencia = false))
  LOOP
    v_obs_clean := r.observacoes;

    -- Camisa: pega valor depois de "Camisa:" ate o proximo ". " ou fim
    v_camisa := substring(r.observacoes from 'Camisa[:\s]+([A-Za-z0-9\-]+)');

    -- Endereco: pega ate o proximo ponto-final seguido de espaco e maiuscula
    v_endereco := substring(r.observacoes from 'Endere[cç]o[:\s]+([^.]+?)(?:\.\s|$)');
    IF v_endereco IS NOT NULL THEN
      v_endereco := trim(v_endereco);
    END IF;

    -- Limitacao / deficiencia
    v_limitacao := substring(r.observacoes from 'Limita[cç][aã]o[:\s]+([^.]+?)(?:\.\s|$)');
    IF v_limitacao IS NULL THEN
      v_limitacao := substring(r.observacoes from 'Defici[eê]ncia[:\s]+([^.]+?)(?:\.\s|$)');
    END IF;
    IF v_limitacao IS NOT NULL THEN
      v_limitacao := trim(v_limitacao);
    END IF;

    -- eh_crianca: observacao menciona crianca/criança/kids · so marca se
    -- nao tem data_nascimento OU se a idade calculada da nascimento ja
    -- e <12 (consistente)
    v_eh_crianca := r.observacoes ~* '(crian[cç]a|kids|infantil)';
    IF r.data_nascimento IS NOT NULL THEN
      v_idade := EXTRACT(YEAR FROM age(r.data_nascimento))::int;
      -- Se tem nascimento e idade ja indica nao-crianca, ignora o texto
      IF v_idade >= 12 THEN v_eh_crianca := false; END IF;
    END IF;

    UPDATE public.batismo_inscricoes SET
      tamanho_camisa        = COALESCE(tamanho_camisa, NULLIF(upper(v_camisa), '')),
      endereco              = COALESCE(endereco, NULLIF(v_endereco, '')),
      possui_deficiencia    = possui_deficiencia OR (v_limitacao IS NOT NULL AND v_limitacao <> ''),
      deficiencia_descricao = COALESCE(deficiencia_descricao, NULLIF(v_limitacao, '')),
      eh_crianca            = eh_crianca OR COALESCE(v_eh_crianca, false)
    WHERE id = r.id;
  END LOOP;
END $$;

-- 4) Recalcula categoria_etaria pra rows existentes (touch via UPDATE no-op
--    pra disparar o trigger)
UPDATE public.batismo_inscricoes SET eh_crianca = eh_crianca
 WHERE categoria_etaria IS NULL OR true;

-- 5) Indices para filtros
CREATE INDEX IF NOT EXISTS idx_batismo_categoria ON public.batismo_inscricoes (categoria_etaria);
CREATE INDEX IF NOT EXISTS idx_batismo_deficiencia ON public.batismo_inscricoes (possui_deficiencia) WHERE possui_deficiencia = true;

COMMENT ON COLUMN public.batismo_inscricoes.categoria_etaria IS
  'crianca/adolescente/adulto · calculado por trigger de data_nascimento + eh_crianca. <12 ou eh_crianca=true → crianca; 12-18 → adolescente; >18 → adulto.';
COMMENT ON COLUMN public.batismo_inscricoes.eh_crianca IS
  'Override manual · marca como crianca mesmo sem data de nascimento.';
COMMENT ON COLUMN public.batismo_inscricoes.possui_deficiencia IS
  'Pinta o nome em vermelho na lista de batismos · alerta para o time de integracao.';

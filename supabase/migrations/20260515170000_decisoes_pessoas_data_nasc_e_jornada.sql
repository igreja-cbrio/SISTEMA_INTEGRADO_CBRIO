-- ============================================================================
-- Decisoes de Cristo no culto · tracking completo da jornada
--
-- Marcos pediu: ao registrar quem decidiu Jesus num culto, capturar nome
-- completo + CPF + data de nascimento, e fazer o cruzamento automático
-- com a jornada (mem_membros, mem_trilha_valores, nsm_eventos).
--
-- O que muda:
-- 1. Adiciona coluna data_nascimento em cultos_decisoes_pessoas (chave estavel
--    pra cruzamento · idade nao serve porque muda com o tempo).
-- 2. BEFORE INSERT: resolve/cria membro_id automaticamente
--    - Tenta match por CPF -> email -> nada
--    - Se nada, cria mem_membros novo (status='visitante')
-- 3. AFTER INSERT: cria trilha de conversao + evento NSM
--    - mem_trilha_valores etapa='conversao' concluida=true
--    - nsm_eventos valor_engajado='seguir' data_decisao=data_culto
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Coluna data_nascimento
-- ----------------------------------------------------------------------------
ALTER TABLE public.cultos_decisoes_pessoas
  ADD COLUMN IF NOT EXISTS data_nascimento date;

-- Indice ajuda nas buscas de cruzamento (encontrar pessoa por nome + data_nasc)
CREATE INDEX IF NOT EXISTS idx_cultos_dec_pessoas_data_nasc
  ON public.cultos_decisoes_pessoas (data_nascimento)
  WHERE data_nascimento IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. BEFORE INSERT · resolve/cria membro_id
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_resolve_membro()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_membro_id uuid;
  v_cpf_limpo text;
BEGIN
  -- Normaliza CPF (so digitos)
  IF NEW.cpf IS NOT NULL THEN
    v_cpf_limpo := regexp_replace(NEW.cpf, '\D', '', 'g');
    IF length(v_cpf_limpo) = 11 THEN
      NEW.cpf := v_cpf_limpo;
    ELSE
      NEW.cpf := NULL;
    END IF;
  END IF;

  -- Se ja veio com membro_id explicito (via UI de busca), respeita
  IF NEW.membro_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) Tenta match por CPF exato
  IF NEW.cpf IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE cpf = NEW.cpf
     LIMIT 1;
  END IF;

  -- 2) Tenta match por email
  IF v_membro_id IS NULL AND NEW.email IS NOT NULL AND length(NEW.email) > 3 THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE lower(email) = lower(NEW.email)
     LIMIT 1;
  END IF;

  -- 3) Tenta match por nome + data_nascimento (criterio estavel)
  IF v_membro_id IS NULL AND NEW.data_nascimento IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE lower(nome) = lower(NEW.nome)
       AND data_nascimento = NEW.data_nascimento
     LIMIT 1;
  END IF;

  -- 4) Cria membro novo (status visitante) com os dados disponiveis
  IF v_membro_id IS NULL THEN
    INSERT INTO public.mem_membros (
      nome, email, telefone, cpf, data_nascimento, status
    ) VALUES (
      NEW.nome,
      NEW.email,
      NEW.telefone,
      NEW.cpf,
      NEW.data_nascimento,
      'visitante'
    ) RETURNING id INTO v_membro_id;
  END IF;

  NEW.membro_id := v_membro_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cultos_dec_pessoas_resolve_membro ON public.cultos_decisoes_pessoas;
CREATE TRIGGER cultos_dec_pessoas_resolve_membro
  BEFORE INSERT ON public.cultos_decisoes_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.tg_cultos_dec_pessoas_resolve_membro();

-- ----------------------------------------------------------------------------
-- 3. AFTER INSERT · cria trilha 'conversao' + nsm_eventos 'seguir'
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_jornada()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_data_culto date;
BEGIN
  -- Data do culto pra usar como data de decisao
  SELECT data INTO v_data_culto
    FROM public.cultos
   WHERE id = NEW.culto_id;

  IF v_data_culto IS NULL THEN
    v_data_culto := CURRENT_DATE;
  END IF;

  -- Trilha de conversao · cria se nao existe (idempotente)
  IF NOT EXISTS (
    SELECT 1 FROM public.mem_trilha_valores
     WHERE membro_id = NEW.membro_id AND etapa = 'conversao'
  ) THEN
    INSERT INTO public.mem_trilha_valores (
      membro_id, etapa, concluida, data_conclusao, observacoes
    ) VALUES (
      NEW.membro_id,
      'conversao',
      true,
      v_data_culto,
      'Decisao registrada no culto (cultos_decisoes_pessoas.id=' || NEW.id::text || ')'
    );
  END IF;

  -- Evento NSM · so cria se nao existe (origem+origem_id como chave logica)
  IF NOT EXISTS (
    SELECT 1 FROM public.nsm_eventos
     WHERE origem = 'culto_decisao' AND origem_id = NEW.id
  ) THEN
    INSERT INTO public.nsm_eventos (
      membro_id, cpf, nome,
      data_decisao, valor_engajado, data_engajamento,
      origem, origem_id, observacao
    ) VALUES (
      NEW.membro_id,
      NEW.cpf,
      NEW.nome,
      v_data_culto,
      'seguir',
      v_data_culto,
      'culto_decisao',
      NEW.id,
      'Decisao de Cristo registrada via modal de culto'
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cultos_dec_pessoas_jornada ON public.cultos_decisoes_pessoas;
CREATE TRIGGER cultos_dec_pessoas_jornada
  AFTER INSERT ON public.cultos_decisoes_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.tg_cultos_dec_pessoas_jornada();

-- ----------------------------------------------------------------------------
-- Conferencia:
--   \d cultos_decisoes_pessoas
--   SELECT trigger_name FROM information_schema.triggers
--    WHERE event_object_table = 'cultos_decisoes_pessoas';
-- ============================================================================

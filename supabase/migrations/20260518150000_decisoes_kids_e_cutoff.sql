-- ============================================================================
-- Decisões Kids · cutoff temporal · dados do responsável
--
-- Marcos: "usa a data de hoje como base, não vamos conseguir pegar dados
--          passados, mas de hoje pra cá todo convertido deve ser preenchido.
--          Na janela de decisão também deve incluir o kids · separe essas
--          decisões pois vamos salvar pelos dados do responsável dela e
--          apenas o nome da criança. Crianças dificilmente seguirão a jornada
--          então não devem afetar o NSM. Dados de criança são mais complicados
--          pela LGPD".
--
-- Mudanças:
--   1. tipo_decisao ganha 'kids' (era só presencial/online)
--   2. Colunas novas em cultos_decisoes_pessoas:
--      - responsavel_nome, responsavel_telefone, responsavel_cpf
--      (preenchidos quando tipo='kids' · LGPD: criança não dá os dados dela)
--   3. cultos ganha decisoes_kids int (agregado separado)
--   4. Trigger resolve_membro pula se tipo='kids' (NÃO cria mem_membros
--      automaticamente · LGPD com menores)
--   5. Trigger jornada pula se tipo='kids' (NÃO cria trilha nem nsm_eventos)
--   6. vw_nsm_sem_dados:
--      - Cutoff data_culto >= 2026-05-18 (Marcos: "de hoje pra cá")
--      - Conta só tipo IN ('presencial','online') em total_registradas
--      - decisoes_kids fica em coluna separada (UI mostra mas não vira gap)
--   7. recalcular_nsm() inalterada · já soma só presenciais+online · kids
--      naturalmente fica de fora do denominador
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum/CHECK · tipo_decisao aceita 'kids'
-- ----------------------------------------------------------------------------
ALTER TABLE public.cultos_decisoes_pessoas
  DROP CONSTRAINT IF EXISTS cultos_decisoes_pessoas_tipo_decisao_check;

ALTER TABLE public.cultos_decisoes_pessoas
  ADD CONSTRAINT cultos_decisoes_pessoas_tipo_decisao_check
  CHECK (tipo_decisao IN ('presencial', 'online', 'kids'));

-- ----------------------------------------------------------------------------
-- 2. Colunas do responsável (quando tipo='kids')
-- ----------------------------------------------------------------------------
ALTER TABLE public.cultos_decisoes_pessoas
  ADD COLUMN IF NOT EXISTS responsavel_nome      text,
  ADD COLUMN IF NOT EXISTS responsavel_telefone  text,
  ADD COLUMN IF NOT EXISTS responsavel_cpf       text;

-- ----------------------------------------------------------------------------
-- 3. Agregado decisoes_kids em cultos
-- ----------------------------------------------------------------------------
ALTER TABLE public.cultos
  ADD COLUMN IF NOT EXISTS decisoes_kids int NOT NULL DEFAULT 0
    CHECK (decisoes_kids >= 0);

-- ----------------------------------------------------------------------------
-- 4. Trigger resolve_membro · pula tipo='kids'
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

  -- Normaliza CPF do responsavel (so digitos)
  IF NEW.responsavel_cpf IS NOT NULL THEN
    v_cpf_limpo := regexp_replace(NEW.responsavel_cpf, '\D', '', 'g');
    IF length(v_cpf_limpo) = 11 THEN
      NEW.responsavel_cpf := v_cpf_limpo;
    ELSE
      NEW.responsavel_cpf := NULL;
    END IF;
  END IF;

  -- KIDS: NÃO cria mem_membros automaticamente (LGPD com menores).
  -- A criança fica registrada em cultos_decisoes_pessoas para contagem,
  -- mas não vira membro automaticamente. Pastoral pode promover manualmente
  -- via Membresia se/quando apropriado.
  IF NEW.tipo_decisao = 'kids' THEN
    NEW.membro_id := NULL;
    RETURN NEW;
  END IF;

  -- Se já veio com membro_id explícito (via UI de busca), respeita
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

  -- 4) Cria membro novo (status visitante) com os dados disponíveis
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

-- ----------------------------------------------------------------------------
-- 5. Trigger jornada · pula tipo='kids' (não cria trilha nem nsm_eventos)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_jornada()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_data_culto date;
BEGIN
  -- KIDS: não cria trilha de conversão nem nsm_eventos.
  -- Marcos: "crianças dificilmente seguirão a jornada · não são voluntárias,
  -- não fazem devocional, não doam por pix · não devem afetar o NSM".
  IF NEW.tipo_decisao = 'kids' THEN
    RETURN NEW;
  END IF;

  -- Sem membro_id (caso a UI passou membro_id=null e nem match nem criação
  -- aconteceram · não deveria, mas defesa em profundidade) · sem trilha.
  IF NEW.membro_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Data do culto pra usar como data de decisão
  SELECT data INTO v_data_culto
    FROM public.cultos
   WHERE id = NEW.culto_id;

  IF v_data_culto IS NULL THEN
    v_data_culto := CURRENT_DATE;
  END IF;

  -- Trilha de conversão · cria se não existe (idempotente)
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

  -- Evento NSM · só cria se não existe (origem+origem_id como chave lógica)
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

-- ----------------------------------------------------------------------------
-- 6. View vw_nsm_sem_dados · cutoff 2026-05-18 + exclui kids
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_nsm_sem_dados;

CREATE VIEW public.vw_nsm_sem_dados AS
SELECT
  c.id              AS culto_id,
  c.data            AS data_culto,
  c.nome            AS culto_nome,
  c.service_type_id,
  vst.name          AS service_type_name,
  vst.color         AS service_type_color,
  c.decisoes_presenciais,
  c.decisoes_online,
  c.decisoes_kids,
  (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) AS total_decisoes,
  -- Só conta presencial/online em total_registradas · kids fica em coluna própria
  COALESCE(p.total_registradas, 0) AS total_registradas,
  COALESCE(p.com_membro_vinculado, 0) AS com_membro_vinculado,
  COALESCE(p.total_kids_registrados, 0) AS kids_registrados,
  (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0))
    - COALESCE(p.total_registradas, 0) AS sem_dados,
  -- Kids tem seu próprio gap (independente do principal)
  COALESCE(c.decisoes_kids, 0) - COALESCE(p.total_kids_registrados, 0) AS kids_sem_dados,
  CASE
    WHEN (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) = 0 THEN 'sem_decisoes'
    WHEN COALESCE(p.total_registradas, 0) = 0 THEN 'nenhuma_registrada'
    WHEN COALESCE(p.total_registradas, 0) < (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) THEN 'parcial'
    ELSE 'completo'
  END AS gap_status
FROM public.cultos c
LEFT JOIN public.vol_service_types vst ON vst.id = c.service_type_id
LEFT JOIN (
  SELECT
    culto_id,
    -- Só conta presencial/online no agregado principal
    COUNT(*) FILTER (WHERE tipo_decisao IN ('presencial','online')) AS total_registradas,
    COUNT(membro_id) FILTER (WHERE tipo_decisao IN ('presencial','online')) AS com_membro_vinculado,
    -- Kids fica em coluna separada
    COUNT(*) FILTER (WHERE tipo_decisao = 'kids') AS total_kids_registrados
  FROM public.cultos_decisoes_pessoas
  GROUP BY culto_id
) p ON p.culto_id = c.id
WHERE c.data <= current_date
  AND c.data >= DATE '2026-05-18'    -- cutoff · "de hoje pra cá" (2026-05-18)
  AND (
    (c.decisoes_presenciais + COALESCE(c.decisoes_online, 0)) > 0
    OR COALESCE(c.decisoes_kids, 0) > 0
  );

GRANT SELECT ON public.vw_nsm_sem_dados TO authenticated, service_role;

COMMENT ON VIEW public.vw_nsm_sem_dados IS
  'Cultos com decisões a registrar · cutoff 2026-05-18 (Marcos: de hoje pra ca). Kids em coluna separada (decisoes_kids, kids_registrados, kids_sem_dados) · nao entra no gap_status nem no NSM.';

-- ----------------------------------------------------------------------------
-- Conferência:
--   \d cultos_decisoes_pessoas    -- ve as 3 colunas responsavel_*
--   \d cultos                     -- ve decisoes_kids
--   SELECT * FROM vw_nsm_sem_dados ORDER BY data_culto DESC LIMIT 5;
--   SELECT count(*) FROM vw_nsm_sem_dados;  -- so cultos >= 2026-05-18
-- ============================================================================

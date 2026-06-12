-- ============================================================================
-- 20260515500000_promover_voluntarios_batizados.sql
--
-- Fecha 2 gaps de automacao:
--
-- GAP A · vol_profiles sem mem_membros
--   Voluntario completa perfil (cpf, phone, email) mas nao havia trigger
--   que linkasse/criasse mem_membros automaticamente. So tinha backfill
--   manual via email. Agora trigger faz isso em todo INSERT/UPDATE.
--
-- GAP B · batismo_inscricoes sem mem_membros
--   Trigger existente trg_batismo_realizado promove status pra 'membro_ativo'
--   MAS so se membro_id ja existir. Se alguem se inscreve direto pro batismo
--   sem ser membro, o trigger nao dispara. Agora outro trigger garante o link
--   antes (no INSERT/UPDATE da inscricao).
--
-- Estrategia comum:
--   1. fn_link_or_create_membro(cpf, telefone, email, nome) -> uuid
--      Tenta match por CPF, telefone, depois email. Se nada bater, cria.
--   2. Trigger em vol_profiles · preenche membresia_id se NULL
--   3. Trigger em batismo_inscricoes · preenche membro_id se NULL
--   4. Backfill idempotente pros registros antigos sem link
--
-- IMPORTANTE: backwards-compatible. Tudo COALESCE/NULLIF.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- Helper · normaliza telefone (so digitos)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_normalizar_telefone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Helper · tenta match por CPF/telefone/email · cria se nao achar
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_link_or_create_membro(
  p_cpf text,
  p_telefone text,
  p_email text,
  p_nome text,
  p_status_inicial text DEFAULT 'novo',
  p_fonte text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_membro_id uuid;
  v_cpf text;
  v_tel text;
  v_email text;
BEGIN
  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_tel := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');

  -- 1. CPF
  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE cpf = v_cpf AND active = true
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 2. Telefone (so digitos, comparacao apos normalizar)
  IF v_tel IS NOT NULL AND length(v_tel) >= 10 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true
       AND regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_tel
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 3. Email (case-insensitive)
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND lower(trim(email)) = v_email
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN
      RETURN v_membro_id;
    END IF;
  END IF;

  -- 4. Nao achou · cria novo mem_membros
  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN NULL; -- sem nome nao da pra criar
  END IF;

  INSERT INTO public.mem_membros (nome, cpf, telefone, email, status, active, created_at, updated_at)
  VALUES (
    trim(p_nome),
    v_cpf,
    nullif(p_telefone, ''),
    v_email,
    coalesce(p_status_inicial, 'novo'),
    true,
    now(),
    now()
  )
  RETURNING id INTO v_membro_id;

  -- Auditoria no historico (best effort · ignora erro se tabela nao existir)
  BEGIN
    INSERT INTO public.mem_historico (membro_id, acao, observacao, created_at)
    VALUES (
      v_membro_id,
      'criado_auto',
      'Criado automaticamente via ' || coalesce(p_fonte, 'fluxo'),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- ignora se mem_historico nao tem essas colunas
    NULL;
  END;

  RETURN v_membro_id;
END;
$$;

COMMENT ON FUNCTION public.fn_link_or_create_membro IS
'Tenta match em mem_membros por CPF -> telefone -> email. Cria novo se nao achar. Retorna membro_id.';

-- ─────────────────────────────────────────────────────────────────────────
-- GAP A · Trigger em vol_profiles · preenche membresia_id
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_vol_profiles_link_membro()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- So age se ainda nao tem link e tem ao menos um identificador
  IF NEW.membresia_id IS NULL AND NEW.full_name IS NOT NULL AND trim(NEW.full_name) <> '' THEN
    NEW.membresia_id := public.fn_link_or_create_membro(
      NEW.cpf,
      NEW.phone,
      NEW.email,
      NEW.full_name,
      'membro_ativo', -- voluntario eh tratado como membro ativo
      'vol_profiles'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vol_profiles_link_membro ON public.vol_profiles;
CREATE TRIGGER trg_vol_profiles_link_membro
  BEFORE INSERT OR UPDATE OF cpf, phone, email, full_name, membresia_id ON public.vol_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_vol_profiles_link_membro();

-- ─────────────────────────────────────────────────────────────────────────
-- GAP B · Trigger em batismo_inscricoes · preenche membro_id
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_batismo_inscricao_link_membro()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_nome_completo text;
BEGIN
  IF NEW.membro_id IS NULL THEN
    v_nome_completo := trim(coalesce(NEW.nome, '') || ' ' || coalesce(NEW.sobrenome, ''));
    IF v_nome_completo <> '' THEN
      NEW.membro_id := public.fn_link_or_create_membro(
        NEW.cpf,
        NEW.telefone,
        NEW.email,
        v_nome_completo,
        'novo', -- ainda nao foi batizado · trg_batismo_realizado vai promover quando status='realizado'
        'batismo_inscricoes'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batismo_inscricao_link_membro ON public.batismo_inscricoes;
CREATE TRIGGER trg_batismo_inscricao_link_membro
  BEFORE INSERT OR UPDATE OF cpf, telefone, email, nome, sobrenome, membro_id ON public.batismo_inscricoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_batismo_inscricao_link_membro();

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill idempotente · processa orfaos existentes
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_membro_id uuid;
  v_vol_count int := 0;
  v_bat_count int := 0;
BEGIN
  -- vol_profiles sem membresia_id
  FOR r IN
    SELECT id, cpf, phone, email, full_name
      FROM public.vol_profiles
     WHERE membresia_id IS NULL
       AND full_name IS NOT NULL AND trim(full_name) <> ''
  LOOP
    v_membro_id := public.fn_link_or_create_membro(r.cpf, r.phone, r.email, r.full_name, 'membro_ativo', 'vol_profiles_backfill');
    IF v_membro_id IS NOT NULL THEN
      UPDATE public.vol_profiles SET membresia_id = v_membro_id WHERE id = r.id;
      v_vol_count := v_vol_count + 1;
    END IF;
  END LOOP;

  -- batismo_inscricoes sem membro_id
  FOR r IN
    SELECT id, cpf, telefone, email, nome, sobrenome
      FROM public.batismo_inscricoes
     WHERE membro_id IS NULL
       AND trim(coalesce(nome, '') || ' ' || coalesce(sobrenome, '')) <> ''
  LOOP
    v_membro_id := public.fn_link_or_create_membro(
      r.cpf, r.telefone, r.email,
      trim(coalesce(r.nome, '') || ' ' || coalesce(r.sobrenome, '')),
      'novo',
      'batismo_backfill'
    );
    IF v_membro_id IS NOT NULL THEN
      UPDATE public.batismo_inscricoes SET membro_id = v_membro_id WHERE id = r.id;
      v_bat_count := v_bat_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill: % voluntarios linkados, % batismos linkados', v_vol_count, v_bat_count;
END$$;

-- ─────────────────────────────────────────────────────────────────────────
-- View · contar orfaos (pra dashboard / monitoring)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_membros_orfaos_stats AS
SELECT
  (SELECT count(*) FROM public.vol_profiles
    WHERE membresia_id IS NULL AND full_name IS NOT NULL AND trim(full_name) <> ''
  ) AS voluntarios_sem_membro,
  (SELECT count(*) FROM public.batismo_inscricoes
    WHERE membro_id IS NULL
      AND trim(coalesce(nome, '') || ' ' || coalesce(sobrenome, '')) <> ''
  ) AS batismos_sem_membro;

GRANT SELECT ON public.vw_membros_orfaos_stats TO authenticated, service_role;

COMMENT ON VIEW public.vw_membros_orfaos_stats IS
'Conta registros em vol_profiles e batismo_inscricoes sem link com mem_membros · idealmente 0';

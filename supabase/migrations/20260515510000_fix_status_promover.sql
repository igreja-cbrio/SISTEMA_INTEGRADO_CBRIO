-- ============================================================================
-- 20260515510000_fix_status_promover.sql
--
-- Corrige migration 20260515500000 que usava status='novo' como default,
-- mas o CHECK em mem_membros.status nao aceita 'novo'. Os valores aceitos
-- (vistos em triggers anteriores: 20260430130000 linhas 103 e 164) sao
-- 'visitante' e 'membro_ativo'.
--
-- Mudancas:
--   1. fn_link_or_create_membro: default p_status_inicial='visitante'
--   2. fn_batismo_inscricao_link_membro: passa 'visitante' explicito
--   3. Re-executa backfill que falhou parcialmente
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_link_or_create_membro(
  p_cpf text,
  p_telefone text,
  p_email text,
  p_nome text,
  p_status_inicial text DEFAULT 'visitante',
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

  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE cpf = v_cpf AND active = true LIMIT 1;
    IF v_membro_id IS NOT NULL THEN RETURN v_membro_id; END IF;
  END IF;

  IF v_tel IS NOT NULL AND length(v_tel) >= 10 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true
       AND regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_tel
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN RETURN v_membro_id; END IF;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND lower(trim(email)) = v_email LIMIT 1;
    IF v_membro_id IS NOT NULL THEN RETURN v_membro_id; END IF;
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.mem_membros (nome, cpf, telefone, email, status, active, created_at, updated_at)
  VALUES (
    trim(p_nome),
    v_cpf,
    nullif(p_telefone, ''),
    v_email,
    coalesce(p_status_inicial, 'visitante'),
    true,
    now(),
    now()
  )
  RETURNING id INTO v_membro_id;

  BEGIN
    INSERT INTO public.mem_historico (membro_id, acao, observacao, created_at)
    VALUES (
      v_membro_id, 'criado_auto',
      'Criado automaticamente via ' || coalesce(p_fonte, 'fluxo'),
      now()
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_membro_id;
END;
$$;

-- Trigger de batismo · default 'visitante' (sera promovido pra 'membro_ativo'
-- pelo trigger antigo trg_batismo_realizado quando status='realizado')
CREATE OR REPLACE FUNCTION public.fn_batismo_inscricao_link_membro()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_nome_completo text;
BEGIN
  IF NEW.membro_id IS NULL THEN
    v_nome_completo := trim(coalesce(NEW.nome, '') || ' ' || coalesce(NEW.sobrenome, ''));
    IF v_nome_completo <> '' THEN
      NEW.membro_id := public.fn_link_or_create_membro(
        NEW.cpf, NEW.telefone, NEW.email, v_nome_completo,
        'visitante',
        'batismo_inscricoes'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-executa backfill que parou no meio quando deu erro de check constraint
DO $$
DECLARE
  r record;
  v_membro_id uuid;
  v_vol_count int := 0;
  v_bat_count int := 0;
BEGIN
  FOR r IN
    SELECT id, cpf, phone, email, full_name
      FROM public.vol_profiles
     WHERE membresia_id IS NULL
       AND full_name IS NOT NULL AND trim(full_name) <> ''
  LOOP
    v_membro_id := public.fn_link_or_create_membro(
      r.cpf, r.phone, r.email, r.full_name, 'membro_ativo', 'vol_profiles_backfill'
    );
    IF v_membro_id IS NOT NULL THEN
      UPDATE public.vol_profiles SET membresia_id = v_membro_id WHERE id = r.id;
      v_vol_count := v_vol_count + 1;
    END IF;
  END LOOP;

  FOR r IN
    SELECT id, cpf, telefone, email, nome, sobrenome
      FROM public.batismo_inscricoes
     WHERE membro_id IS NULL
       AND trim(coalesce(nome, '') || ' ' || coalesce(sobrenome, '')) <> ''
  LOOP
    v_membro_id := public.fn_link_or_create_membro(
      r.cpf, r.telefone, r.email,
      trim(coalesce(r.nome, '') || ' ' || coalesce(r.sobrenome, '')),
      'visitante', 'batismo_backfill'
    );
    IF v_membro_id IS NOT NULL THEN
      UPDATE public.batismo_inscricoes SET membro_id = v_membro_id WHERE id = r.id;
      v_bat_count := v_bat_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill (fix): % voluntarios linkados, % batismos linkados', v_vol_count, v_bat_count;
END$$;

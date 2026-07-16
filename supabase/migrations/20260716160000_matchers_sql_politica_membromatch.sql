-- ============================================================================
-- Matchers SQL alinhados à política canônica do membroMatch (auditoria CPF ·
-- 2026-07-16)
--
-- Dois triggers tinham política PRÓPRIA de identidade, divergente do matcher
-- canônico (backend/services/membroMatch.js · CPF → e-mail+NOME →
-- telefone+NOME → nascimento+NOME · NUNCA liga por sinal fraco sozinho):
--
--   a) tg_cultos_dec_pessoas_resolve_membro (decisões de culto · versão
--      20260518150000): casava por e-mail SEM conferir o nome e NÃO tinha o
--      branch telefone+nome — como a decisão típica traz só nome+telefone,
--      quase sempre criava membro novo mesmo quando a pessoa já existia com
--      aquele telefone. É a fábrica dos 342 stubs sem CPF de cui_convertidos.
--   b) fn_link_or_create_membro (voluntários/batismo · 20260515510000):
--      ligava por telefone SOZINHO e por e-mail SOZINHO (família compartilha
--      número e e-mail — auto-link errado junta pessoas distintas).
--
-- Também: lookups agora filtram deleted_at IS NULL (o índice UNIQUE de CPF é
-- parcial em vivos) e os INSERTs tratam a corrida 23505 religando no vencedor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ----------------------------------------------------------------------------
-- 0. Comparador de nome conservador (espelho do nomesMesmaPessoa do JS ·
--    exato normalizado OU similaridade >= 0.90). Conservador de propósito:
--    nome "parecido" abaixo disso NÃO liga sozinho — cria stub e a fila de
--    duplicados pega.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_identidade_nomes_compativeis(a text, b text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN a IS NULL OR b IS NULL OR trim(a) = '' OR trim(b) = '' THEN false
    WHEN lower(unaccent(trim(a))) = lower(unaccent(trim(b))) THEN true
    ELSE similarity(lower(unaccent(a)), lower(unaccent(b))) >= 0.90
  END
$$;

COMMENT ON FUNCTION public.fn_identidade_nomes_compativeis(text, text) IS
  'Nomes são a mesma pessoa? Exato normalizado (case/acentos) OU pg_trgm similarity >= 0.90. Espelho SQL do nomesMesmaPessoa (membroMatch.js) pra decidir AUTO-link por sinal fraco.';

-- ----------------------------------------------------------------------------
-- 1. Trigger das decisões de culto · política membroMatch completa
--    (mantém: normalização de cpf/responsavel_cpf, kids fora por LGPD,
--     respeito ao membro_id explícito da UI)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_resolve_membro()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_membro_id uuid;
  v_cpf_limpo text;
  v_tel_limpo text;
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
  IF NEW.tipo_decisao = 'kids' THEN
    NEW.membro_id := NULL;
    RETURN NEW;
  END IF;

  -- Se já veio com membro_id explícito (via UI de busca), respeita
  IF NEW.membro_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1) CPF exato (só cadastros vivos · o índice UNIQUE é parcial em vivos)
  IF NEW.cpf IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = NEW.cpf
       AND deleted_at IS NULL
     LIMIT 1;
  END IF;

  -- 2) E-mail + NOME compatível (e-mail da família compartilhado não pode
  --    ligar sozinho · política membroMatch)
  IF v_membro_id IS NULL AND NEW.email IS NOT NULL AND length(NEW.email) > 3 THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE lower(email) = lower(NEW.email)
       AND deleted_at IS NULL
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 3) Telefone + NOME compatível (branch NOVO · a decisão típica traz só
  --    nome+telefone — sem este branch, quem já existia virava stub duplicado)
  v_tel_limpo := NULLIF(regexp_replace(COALESCE(NEW.telefone, ''), '\D', '', 'g'), '');
  IF v_membro_id IS NULL AND v_tel_limpo IS NOT NULL AND length(v_tel_limpo) >= 10 THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE deleted_at IS NULL
       AND regexp_replace(COALESCE(telefone, ''), '\D', '', 'g') = v_tel_limpo
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 4) Nome compatível + data_nascimento (criterio estavel)
  IF v_membro_id IS NULL AND NEW.data_nascimento IS NOT NULL THEN
    SELECT id INTO v_membro_id
      FROM public.mem_membros
     WHERE data_nascimento = NEW.data_nascimento
       AND deleted_at IS NULL
       AND public.fn_identidade_nomes_compativeis(nome, NEW.nome)
     LIMIT 1;
  END IF;

  -- 5) Cria membro novo (status visitante) com os dados disponíveis.
  --    Corrida 23505 no CPF (dois fluxos com o mesmo CPF novo) religa no
  --    vencedor em vez de estourar o INSERT da decisão.
  IF v_membro_id IS NULL THEN
    BEGIN
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
    EXCEPTION WHEN unique_violation THEN
      IF NEW.cpf IS NOT NULL THEN
        SELECT id INTO v_membro_id
          FROM public.mem_membros
         WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = NEW.cpf
           AND deleted_at IS NULL
         LIMIT 1;
      END IF;
      IF v_membro_id IS NULL THEN
        RAISE;
      END IF;
    END;
  END IF;

  NEW.membro_id := v_membro_id;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.tg_cultos_dec_pessoas_resolve_membro() IS
  'Resolve/cria mem_membros pra decisão de culto. Desde 20260716160000 segue a política canônica do membroMatch: CPF → e-mail+NOME → telefone+NOME → nascimento+NOME (nunca sinal fraco sozinho) · só cadastros vivos · corrida 23505 religa. Kids fora (LGPD).';

-- ----------------------------------------------------------------------------
-- 2. fn_link_or_create_membro · sinal fraco exige NOME compatível
--    (assinatura preservada · chamadores: trigger de batismo, backfills vol)
-- ----------------------------------------------------------------------------
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

  -- 1) CPF exato (só vivos · normalizado dos dois lados)
  IF v_cpf IS NOT NULL AND length(v_cpf) = 11 THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
       AND active = true AND deleted_at IS NULL
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN RETURN v_membro_id; END IF;
  END IF;

  -- 2) Telefone + NOME compatível (antes ligava por telefone SOZINHO —
  --    família compartilha o número · política membroMatch). Sem nome, não
  --    liga por telefone.
  IF v_tel IS NOT NULL AND length(v_tel) >= 10 AND p_nome IS NOT NULL AND trim(p_nome) <> '' THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_tel
       AND public.fn_identidade_nomes_compativeis(nome, p_nome)
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN RETURN v_membro_id; END IF;
  END IF;

  -- 3) E-mail + NOME compatível quando há nome (sem nome, mantém o legado
  --    e-mail sozinho · mesmo contrato do membroMatch)
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_membro_id FROM public.mem_membros
     WHERE active = true AND deleted_at IS NULL
       AND lower(trim(email)) = v_email
       AND (p_nome IS NULL OR trim(p_nome) = '' OR public.fn_identidade_nomes_compativeis(nome, p_nome))
     LIMIT 1;
    IF v_membro_id IS NOT NULL THEN RETURN v_membro_id; END IF;
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- Corrida no CPF: religa no vencedor
    IF v_cpf IS NOT NULL THEN
      SELECT id INTO v_membro_id FROM public.mem_membros
       WHERE regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf
         AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_membro_id IS NULL THEN RAISE; END IF;
    RETURN v_membro_id;
  END;

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

COMMENT ON FUNCTION public.fn_link_or_create_membro(text, text, text, text, text, text) IS
  'Link-ou-cria mem_membros. Desde 20260716160000 segue a política do membroMatch: CPF → telefone+NOME → e-mail(+NOME quando há nome) · nunca telefone sozinho · só cadastros vivos · corrida 23505 religa.';

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT fn_identidade_nomes_compativeis('José da Silva', 'Jose da Silva');  -- true
--   SELECT fn_identidade_nomes_compativeis('José da Silva', 'Maria Souza');    -- false
-- ============================================================================

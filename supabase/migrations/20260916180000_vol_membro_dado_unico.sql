-- ============================================================================
-- VOLUNTARIADO × MEMBRESIA · UM DADO SÓ (2026-09-16)
--
-- Pedido do Marcos: *"essa junção que voce disse de vol_profiles + mem_membros,
-- garanta que tudo seja sempre um dado só, para que nós nunca tenhamos dados
-- divergentes da mesma pessoa, encontre porque isso acontece e resolva na raiz,
-- sem duplicar e quebrar dados."*
--
-- ⚠️⚠️ O QUE A MEDIÇÃO DE 16/09 ACHOU — e muda o desenho:
--   · CPF divergente entre as 2 tabelas ......... 0
--   · telefone divergente ....................... 0
--   · e-mail divergente ......................... 0
--   · nome "divergente" ......................... 339 (quase todos NOME CURTO
--     do Planning Center × nome legal do cadastro — NÃO é corrupção)
--
--   O problema NUNCA foi valor brigando: é VAZIO. `vol_profiles` tem cpf em 26
--   de 954 e telefone em 11 de 954, enquanto o membro vinculado tem cpf em 523
--   e telefone em 562. Quem lê só a casca conclui "não tem".
--
-- ⚠️⚠️ POR QUE O E-MAIL JÁ ESTAVA CERTO, e é a prova do desenho:
--   ele é o ÚNICO campo com trigger de sincronia (20260702230000) — e é o único
--   com ZERO divergência. Esta migration estende o MESMO mecanismo a cpf e
--   telefone. Não é padrão novo; é o padrão que funcionou, aplicado ao resto.
--
-- ⚠️ A RAIZ do VAZIO é o sync do Planning Center: `upsertVolunteerProfiles`
--   (services/planningCenter.js) faz upsert por `planning_center_id` e NUNCA
--   passa pelo matcher — os 327 perfis sem `membresia_id` são 100% origem
--   `planning_center`. Ligar perfil a cadastro continua sendo DECISÃO HUMANA
--   (caso Palladino, 25/08: o e-mail do perfil do FILHO era o do cadastro do
--   PAI). Esta migration NÃO liga ninguém — ela garante que, ONDE o vínculo
--   existe, o dado seja um só.
-- ============================================================================

-- ── TELEFONE · bidirecional, igual ao e-mail ────────────────────────────────
-- ⚠️ Pode subir com segurança: `mem_membros.telefone` NÃO tem unique (medido:
-- 744 telefones compartilhados entre membros vivos — é o telefone da casa, e a
-- lei do Contrato de porta já diz que isso é o caso NORMAL).

CREATE OR REPLACE FUNCTION public.fn_sync_telefone_membro_para_vol()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tel TEXT;
BEGIN
  -- ⚠️⚠️ REUSA `telefone_digits` (coluna GERADA · 20260817160000), NUNCA um
  -- regexp próprio: ela é a régua canônica da casa e remove o `55` do país
  -- SÓ quando o resto tem 12–13 dígitos — porque **DDD 55 é Santa Maria/RS**.
  -- Um `replace(^55)` ingênuo aqui destruiria todo número legítimo de lá.
  -- Lida da tabela (e não de NEW) pra não depender de coluna gerada estar
  -- materializada em NEW.
  SELECT telefone_digits INTO v_tel
    FROM public.mem_membros WHERE id = NEW.id;
  IF v_tel IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.vol_profiles
     SET phone = v_tel
   WHERE membresia_id = NEW.id
     AND phone IS DISTINCT FROM v_tel;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_telefone_membro_para_vol ON public.mem_membros;
CREATE TRIGGER trg_sync_telefone_membro_para_vol
  AFTER INSERT OR UPDATE OF telefone ON public.mem_membros
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fn_sync_telefone_membro_para_vol();

-- Guardião da precedência + provisório sobe (mesma forma do e-mail):
--   1. membro TEM telefone e difere → restaura o canônico no perfil (é o que
--      impede o sync horário do PCO regravar por cima)
--   2. membro SEM telefone e perfil tem → preenche o membro (SÓ-ONDE-VAZIO)
CREATE OR REPLACE FUNCTION public.fn_sync_telefone_vol_para_membro()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tel_membro TEXT;
  v_tel_vol    TEXT;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- mesma régua canônica da descida (coluna gerada, DDD 55 preservado)
  SELECT telefone_digits
    INTO v_tel_membro
    FROM public.mem_membros
   WHERE id = NEW.membresia_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_tel_vol := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), '');

  IF v_tel_membro IS NOT NULL THEN
    IF NEW.phone IS DISTINCT FROM v_tel_membro THEN
      UPDATE public.vol_profiles SET phone = v_tel_membro WHERE id = NEW.id;
    END IF;
  ELSIF v_tel_vol IS NOT NULL THEN
    UPDATE public.mem_membros
       SET telefone = v_tel_vol
     WHERE id = NEW.membresia_id
       AND (telefone IS NULL OR trim(telefone) = '')
       AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_telefone_vol_para_membro ON public.vol_profiles;
CREATE TRIGGER trg_sync_telefone_vol_para_membro
  AFTER INSERT OR UPDATE OF phone, membresia_id ON public.vol_profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fn_sync_telefone_vol_para_membro();

-- ── CPF · SÓ DESCE (o canônico manda; a subida fica com o app) ──────────────
-- ⚠️⚠️ ASSIMETRIA DELIBERADA, e é o ponto mais importante desta migration.
-- `mem_membros.cpf` tem UNIQUE (uniq_mem_membros_cpf_ativo, 20260715120000) e a
-- LEI de 16/07 diz: "NUNCA raw-update de CPF de membro; conflito vira
-- identidade_pendencias". Se este trigger subisse CPF:
--   · CPF já pertencente a OUTRO membro levantaria 23505 DENTRO de um AFTER
--     trigger, abortando o statement INTEIRO — ou seja, o check-in do
--     voluntário falharia por causa de uma sincronia;
--   · e a fila humana de identidade (que existe justamente pra esse caso)
--     nunca seria alimentada.
-- Quem promove CPF é `reconciliarCpfTardio`, no app (o modal de completar
-- cadastro já o chama). Aqui o CPF só DESCE e é GUARDADO.

CREATE OR REPLACE FUNCTION public.fn_sync_cpf_membro_para_vol()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cpf TEXT;
BEGIN
  v_cpf := NULLIF(regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g'), '');
  IF v_cpf IS NULL THEN
    RETURN NEW;
  END IF;
  -- ⚠️ `vol_profiles.cpf` tem índice NÃO-único (vol_profiles_cpf_idx), então
  -- dois perfis do mesmo membro recebendo o mesmo CPF não levantam erro.
  UPDATE public.vol_profiles
     SET cpf = v_cpf
   WHERE membresia_id = NEW.id
     AND cpf IS DISTINCT FROM v_cpf;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cpf_membro_para_vol ON public.mem_membros;
CREATE TRIGGER trg_sync_cpf_membro_para_vol
  AFTER INSERT OR UPDATE OF cpf ON public.mem_membros
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fn_sync_cpf_membro_para_vol();

-- Guarda: o CPF do cadastro VENCE o do perfil. Protege contra o sync horário do
-- PCO (routes/voluntariado-sync.js:624 grava cpf em vol_profiles) sobrescrever
-- com um valor que a membresia não reconhece.
-- ⚠️ NÃO sobe: perfil com CPF e membro sem CPF fica como está, e o app
-- consolida por reconciliarCpfTardio (com a fila de pendência).
CREATE OR REPLACE FUNCTION public.fn_sync_cpf_vol_para_membro()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cpf_membro TEXT;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(regexp_replace(COALESCE(cpf, ''), '\D', '', 'g'), '')
    INTO v_cpf_membro
    FROM public.mem_membros
   WHERE id = NEW.membresia_id AND deleted_at IS NULL;

  IF NOT FOUND OR v_cpf_membro IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cpf IS DISTINCT FROM v_cpf_membro THEN
    UPDATE public.vol_profiles SET cpf = v_cpf_membro WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cpf_vol_para_membro ON public.vol_profiles;
CREATE TRIGGER trg_sync_cpf_vol_para_membro
  AFTER INSERT OR UPDATE OF cpf, membresia_id ON public.vol_profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fn_sync_cpf_vol_para_membro();

-- ── BACKFILL (idempotente) ──────────────────────────────────────────────────
-- ⚠️ Seguro porque a medição de 16/09 achou ZERO divergência de valor: nada é
-- sobrescrito com algo diferente — o que existe hoje é vazio de um lado.

-- 1. CPF do cadastro desce pro perfil.
UPDATE public.vol_profiles v
   SET cpf = regexp_replace(m.cpf, '\D', '', 'g')
  FROM public.mem_membros m
 WHERE m.id = v.membresia_id
   AND m.deleted_at IS NULL
   AND NULLIF(regexp_replace(COALESCE(m.cpf, ''), '\D', '', 'g'), '') IS NOT NULL
   AND v.cpf IS DISTINCT FROM regexp_replace(m.cpf, '\D', '', 'g');

-- 2. Telefone do cadastro desce pro perfil.
UPDATE public.vol_profiles v
   SET phone = m.telefone_digits
  FROM public.mem_membros m
 WHERE m.id = v.membresia_id
   AND m.deleted_at IS NULL
   AND m.telefone_digits IS NOT NULL
   AND v.phone IS DISTINCT FROM m.telefone_digits;

-- 3. Telefone do perfil sobe pro cadastro VAZIO (perfil mais recente vence).
UPDATE public.mem_membros m
   SET telefone = sub.tel
  FROM (
    SELECT DISTINCT ON (membresia_id)
           membresia_id,
           regexp_replace(phone, '\D', '', 'g') AS tel
      FROM public.vol_profiles
     WHERE membresia_id IS NOT NULL
       AND NULLIF(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), '') IS NOT NULL
       AND arquivado = false
     ORDER BY membresia_id, updated_at DESC
  ) sub
 WHERE sub.membresia_id = m.id
   AND (m.telefone IS NULL OR trim(m.telefone) = '')
   AND m.deleted_at IS NULL;

-- ⚠️ O NOME fica FORA de propósito. Os 339 "divergentes" são o nome CURTO do
-- Planning Center ("Lucas Melo") × o nome LEGAL do cadastro ("Lucas Batista
-- Gomes de Melo Araujo"). Forçar o legal faria o voluntário procurar o próprio
-- nome no tablet do check-in e não achar; forçar o curto apagaria o nome legal
-- da membresia. São dois conceitos, e a escolha é de gente.

COMMENT ON FUNCTION public.fn_sync_cpf_vol_para_membro() IS
  '[NÃO SOBE CPF] mem_membros.cpf tem UNIQUE e a promoção de CPF é do reconciliarCpfTardio (fila identidade_pendencias). Aqui o canônico só desce/é restaurado.';

-- ============================================================================
-- CONFERÊNCIA (rodar DEPOIS de aplicar · o RESULTADO importa, não o "success")
--
-- 1) Os 4 triggers existem e estão ativos:
--
--   select tgname, tgenabled from pg_trigger
--    where tgname in ('trg_sync_telefone_membro_para_vol','trg_sync_telefone_vol_para_membro',
--                     'trg_sync_cpf_membro_para_vol','trg_sync_cpf_vol_para_membro');
--   -- esperado: 4 linhas, todas com tgenabled = 'O'
--
-- 2) ⚠️⚠️ A PROVA DO OBJETIVO — divergência tem que ser ZERO nas 3 colunas:
--
--   select count(*) filter (where v.cpf   is distinct from m.cpf)             as cpf_diverge,
--          count(*) filter (where v.phone is distinct from m.telefone_digits) as tel_diverge,
--          count(*) filter (where lower(trim(v.email)) is distinct from lower(trim(m.email))) as email_diverge
--     from public.vol_profiles v
--     join public.mem_membros  m on m.id = v.membresia_id
--    where m.deleted_at is null
--      and (m.cpf is not null or m.telefone_digits is not null or m.email is not null);
--   -- esperado: 0 · 0 · 0  (ignorando onde o membro não tem o dado)
--
-- 3) O preenchimento subiu (era cpf 26 / telefone 11 em 954 perfis):
--
--   select count(*) filter (where cpf   is not null) as com_cpf,
--          count(*) filter (where phone is not null) as com_telefone
--     from public.vol_profiles where membresia_id is not null;
--   -- esperado (medido em 16/09, antes): 508 + 26 ≈ 523 com CPF · 559 + 11 ≈ 562 com telefone
--
-- 4) Nada foi criado nem apagado:
--
--   select count(*) from public.vol_profiles;   -- esperado: 954 (o mesmo de antes)
--   select count(*) from public.mem_membros where deleted_at is null;  -- inalterado
--
-- ROLLBACK (se precisar): os triggers são removíveis sem perda —
--   drop trigger if exists trg_sync_telefone_membro_para_vol on public.mem_membros;
--   drop trigger if exists trg_sync_telefone_vol_para_membro on public.vol_profiles;
--   drop trigger if exists trg_sync_cpf_membro_para_vol on public.mem_membros;
--   drop trigger if exists trg_sync_cpf_vol_para_membro on public.vol_profiles;
-- ⚠️ O BACKFILL não se desfaz por aqui — mas ele só COPIOU o valor do cadastro
-- pro perfil, e a medição de 16/09 provou que não havia valor divergente a
-- perder (0 CPF e 0 telefone sobrescritos com algo diferente).
-- ============================================================================

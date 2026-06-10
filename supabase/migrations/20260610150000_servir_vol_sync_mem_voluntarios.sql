-- ============================================================================
-- SERVIR · ponte voluntariado real (vol_*) → tabela-sinal da NSM (mem_voluntarios)
--
-- Auditoria da jornada (2026-06-10): o voluntariado operacional vive em
-- vol_profiles/vol_checkins/escalas, mas a NSM, a Jornada (/api/jornada) e os
-- KPIs de Servir leem mem_voluntarios — que tinha 0 linhas (único produtor era
-- um insert manual na Membresia). Resultado: voluntário de verdade nunca
-- etiquetava o valor Servir. Marcos autorizou ligar os fios.
--
-- Esta migration:
--   1. Cria o ministério guarda-chuva "Voluntariado (geral)" em mem_ministerios
--      (mem_voluntarios.ministerio_id é NOT NULL · o ministério específico pode
--      ser ajustado depois pela Membresia).
--   2. Backfill de vol_profiles.membresia_id por CPF e e-mail — SÓ vincula a
--      mem_membros existentes (não cria membro novo · evita poluir a membresia).
--   3. Trigger: vol_profile com membresia_id (novo ou vinculado depois) passa a
--      gerar mem_voluntarios automaticamente (se a pessoa ainda não é
--      voluntária ativa em nenhum ministério).
--   4. Backfill: cria mem_voluntarios pros vol_profiles já vinculados
--      (desde = data de criação do perfil).
--   5. Backfill de vol_inscricoes.membro_id por CPF/e-mail (só vincula a
--      existentes · análise/relatórios; inscrição não vira voluntário ativo).
--
-- Aditiva e idempotente. Não mexe no módulo de voluntariado (vol_*).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ministério guarda-chuva
-- ----------------------------------------------------------------------------
INSERT INTO public.mem_ministerios (nome, descricao)
SELECT 'Voluntariado (geral)',
       'Ministério guarda-chuva do sync com o módulo de Voluntariado. Ajuste o ministério específico do voluntário pela Membresia quando quiser.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.mem_ministerios WHERE nome = 'Voluntariado (geral)'
);

-- ----------------------------------------------------------------------------
-- 2. Backfill vol_profiles.membresia_id · CPF primeiro, e-mail depois
--    (só vincula a membros existentes e não deletados)
-- ----------------------------------------------------------------------------
UPDATE public.vol_profiles vp
   SET membresia_id = sub.membro_id
  FROM (
    SELECT DISTINCT ON (vp2.id) vp2.id AS vp_id, m.id AS membro_id
      FROM public.vol_profiles vp2
      JOIN public.mem_membros m
        ON m.deleted_at IS NULL
       AND (
         (length(regexp_replace(COALESCE(vp2.cpf, ''), '\D', '', 'g')) = 11
          AND regexp_replace(COALESCE(m.cpf, ''), '\D', '', 'g')
              = regexp_replace(vp2.cpf, '\D', '', 'g'))
         OR (NULLIF(lower(trim(COALESCE(vp2.email, ''))), '') IS NOT NULL
             AND lower(trim(COALESCE(m.email, ''))) = lower(trim(vp2.email)))
       )
     WHERE vp2.membresia_id IS NULL
     ORDER BY vp2.id,
              -- prioriza o match por CPF sobre o por e-mail
              (length(regexp_replace(COALESCE(vp2.cpf, ''), '\D', '', 'g')) = 11
               AND regexp_replace(COALESCE(m.cpf, ''), '\D', '', 'g')
                   = regexp_replace(COALESCE(vp2.cpf, ''), '\D', '', 'g')) DESC,
              m.created_at ASC
  ) sub
 WHERE vp.id = sub.vp_id
   AND vp.membresia_id IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Trigger · vol_profile vinculado a membro → mem_voluntarios (sinal Servir)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vol_profile_sync_mem_voluntarios()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ministerio uuid;
BEGIN
  IF NEW.membresia_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- já é voluntário ativo em algum ministério? não duplica
  IF EXISTS (
    SELECT 1 FROM public.mem_voluntarios
     WHERE membro_id = NEW.membresia_id AND ate IS NULL AND deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_ministerio
    FROM public.mem_ministerios
   WHERE nome = 'Voluntariado (geral)'
   LIMIT 1;
  IF v_ministerio IS NULL THEN
    RETURN NEW; -- guarda-chuva ausente · não bloqueia o fluxo do voluntariado
  END IF;

  INSERT INTO public.mem_voluntarios (membro_id, ministerio_id, papel, desde, observacoes)
  VALUES (
    NEW.membresia_id,
    v_ministerio,
    'Voluntário',
    COALESCE(NEW.created_at::date, CURRENT_DATE),
    'Auto: sync do voluntariado (vol_profiles.id=' || NEW.id::text || ')'
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vol_profile_sync_mem_voluntarios ON public.vol_profiles;
CREATE TRIGGER trg_vol_profile_sync_mem_voluntarios
  AFTER INSERT OR UPDATE OF membresia_id ON public.vol_profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() = 0)
  EXECUTE FUNCTION public.fn_vol_profile_sync_mem_voluntarios();

COMMENT ON FUNCTION public.fn_vol_profile_sync_mem_voluntarios() IS
  'Ponte Servir→NSM: vol_profile com membresia_id vira mem_voluntarios (ministério "Voluntariado (geral)" · desde = criação do perfil). Não duplica voluntário ativo.';

-- ----------------------------------------------------------------------------
-- 4. Backfill mem_voluntarios pros perfis já vinculados
--    desde = data de criação do perfil (não estoura janela de 60d indevida:
--    a NSM conta engajamento por [decisão, decisão+60d] · perfis antigos têm
--    desde antigo, então só contam pra quem decidiu na época).
-- ----------------------------------------------------------------------------
INSERT INTO public.mem_voluntarios (membro_id, ministerio_id, papel, desde, observacoes)
SELECT DISTINCT ON (vp.membresia_id)
       vp.membresia_id,
       (SELECT id FROM public.mem_ministerios WHERE nome = 'Voluntariado (geral)' LIMIT 1),
       'Voluntário',
       LEAST(vp.created_at::date, CURRENT_DATE),
       'Auto: backfill do voluntariado (vol_profiles.id=' || vp.id::text || ')'
  FROM public.vol_profiles vp
 WHERE vp.membresia_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.mem_voluntarios mv
      WHERE mv.membro_id = vp.membresia_id AND mv.ate IS NULL AND mv.deleted_at IS NULL
   )
 ORDER BY vp.membresia_id, vp.created_at ASC;

-- ----------------------------------------------------------------------------
-- 5. Backfill vol_inscricoes.membro_id (só vincula a membros existentes)
-- ----------------------------------------------------------------------------
UPDATE public.vol_inscricoes vi
   SET membro_id = sub.membro_id
  FROM (
    SELECT DISTINCT ON (vi2.id) vi2.id AS vi_id, m.id AS membro_id
      FROM public.vol_inscricoes vi2
      JOIN public.mem_membros m
        ON m.deleted_at IS NULL
       AND (
         (length(regexp_replace(COALESCE(vi2.cpf, ''), '\D', '', 'g')) = 11
          AND regexp_replace(COALESCE(m.cpf, ''), '\D', '', 'g')
              = regexp_replace(vi2.cpf, '\D', '', 'g'))
         OR (NULLIF(lower(trim(COALESCE(vi2.email, ''))), '') IS NOT NULL
             AND lower(trim(COALESCE(m.email, ''))) = lower(trim(vi2.email)))
       )
     WHERE vi2.membro_id IS NULL
     ORDER BY vi2.id,
              (length(regexp_replace(COALESCE(vi2.cpf, ''), '\D', '', 'g')) = 11
               AND regexp_replace(COALESCE(m.cpf, ''), '\D', '', 'g')
                   = regexp_replace(COALESCE(vi2.cpf, ''), '\D', '', 'g')) DESC,
              m.created_at ASC
  ) sub
 WHERE vi.id = sub.vi_id
   AND vi.membro_id IS NULL;

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT count(*) FROM vol_profiles WHERE membresia_id IS NOT NULL;
--   SELECT count(*) FROM mem_voluntarios WHERE ate IS NULL AND deleted_at IS NULL;
--   SELECT count(*) FROM vol_inscricoes WHERE membro_id IS NOT NULL;
-- ----------------------------------------------------------------------------

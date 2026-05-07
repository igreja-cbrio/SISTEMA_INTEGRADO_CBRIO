-- ============================================================================
-- NSM auto-recalculo + helper pra marcar diretoria geral por nome
--
-- 1. Trigger em nsm_eventos: ao inserir/atualizar/deletar evento, dispara
--    recalcular_nsm() automaticamente. Painel sempre reflete realidade.
--
-- 2. Helper marcar_diretoria_geral(nome_busca, funcao): facilita marcar
--    pessoa pela busca de nome (case insensitive, parcial).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger automatico em nsm_eventos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_nsm_eventos_recalc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.recalcular_nsm();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_nsm_eventos_auto_recalc ON public.nsm_eventos;
CREATE TRIGGER tg_nsm_eventos_auto_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.nsm_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_nsm_eventos_recalc();

-- Note: usa FOR EACH STATEMENT (nao FOR EACH ROW) pra evitar recalculos
-- redundantes em batch inserts. 1 statement = 1 recalculo.

COMMENT ON TRIGGER tg_nsm_eventos_auto_recalc ON public.nsm_eventos IS
  'Recalcula nsm_estado automaticamente apos qualquer alteracao em nsm_eventos. Painel sempre reflete realidade sem precisar de cron.';

-- Recalcular agora pra refletir o que ja existe
SELECT public.recalcular_nsm();

-- ----------------------------------------------------------------------------
-- 2. Helper pra marcar diretoria geral por busca de nome
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_diretoria_geral(
  p_busca_nome text,
  p_funcao text
) RETURNS TABLE (
  profile_id uuid,
  nome_encontrado text,
  email_encontrado text,
  funcao_atribuida text,
  resultado text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
  v_profile RECORD;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.profiles
   WHERE active = true
     AND lower(name) LIKE '%' || lower(p_busca_nome) || '%';

  IF v_count = 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::text,
      ('Nenhum profile ativo encontrado com nome contendo "' || p_busca_nome || '"')::text;
    RETURN;
  END IF;

  IF v_count > 1 THEN
    -- Retornar lista pra ambiguidade
    FOR v_profile IN
      SELECT id, name, email
        FROM public.profiles
       WHERE active = true
         AND lower(name) LIKE '%' || lower(p_busca_nome) || '%'
       ORDER BY name
    LOOP
      RETURN QUERY SELECT v_profile.id, v_profile.name, v_profile.email,
        NULL::text,
        ('AMBIGUO: ' || v_count::text || ' profiles encontrados — refine a busca')::text;
    END LOOP;
    RETURN;
  END IF;

  -- 1 unico match: atualizar
  SELECT id, name, email INTO v_profile
    FROM public.profiles
   WHERE active = true
     AND lower(name) LIKE '%' || lower(p_busca_nome) || '%';

  UPDATE public.profiles
     SET is_diretoria_geral = true,
         funcao_diretoria = p_funcao
   WHERE id = v_profile.id;

  RETURN QUERY SELECT v_profile.id, v_profile.name, v_profile.email,
    p_funcao, 'OK · marcado como diretoria geral'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_diretoria_geral(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.marcar_diretoria_geral IS
  'Helper: busca profile por nome (LIKE case insensitive) e marca como diretoria geral. Se ambiguo, retorna lista. Se nao acha, retorna mensagem.';

-- ----------------------------------------------------------------------------
-- USO (rodar no SQL Editor do Supabase):
--
--   SELECT * FROM public.marcar_diretoria_geral('Pedrao',  'Pastor Senior');
--   SELECT * FROM public.marcar_diretoria_geral('Juninho', 'Pastor Presidente');
--   SELECT * FROM public.marcar_diretoria_geral('Eduardo', 'Lider de Gestao');
--   SELECT * FROM public.marcar_diretoria_geral('Arthur',  'Lider Ministerial');
--   SELECT * FROM public.marcar_diretoria_geral('Pedro Menezes', 'Lider Criativo');
--
-- Conferir:
--   SELECT name, email, role, is_diretoria_geral, funcao_diretoria
--     FROM profiles WHERE is_diretoria_geral = true;
-- ----------------------------------------------------------------------------

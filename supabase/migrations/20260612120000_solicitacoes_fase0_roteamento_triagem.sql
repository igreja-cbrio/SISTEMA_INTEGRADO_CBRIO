-- ============================================================================
-- Solicitacoes · Fase 0.1 · Roteamento de setor robusto + fallback de TRIAGEM
-- ============================================================================
-- Contexto (decidido com Marcos · 2026-06-12 · oficializacao do modulo):
--   - O roteamento ao diretor de origem (Arthur/Eduardo/Pedro Menezes) resolvia
--     o setor SO por profiles.area. Diagnostico em prod: ~41% dos profiles tem
--     area NULL (em geral membros/contas de servico, mas tambem alguns acessos
--     sem vinculo de funcionario ativo, ex.: coordenadores).
--   - Quando o setor NAO resolve, o fluxo atual marca 'dispensada' = PULA o
--     diretor silenciosamente (auto-aprova a pertinencia). Para o modulo virar
--     oficial, esse default e' o errado: o portao se desliga justamente quando
--     o sistema ficou em duvida.
--
-- Mudancas (todas idempotentes · CREATE OR REPLACE · nao-destrutivas):
--   1. fn_normalizar_setor passa a cobrir tambem as areas GRANULARES
--      (kids/cuidados/integracao/marketing/financeiro/...) -> setor, alem das
--      macro (Gestao/Criativo/Ministerial/Voluntariado).
--   2. fn_solicitacoes_rotear_origem ganha p_setor_hint: o BACKEND resolve o
--      setor pela cascata rica (kpi_areas -> usuario_areas -> profile.area ->
--      cargo) em JS - onde ja tem o dado carregado - e passa aqui. A RPC
--      tambem dispensa super-admins. Quando NADA resolve -> 'triagem'
--      (sobe pros super-admins) em vez de 'dispensada'.
--   3. Trigger de seguranca (insert direto autenticado): mesma logica de
--      super-admin + fallback -> triagem.
--   4. CHECK de aprovacao_origem_status ganha 'triagem'.
--
-- Compatibilidade: o caminho real e' o backend (service_role · auth.uid()=NULL).
-- O backend pre-grava aprovacao_origem_* a partir da RPC; o trigger continua de
-- rede de seguranca (so atua quando ninguem preencheu o status).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. CHECK · aceita 'triagem'
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_aprovacao_origem_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_aprovacao_origem_status_check
  CHECK (aprovacao_origem_status IS NULL OR aprovacao_origem_status IN
    ('pendente', 'triagem', 'aprovada', 'rejeitada', 'dispensada'));

-- ----------------------------------------------------------------------------
-- 2. fn_normalizar_setor · cobre macro + areas granulares (unaccent ja roda
--    antes da comparacao · so precisamos das formas sem acento)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.fn_normalizar_setor(p_area text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH norm AS (SELECT lower(unaccent(trim(p_area))) AS v)
  SELECT CASE
    -- Gestao · administrativo / operacoes / financeiro / RH / TI / logistica
    WHEN v IN ('gestao','administrativo','adm','financeiro','rh','recursos humanos',
               'logistica','logistica_compras','logistica_estoque','compras','manutencao',
               'patrimonio','ti','tecnologia','operacoes','operacional','estrategia',
               'governanca','juridico','secretaria','reserva_espaco')               THEN 'Gestao'
    -- Criativo · marketing / producao / comunicacao / adoracao
    WHEN v IN ('criativo','criativa','marketing','producao','comunicacao','design',
               'audiovisual','midia','adoracao','louvor')                           THEN 'Criativo'
    -- Ministerial · culto + valores da jornada + voluntariado + pastoral
    WHEN v IN ('ministerial','ministerio','pastoral','voluntariado','voluntariada',
               'cuidados','grupos','integracao','next','membresia','discipulado',
               'kids','ami','bridge','online','sede','cba','geracional','jornada')  THEN 'Ministerial'
    ELSE NULL
  END
  FROM norm
$$;

COMMENT ON FUNCTION public.fn_normalizar_setor(text) IS
  'Mapeia area (macro OU granular) -> setor (Gestao/Criativo/Ministerial) usado em setor_diretor. Fase 0 (2026-06-12) ampliou pra cobrir areas granulares.';

GRANT EXECUTE ON FUNCTION public.fn_normalizar_setor(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. RPC de roteamento (backend) · + p_setor_hint + super-admin + TRIAGEM
--    Substitui a versao de 1 argumento (o DEFAULT NULL mantem chamadas antigas).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_solicitacoes_rotear_origem(uuid);

CREATE OR REPLACE FUNCTION public.fn_solicitacoes_rotear_origem(
  p_solicitante_id uuid,
  p_setor_hint     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_is_super_admin     boolean;
  v_is_diretor_setor   boolean;
  v_is_diretoria_geral boolean;
  v_diretor_id         uuid;
  v_setor              text;
BEGIN
  IF p_solicitante_id IS NULL THEN
    RETURN jsonb_build_object('diretor_id', NULL, 'aprovacao_status', 'dispensada',
      'motivo', 'Sem solicitante', 'status', 'pendente');
  END IF;

  -- Dispensa #0 · super-admin (dono do sistema · acima dos diretores)
  SELECT EXISTS(
    SELECT 1 FROM public.app_super_admins sa
      JOIN public.profiles p ON lower(p.email) = lower(sa.email)
     WHERE p.id = p_solicitante_id AND COALESCE(sa.ativo, true)
  ) INTO v_is_super_admin;

  -- Dispensa #1 · solicitante eh um dos 3 diretores de setor
  SELECT EXISTS(SELECT 1 FROM public.setor_diretor WHERE diretor_id = p_solicitante_id)
    INTO v_is_diretor_setor;

  -- Dispensa #2 · solicitante eh diretoria geral
  SELECT COALESCE(is_diretoria_geral, false) INTO v_is_diretoria_geral
    FROM public.profiles WHERE id = p_solicitante_id;

  IF v_is_super_admin OR v_is_diretor_setor OR v_is_diretoria_geral THEN
    RETURN jsonb_build_object('diretor_id', NULL, 'aprovacao_status', 'dispensada',
      'motivo', CASE WHEN v_is_super_admin   THEN 'Solicitante eh super-admin'
                     WHEN v_is_diretor_setor THEN 'Solicitante eh diretor de setor'
                     ELSE 'Solicitante eh diretoria geral' END,
      'status', 'pendente');
  END IF;

  -- Resolucao do diretor · (1) pelo profile.area (resolver existente)
  SELECT diretor_id INTO v_diretor_id
    FROM public.fn_solicitacoes_resolver_diretor_origem(p_solicitante_id);

  -- (2) fallback pela DICA de setor resolvida no backend (cascata rica em JS:
  --     kpi_areas -> usuario_areas -> profile.area -> cargo)
  IF v_diretor_id IS NULL AND p_setor_hint IS NOT NULL THEN
    v_setor := public.fn_normalizar_setor(p_setor_hint);
    IF v_setor IS NOT NULL THEN
      SELECT sd.diretor_id INTO v_diretor_id
        FROM public.setor_diretor sd WHERE sd.setor = v_setor;
    END IF;
  END IF;

  IF v_diretor_id IS NOT NULL THEN
    RETURN jsonb_build_object('diretor_id', v_diretor_id, 'aprovacao_status', 'pendente',
      'motivo', NULL, 'status', 'aguardando_aprovacao_origem');
  END IF;

  -- (3) NADA resolveu · TRIAGEM (sobe pros super-admins · sem dispensa silenciosa)
  RETURN jsonb_build_object('diretor_id', NULL, 'aprovacao_status', 'triagem',
    'motivo', 'Setor nao resolvido · em triagem dos super-admins',
    'status', 'aguardando_aprovacao_origem');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_solicitacoes_rotear_origem(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_solicitacoes_rotear_origem(uuid, text) IS
  'Roteia a solicitacao pro diretor de origem. Dispensa super-admin/diretor-de-setor/diretoria-geral. Resolve setor por profile.area e, se falhar, pela dica do backend (cascata rica). Sem resolucao -> triagem dos super-admins (Fase 0 · 2026-06-12).';

-- ----------------------------------------------------------------------------
-- 4. Trigger de seguranca (insert direto autenticado) · super-admin + TRIAGEM
--    O caminho real e' o backend (auth.uid()=NULL · pre-grava status), entao
--    esse ramo so atua em INSERT direto via PostgREST por um logado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_solicitacoes_roteamento_aprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_diretor_id uuid;
  v_is_diretor_setor boolean;
  v_is_diretoria_geral boolean;
  v_funcionario_id uuid;
BEGIN
  -- service_role / SQL puro (auth.uid() NULL): confia no caller, so default
  IF auth.uid() IS NULL THEN
    IF NEW.aprovacao_origem_status IS NULL THEN
      NEW.aprovacao_origem_status := 'dispensada';
      NEW.aprovacao_origem_motivo := 'service_role · sem aprovacao hierarquica';
      NEW.aprovacao_origem_em := now();
    END IF;
    IF NEW.urgencia_decisao IS NULL THEN
      NEW.urgencia_decisao := CASE WHEN COALESCE(NEW.eh_urgente, false) THEN 'pendente' ELSE 'nao_aplicavel' END;
    END IF;
    RETURN NEW;
  END IF;

  -- Apenas funcionarios criam solicitacao (insert direto autenticado)
  v_funcionario_id := public.current_user_funcionario_id();
  IF v_funcionario_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas funcionarios podem criar solicitacoes (sem vinculo rh_funcionarios)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.urgencia_decisao IS NULL THEN
    NEW.urgencia_decisao := CASE WHEN COALESCE(NEW.eh_urgente, false) THEN 'pendente' ELSE 'nao_aplicavel' END;
  END IF;

  -- Caller ja preencheu (backend RPC) · nao mexe
  IF NEW.aprovacao_origem_status IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Dispensa · super-admin / diretor de setor / diretoria geral
  v_is_diretor_setor := EXISTS(SELECT 1 FROM public.setor_diretor WHERE diretor_id = NEW.solicitante_id);
  SELECT COALESCE(is_diretoria_geral, false) INTO v_is_diretoria_geral
    FROM public.profiles WHERE id = NEW.solicitante_id;

  IF public.is_super_admin() OR v_is_diretor_setor OR v_is_diretoria_geral THEN
    NEW.aprovacao_origem_status := 'dispensada';
    NEW.aprovacao_origem_motivo := CASE
      WHEN public.is_super_admin() THEN 'Solicitante eh super-admin'
      WHEN v_is_diretor_setor      THEN 'Solicitante eh diretor de setor'
      ELSE 'Solicitante eh diretoria geral' END;
    NEW.aprovacao_origem_em := now();
    IF NEW.status IS NULL OR NEW.status = 'aguardando_aprovacao_origem' THEN
      NEW.status := 'pendente';
    END IF;
    RETURN NEW;
  END IF;

  -- Resolve diretor pelo profile.area
  SELECT diretor_id INTO v_diretor_id
    FROM public.fn_solicitacoes_resolver_diretor_origem(NEW.solicitante_id);

  IF v_diretor_id IS NOT NULL THEN
    NEW.aprovacao_origem_diretor_id := v_diretor_id;
    NEW.aprovacao_origem_status := 'pendente';
    NEW.status := 'aguardando_aprovacao_origem';
    RETURN NEW;
  END IF;

  -- Nada resolveu · TRIAGEM (era 'dispensada')
  NEW.aprovacao_origem_status := 'triagem';
  NEW.aprovacao_origem_motivo := 'Setor nao resolvido · em triagem dos super-admins';
  NEW.aprovacao_origem_em := now();
  NEW.status := 'aguardando_aprovacao_origem';
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_solicitacoes_roteamento_aprovacao() IS
  'BEFORE INSERT · rede de seguranca do roteamento. Dispensa super-admin/diretor-setor/diretoria-geral, roteia pelo profile.area, e sem resolucao manda pra triagem (Fase 0 · 2026-06-12).';

COMMIT;

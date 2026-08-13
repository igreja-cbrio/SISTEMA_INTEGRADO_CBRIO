-- Módulo Propostas · Fase 2 — avaliação (0-5), deliberação e transições do mural.
-- Idempotente.

-- ── prop_avaliacao · uma por diretor por proposta (RN08) ───────────────────
CREATE TABLE IF NOT EXISTS public.prop_avaliacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  diretor_usuario_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comentario TEXT,
  enviada_em TIMESTAMPTZ,           -- nulo = rascunho; não editável após enviar
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposta_id, diretor_usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_prop_avaliacao_proposta ON public.prop_avaliacao (proposta_id);

CREATE TABLE IF NOT EXISTS public.prop_avaliacao_nota (
  avaliacao_id UUID NOT NULL REFERENCES public.prop_avaliacao(id) ON DELETE CASCADE,
  criterio_id UUID NOT NULL REFERENCES public.prop_criterio(id) ON DELETE CASCADE,
  nota INTEGER NOT NULL CHECK (nota BETWEEN 0 AND 5),
  PRIMARY KEY (avaliacao_id, criterio_id)
);

-- ── prop_deliberacao · decisão da reunião por proposta (RN14) ──────────────
CREATE TABLE IF NOT EXISTS public.prop_deliberacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'deliberacao' CHECK (tipo IN ('deliberacao','reavaliacao_recurso')),
  resultado TEXT NOT NULL CHECK (resultado IN ('aprovado','aprovado_com_ressalvas','devolvido','reprovado')),
  ressalvas TEXT, motivo TEXT,
  snapshot_id UUID REFERENCES public.prop_snapshot(id) ON DELETE SET NULL,
  registrado_por_usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decidido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prop_deliberacao_proposta ON public.prop_deliberacao (proposta_id, decidido_em DESC);

-- ── estende a máquina de estados: avaliação → deliberação → resultado ──────
CREATE OR REPLACE FUNCTION public.fn_prop_transicionar(p_id UUID, p_acao TEXT, p_comentario TEXT DEFAULT NULL, p_ator UUID DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_de TEXT; v_para TEXT; v_origem TEXT; v_versao INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(2100, hashtext(p_id::text));
  SELECT * INTO r FROM prop_proposta WHERE id=p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','proposta_inexistente'); END IF;
  v_de := r.estado; v_origem := r.estado_origem; v_versao := r.versao;
  v_para := CASE
    WHEN p_acao='enviar' AND v_de='RASCUNHO' THEN CASE WHEN r.lider_usuario_id IS NULL OR r.lider_usuario_id = r.criado_por_usuario_id THEN 'AGUARDANDO_DIRETOR_AREA' ELSE 'AGUARDANDO_VALIDACAO_LIDER' END
    WHEN p_acao='validar' AND v_de='AGUARDANDO_VALIDACAO_LIDER' THEN 'AGUARDANDO_DIRETOR_AREA'
    WHEN p_acao='devolver_lider' AND v_de='AGUARDANDO_VALIDACAO_LIDER' THEN 'EM_AJUSTE'
    WHEN p_acao='aprovar' AND v_de='AGUARDANDO_DIRETOR_AREA' THEN 'EM_AVALIACAO'
    WHEN p_acao='devolver_area' AND v_de='AGUARDANDO_DIRETOR_AREA' THEN 'EM_AJUSTE'
    WHEN p_acao='negar' AND v_de='AGUARDANDO_DIRETOR_AREA' THEN 'REPROVADO_AREA'
    WHEN p_acao='reenviar' AND v_de='EM_AJUSTE' THEN COALESCE(v_origem,'AGUARDANDO_DIRETOR_AREA')
    WHEN p_acao='descartar' AND v_de IN ('RASCUNHO','EM_AJUSTE') THEN 'CANCELADO'
    -- Fase 2 · deliberação
    WHEN p_acao='entrar_deliberacao' AND v_de='EM_AVALIACAO' THEN 'EM_DELIBERACAO'
    WHEN p_acao='deliberar_aprovar' AND v_de='EM_DELIBERACAO' THEN 'APROVADO'
    WHEN p_acao='deliberar_ressalvas' AND v_de='EM_DELIBERACAO' THEN 'EM_ADEQUACAO'
    WHEN p_acao='deliberar_devolver' AND v_de='EM_DELIBERACAO' THEN 'EM_AJUSTE'
    WHEN p_acao='deliberar_reprovar' AND v_de='EM_DELIBERACAO' THEN 'AGUARDANDO_RECURSO'
    ELSE NULL END;
  IF v_para IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','transicao_invalida','estado',v_de,'acao',p_acao); END IF;
  IF p_acao IN ('negar','devolver_area','devolver_lider','deliberar_devolver','deliberar_reprovar') AND COALESCE(btrim(p_comentario),'')='' THEN RETURN jsonb_build_object('ok',false,'motivo','motivo_obrigatorio'); END IF;
  UPDATE prop_proposta SET estado=v_para, estado_origem=CASE WHEN v_para='EM_AJUSTE' THEN v_de ELSE estado_origem END, versao=CASE WHEN p_acao='reenviar' THEN versao+1 ELSE versao END, updated_at=now() WHERE id=p_id;
  INSERT INTO prop_log (proposta_id, de_estado, para_estado, acao, ator_usuario_id, comentario, versao) VALUES (p_id, v_de, v_para, p_acao, p_ator, NULLIF(btrim(p_comentario),''), CASE WHEN p_acao='reenviar' THEN v_versao+1 ELSE v_versao END);
  RETURN jsonb_build_object('ok',true,'de',v_de,'para',v_para);
END $fn$;
GRANT EXECUTE ON FUNCTION public.fn_prop_transicionar(UUID, TEXT, TEXT, UUID) TO service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['prop_avaliacao','prop_avaliacao_nota','prop_deliberacao'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS %1$s_sel ON public.%1$s;
      CREATE POLICY %1$s_sel ON public.%1$s FOR SELECT TO authenticated USING (public.current_user_module_level('propostas') >= 1);
      DROP POLICY IF EXISTS %1$s_wr ON public.%1$s;
      CREATE POLICY %1$s_wr ON public.%1$s FOR ALL TO authenticated USING (public.current_user_module_level('propostas') >= 2 OR public.is_super_admin()) WITH CHECK (public.current_user_module_level('propostas') >= 2 OR public.is_super_admin());
      DROP POLICY IF EXISTS %1$s_svc ON public.%1$s;
      CREATE POLICY %1$s_svc ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true);
    $p$, t);
  END LOOP;
END $$;

-- Módulo Propostas · Fase 3 — ressalvas, recurso, pós-evento, consolidação.
-- Idempotente.

-- ── prop_pos_evento · preenchido após a realização (1 por proposta) ────────
CREATE TABLE IF NOT EXISTS public.prop_pos_evento (
  proposta_id UUID PRIMARY KEY REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  data_realizacao DATE,
  resultados_obtidos TEXT,
  licoes_aprendidas TEXT,
  recomendacoes TEXT,
  avaliacao_final TEXT CHECK (avaliacao_final IN ('repetir','repetir_com_ajustes','nao_repetir') OR avaliacao_final IS NULL),
  registrado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prop_pos_evento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prop_pos_evento_sel ON public.prop_pos_evento;
CREATE POLICY prop_pos_evento_sel ON public.prop_pos_evento FOR SELECT TO authenticated USING (public.current_user_module_level('propostas') >= 1);
DROP POLICY IF EXISTS prop_pos_evento_wr ON public.prop_pos_evento;
CREATE POLICY prop_pos_evento_wr ON public.prop_pos_evento FOR ALL TO authenticated USING (public.current_user_module_level('propostas') >= 2 OR public.is_super_admin()) WITH CHECK (public.current_user_module_level('propostas') >= 2 OR public.is_super_admin());
DROP POLICY IF EXISTS prop_pos_evento_svc ON public.prop_pos_evento;
CREATE POLICY prop_pos_evento_svc ON public.prop_pos_evento FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── máquina de estados completa (todas as fases) ───────────────────────────
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
    WHEN p_acao='entrar_deliberacao' AND v_de='EM_AVALIACAO' THEN 'EM_DELIBERACAO'
    WHEN p_acao='deliberar_aprovar' AND v_de='EM_DELIBERACAO' THEN 'APROVADO'
    WHEN p_acao='deliberar_ressalvas' AND v_de='EM_DELIBERACAO' THEN 'EM_ADEQUACAO'
    WHEN p_acao='deliberar_devolver' AND v_de='EM_DELIBERACAO' THEN 'EM_AJUSTE'
    WHEN p_acao='deliberar_reprovar' AND v_de='EM_DELIBERACAO' THEN 'AGUARDANDO_RECURSO'
    -- Fase 3 · ressalvas
    WHEN p_acao='enviar_adequacao' AND v_de='EM_ADEQUACAO' THEN 'EM_VERIFICACAO_RESSALVAS'
    WHEN p_acao='ressalvas_atendidas' AND v_de='EM_VERIFICACAO_RESSALVAS' THEN 'APROVADO'
    WHEN p_acao='ressalvas_nao_atendidas' AND v_de='EM_VERIFICACAO_RESSALVAS' THEN 'EM_ADEQUACAO'
    -- Fase 3 · recurso
    WHEN p_acao='interpor_recurso' AND v_de='AGUARDANDO_RECURSO' THEN 'EM_REAVALIACAO'
    WHEN p_acao='recurso_expirado' AND v_de='AGUARDANDO_RECURSO' THEN 'REPROVADO'
    WHEN p_acao='reav_aprovar' AND v_de='EM_REAVALIACAO' THEN 'APROVADO'
    WHEN p_acao='reav_ressalvas' AND v_de='EM_REAVALIACAO' THEN 'EM_ADEQUACAO'
    WHEN p_acao='reav_manter' AND v_de='EM_REAVALIACAO' THEN 'REPROVADO'
    -- fechamento do ciclo
    WHEN p_acao='consolidar' AND v_de='APROVADO' THEN 'CONSOLIDADO'
    ELSE NULL END;
  IF v_para IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','transicao_invalida','estado',v_de,'acao',p_acao); END IF;
  IF p_acao IN ('negar','devolver_area','devolver_lider','deliberar_devolver','deliberar_reprovar','ressalvas_nao_atendidas','reav_manter') AND COALESCE(btrim(p_comentario),'')='' THEN RETURN jsonb_build_object('ok',false,'motivo','motivo_obrigatorio'); END IF;
  UPDATE prop_proposta SET estado=v_para, estado_origem=CASE WHEN v_para='EM_AJUSTE' THEN v_de ELSE estado_origem END, versao=CASE WHEN p_acao='reenviar' THEN versao+1 ELSE versao END, updated_at=now() WHERE id=p_id;
  INSERT INTO prop_log (proposta_id, de_estado, para_estado, acao, ator_usuario_id, comentario, versao) VALUES (p_id, v_de, v_para, p_acao, p_ator, NULLIF(btrim(p_comentario),''), CASE WHEN p_acao='reenviar' THEN v_versao+1 ELSE v_versao END);
  RETURN jsonb_build_object('ok',true,'de',v_de,'para',v_para);
END $fn$;
GRANT EXECUTE ON FUNCTION public.fn_prop_transicionar(UUID, TEXT, TEXT, UUID) TO service_role;

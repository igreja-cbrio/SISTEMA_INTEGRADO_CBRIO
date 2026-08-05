-- Módulo Propostas · fluxo simplificado (2026-08-05).
-- Decisão do Marcos: não existe mais decisão individual de aprovação/validação
-- (nem do líder, nem do diretor como "1º filtro" pré-avaliação). O líder da
-- área reúne as propostas informalmente e ele mesmo preenche o formulário; ao
-- enviar, a proposta vai direto pra EM_AVALIACAO (notas dos diretores) e depois
-- pra deliberação conjunta (Mural) — igual ao que já existia a partir daí.
-- Idempotente.

-- ── Novos campos do formulário reformulado (Critérios de avaliação) ────────
ALTER TABLE public.prop_proposta
  ADD COLUMN IF NOT EXISTS relevancia TEXT,
  ADD COLUMN IF NOT EXISTS pertencimento TEXT,
  ADD COLUMN IF NOT EXISTS transformacao TEXT,
  ADD COLUMN IF NOT EXISTS contribui_visao_cbrio BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS explicacao_visao_cbrio TEXT,
  ADD COLUMN IF NOT EXISTS espacos_necessarios TEXT,
  ADD COLUMN IF NOT EXISTS equipes_necessarias TEXT;

-- ── Máquina de estados: 'enviar' vai direto pra EM_AVALIACAO ────────────────
-- Os estados AGUARDANDO_VALIDACAO_LIDER / AGUARDANDO_DIRETOR_AREA (como gate
-- de aprovação) e as ações validar/devolver_lider/aprovar/devolver_area/negar
-- ficam inalcançáveis por esta função, mas PERMANECEM no CHECK de
-- prop_proposta.estado e em prop_log (TEXT, sem CHECK) — histórico intacto,
-- sem necessidade de tocar na constraint.
CREATE OR REPLACE FUNCTION public.fn_prop_transicionar(p_id UUID, p_acao TEXT, p_comentario TEXT DEFAULT NULL, p_ator UUID DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_de TEXT; v_para TEXT; v_origem TEXT; v_versao INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(2100, hashtext(p_id::text));
  SELECT * INTO r FROM prop_proposta WHERE id=p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','proposta_inexistente'); END IF;
  v_de := r.estado; v_origem := r.estado_origem; v_versao := r.versao;
  v_para := CASE
    WHEN p_acao='enviar' AND v_de='RASCUNHO' THEN 'EM_AVALIACAO'
    WHEN p_acao='reenviar' AND v_de='EM_AJUSTE' THEN COALESCE(v_origem,'EM_AVALIACAO')
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
  IF p_acao IN ('deliberar_devolver','deliberar_reprovar','ressalvas_nao_atendidas','reav_manter') AND COALESCE(btrim(p_comentario),'')='' THEN RETURN jsonb_build_object('ok',false,'motivo','motivo_obrigatorio'); END IF;
  UPDATE prop_proposta SET estado=v_para, estado_origem=CASE WHEN v_para='EM_AJUSTE' THEN v_de ELSE estado_origem END, versao=CASE WHEN p_acao='reenviar' THEN versao+1 ELSE versao END, updated_at=now() WHERE id=p_id;
  INSERT INTO prop_log (proposta_id, de_estado, para_estado, acao, ator_usuario_id, comentario, versao) VALUES (p_id, v_de, v_para, p_acao, p_ator, NULLIF(btrim(p_comentario),''), CASE WHEN p_acao='reenviar' THEN v_versao+1 ELSE v_versao END);
  RETURN jsonb_build_object('ok',true,'de',v_de,'para',v_para);
END $fn$;
GRANT EXECUTE ON FUNCTION public.fn_prop_transicionar(UUID, TEXT, TEXT, UUID) TO service_role;

-- ── Avança propostas hoje paradas nos gates removidos ───────────────────────
INSERT INTO prop_log (proposta_id, de_estado, para_estado, acao, ator_usuario_id, comentario, versao)
SELECT id, estado, 'EM_AVALIACAO', 'avanco_automatico', NULL,
       'Avançado automaticamente por mudança de fluxo (gates de validação do líder e 1º filtro do diretor removidos · migration 20260805000000)',
       versao
FROM prop_proposta
WHERE estado IN ('AGUARDANDO_VALIDACAO_LIDER','AGUARDANDO_DIRETOR_AREA') AND deleted_at IS NULL;

UPDATE prop_proposta
SET estado = 'EM_AVALIACAO', updated_at = now()
WHERE estado IN ('AGUARDANDO_VALIDACAO_LIDER','AGUARDANDO_DIRETOR_AREA') AND deleted_at IS NULL;

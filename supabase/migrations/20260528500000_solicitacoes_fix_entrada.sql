-- ============================================================================
-- Fix da ENTRADA do fluxo de Solicitacoes
-- Descoberto na validacao E2E do modulo Marketing (2026-05-28). 3 bugs latentes
-- (nunca surgiram porque 0 solicitacoes de marketing/reserva tinham sido criadas):
--   A · solicitacoes_categoria_check rejeitava 'marketing','reserva_espaco','licenca'
--       (o form e o backend oferecem · INSERT estourava CHECK · 500 no submit)
--   C · area_cliente era enum area_kpi (so 6 areas de culto) · o form manda 21
--       sub-areas (integracao, cuidados, rh, financeiro, ...) · INSERT estourava enum
--   B · roteamento de aprovacao hierarquica · funcao reusavel pro backend gravar
--       (o backend insere via service_role · auth.uid()=NULL · o trigger dispensava
--        tudo · a aba "Aprovar" do diretor nunca recebia nada)
--
-- Idempotente. Atomica (BEGIN/COMMIT). Nao-destrutiva (so amplia dominios).
-- ============================================================================

BEGIN;

-- ── BUG A · categoria CHECK aceita todas as categorias do formulario ─────────
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_categoria_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_categoria_check
  CHECK (categoria = ANY (ARRAY[
    'ti','compras','reembolso','espaco','reserva_espaco','infraestrutura',
    'ferias','licenca','marketing','outro'
  ]::text[]));

-- ── BUG C · area_cliente vira text ───────────────────────────────────────────
-- O enum area_kpi (kids/ami/bridge/sede/online/cba) so era usado por
-- solicitacoes.area_cliente e area_alcadas.area_cliente · nao toca KPI/NSM.
-- Converte ambos pra text. As 2 views dependentes sao recriadas identicas.
DROP VIEW IF EXISTS public.vw_solicitacoes_sla;
DROP VIEW IF EXISTS public.vw_reserva_espacos;

ALTER TABLE public.area_alcadas ALTER COLUMN area_cliente TYPE text USING area_cliente::text;
ALTER TABLE public.solicitacoes ALTER COLUMN area_cliente TYPE text USING area_cliente::text;

CREATE VIEW public.vw_reserva_espacos AS
 SELECT s.id,
        s.titulo,
        s.espaco_solicitado,
        s.data_uso,
        s.horario_inicio,
        s.horario_fim,
        s.qtde_pessoas,
        s.area_cliente,
        s.solicitante_id,
        s.status,
        s.created_at,
        p.name AS solicitante_nome
   FROM public.solicitacoes s
   LEFT JOIN public.profiles p ON p.id = s.solicitante_id
  WHERE s.area_responsavel = 'reserva_espaco'::area_adm_resp
    AND s.status <> 'rejeitado'::text
    AND s.data_uso IS NOT NULL
  ORDER BY s.data_uso, s.horario_inicio;

CREATE VIEW public.vw_solicitacoes_sla AS
 SELECT id,
        titulo,
        descricao,
        justificativa,
        categoria,
        urgencia,
        status,
        valor_estimado,
        solicitante_id,
        responsavel_id,
        area_solicitante,
        observacoes,
        created_at,
        updated_at,
        area_responsavel,
        area_cliente,
        subcategoria,
        eh_urgente,
        justificativa_urgencia,
        data_necessaria,
        respondido_em,
        concluido_em,
        sla_resposta_deadline,
        sla_resolucao_deadline,
        precisa_aprovacao_financeira,
        aprovado_financeiro_em,
        aprovado_financeiro_por,
        nps_nota,
        nps_comentario,
        proposta_orcamento,
        proposta_cronograma,
        espaco_solicitado,
        data_uso,
        horario_inicio,
        horario_fim,
        qtde_pessoas,
        CASE
            WHEN respondido_em IS NULL AND now() > sla_resposta_deadline THEN 'atrasado'::text
            WHEN respondido_em IS NULL THEN 'aguardando_resposta'::text
            WHEN respondido_em > sla_resposta_deadline THEN 'respondeu_atrasado'::text
            ELSE 'respondeu_no_prazo'::text
        END AS sla_resposta_status,
        CASE
            WHEN concluido_em IS NULL AND now() > sla_resolucao_deadline THEN 'atrasado'::text
            WHEN concluido_em IS NULL THEN 'em_andamento'::text
            WHEN concluido_em > sla_resolucao_deadline THEN 'concluiu_atrasado'::text
            ELSE 'concluiu_no_prazo'::text
        END AS sla_resolucao_status,
        CASE
            WHEN respondido_em IS NOT NULL THEN EXTRACT(epoch FROM respondido_em - created_at) / 3600::numeric
            ELSE EXTRACT(epoch FROM now() - created_at) / 3600::numeric
        END AS horas_para_resposta,
        CASE
            WHEN concluido_em IS NOT NULL THEN EXTRACT(epoch FROM concluido_em - created_at) / 3600::numeric
            ELSE EXTRACT(epoch FROM now() - created_at) / 3600::numeric
        END AS horas_total
   FROM public.solicitacoes s;

-- ── BUG B · funcao de roteamento reusavel (backend chama no INSERT) ──────────
-- Espelha as regras de dispensa do trigger fn_solicitacoes_roteamento_aprovacao
-- mas SEM depender de auth.uid() (o backend usa service_role). O backend resolve
-- e grava aprovacao_origem_* + status no insert. O trigger continua de rede de
-- seguranca: como aprovacao_origem_status vem preenchido, ele nao sobrescreve.
CREATE OR REPLACE FUNCTION public.fn_solicitacoes_rotear_origem(p_solicitante_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_is_diretor_setor   boolean;
  v_is_diretoria_geral boolean;
  v_diretor_id         uuid;
BEGIN
  IF p_solicitante_id IS NULL THEN
    RETURN jsonb_build_object(
      'diretor_id', NULL, 'aprovacao_status', 'dispensada',
      'motivo', 'Sem solicitante', 'status', 'pendente');
  END IF;

  -- Dispensa #1 · solicitante eh um dos 3 diretores de setor
  SELECT EXISTS(SELECT 1 FROM public.setor_diretor WHERE diretor_id = p_solicitante_id)
    INTO v_is_diretor_setor;

  -- Dispensa #2 · solicitante eh diretoria geral
  SELECT COALESCE(is_diretoria_geral, false) INTO v_is_diretoria_geral
    FROM public.profiles WHERE id = p_solicitante_id;

  IF v_is_diretor_setor OR v_is_diretoria_geral THEN
    RETURN jsonb_build_object(
      'diretor_id', NULL, 'aprovacao_status', 'dispensada',
      'motivo', CASE WHEN v_is_diretor_setor THEN 'Solicitante eh diretor de setor'
                     ELSE 'Solicitante eh diretoria geral' END,
      'status', 'pendente');
  END IF;

  -- Caso normal · resolve o diretor de origem pelo setor do solicitante
  SELECT diretor_id INTO v_diretor_id
    FROM public.fn_solicitacoes_resolver_diretor_origem(p_solicitante_id);

  IF v_diretor_id IS NULL THEN
    -- Fallback · sem diretor mapeado · dispensa (super-admins assumem)
    RETURN jsonb_build_object(
      'diretor_id', NULL, 'aprovacao_status', 'dispensada',
      'motivo', 'Sem diretor mapeado para o setor do solicitante · fallback super-admin',
      'status', 'pendente');
  END IF;

  -- Roteia pro diretor de origem
  RETURN jsonb_build_object(
    'diretor_id', v_diretor_id, 'aprovacao_status', 'pendente',
    'motivo', NULL, 'status', 'aguardando_aprovacao_origem');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_solicitacoes_rotear_origem(uuid) TO authenticated, service_role;

COMMIT;

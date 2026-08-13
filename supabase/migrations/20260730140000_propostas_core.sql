-- Módulo Propostas · Fase 1B — a proposta em si: schema + máquina de estados
-- (até EM_AVALIACAO) + log append-only + snapshot + derivados. Idempotente.

-- ── prop_proposta ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prop_proposta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES public.prop_ciclo(id) ON DELETE RESTRICT,
  codigo TEXT,                       -- sequencial por ciclo (trigger) ex.: 2026-014
  seq INTEGER,                       -- número dentro do ciclo (trigger)
  tipo TEXT NOT NULL CHECK (tipo IN ('projeto','evento','rotina')),
  area_id INTEGER REFERENCES public.areas(id) ON DELETE SET NULL,
  lider_usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por_usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (estado IN (
    'RASCUNHO','AGUARDANDO_VALIDACAO_LIDER','AGUARDANDO_DIRETOR_AREA','EM_AJUSTE',
    'REPROVADO_AREA','EM_AVALIACAO','EM_DELIBERACAO','APROVADO','EM_ADEQUACAO',
    'EM_VERIFICACAO_RESSALVAS','AGUARDANDO_RECURSO','EM_REAVALIACAO','REPROVADO',
    'CANCELADO','CONSOLIDADO')),
  estado_origem TEXT,
  versao INTEGER NOT NULL DEFAULT 1,
  -- conteúdo (§5.2)
  titulo TEXT,
  equipe_envolvida TEXT,
  ano_execucao INTEGER,
  data_inicio_prevista DATE,
  data_termino_prevista DATE,
  data_realizacao_prevista DATE,
  frequencia TEXT,
  periodo_do_ano TEXT,
  periodo_previsto TEXT,
  descricao_motivacao TEXT,
  justificativa_geral TEXT,
  colabora_plano_expansao BOOLEAN,
  explicacao_alinhamento TEXT,
  como_gera_unidade TEXT,
  objetivo_geral TEXT,
  objetivos_especificos TEXT,
  publico_alvo TEXT,
  participantes_estimados INTEGER,
  complexidade TEXT CHECK (complexidade IN ('baixa','media','alta') OR complexidade IS NULL),
  impacto_esperado TEXT CHECK (impacto_esperado IN ('baixo','medio','alto') OR impacto_esperado IS NULL),
  custo_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  arrecadacao_prevista NUMERIC(14,2) NOT NULL DEFAULT 0,
  custo_liquido NUMERIC(14,2) NOT NULL DEFAULT 0,       -- derivado
  classificacao_custo TEXT,                             -- derivado
  recursos_materiais TEXT,
  recursos_patrimoniais TEXT,
  suporte_equipes TEXT,
  retorno_esperado TEXT,
  centro_de_custo TEXT,
  informacoes_contabeis TEXT,
  passa_no_ourico BOOLEAN,
  justificativa_ourico TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_prop_proposta_ciclo ON public.prop_proposta (ciclo_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prop_proposta_estado ON public.prop_proposta (estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prop_proposta_lider ON public.prop_proposta (lider_usuario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prop_proposta_area ON public.prop_proposta (area_id) WHERE deleted_at IS NULL;

-- ── tabelas-filhas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prop_indicador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0, indicador TEXT, meta TEXT, forma_medicao TEXT
);
CREATE TABLE IF NOT EXISTS public.prop_atividade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0, etapa TEXT, responsavel TEXT, prazo TEXT
);
CREATE TABLE IF NOT EXISTS public.prop_risco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0, risco TEXT, mitigacao TEXT
);
CREATE TABLE IF NOT EXISTS public.prop_desembolso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0, referencia TEXT, valor NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.prop_anexo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0, nome TEXT, storage_path TEXT,
  enviado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prop_indicador_p ON public.prop_indicador (proposta_id);
CREATE INDEX IF NOT EXISTS idx_prop_atividade_p ON public.prop_atividade (proposta_id);
CREATE INDEX IF NOT EXISTS idx_prop_risco_p ON public.prop_risco (proposta_id);
CREATE INDEX IF NOT EXISTS idx_prop_desembolso_p ON public.prop_desembolso (proposta_id);
CREATE INDEX IF NOT EXISTS idx_prop_anexo_p ON public.prop_anexo (proposta_id);

-- ── prop_log (append-only) + prop_snapshot ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prop_log (
  id BIGSERIAL PRIMARY KEY,
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  de_estado TEXT, para_estado TEXT, acao TEXT NOT NULL,
  ator_usuario_id UUID, comentario TEXT, versao INTEGER,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prop_log_proposta ON public.prop_log (proposta_id, ocorrido_em DESC);

CREATE TABLE IF NOT EXISTS public.prop_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id UUID NOT NULL REFERENCES public.prop_proposta(id) ON DELETE CASCADE,
  versao INTEGER, payload JSONB, criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── derivados: custo_liquido + classificacao_custo + codigo sequencial ─────
CREATE OR REPLACE FUNCTION public.fn_prop_derivados() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_baixo NUMERIC; v_medio NUMERIC;
BEGIN
  NEW.custo_liquido := COALESCE(NEW.custo_total,0) - COALESCE(NEW.arrecadacao_prevista,0);
  SELECT NULLIF(valor,'')::numeric INTO v_baixo FROM prop_parametro WHERE ciclo_id=NEW.ciclo_id AND chave='faixa_custo_baixo_ate';
  SELECT NULLIF(valor,'')::numeric INTO v_medio FROM prop_parametro WHERE ciclo_id=NEW.ciclo_id AND chave='faixa_custo_medio_ate';
  IF v_baixo IS NULL AND v_medio IS NULL THEN NEW.classificacao_custo := 'nao_classificado';
  ELSIF v_baixo IS NOT NULL AND NEW.custo_liquido <= v_baixo THEN NEW.classificacao_custo := 'baixo';
  ELSIF v_medio IS NOT NULL AND NEW.custo_liquido <= v_medio THEN NEW.classificacao_custo := 'medio';
  ELSE NEW.classificacao_custo := 'alto';
  END IF;
  -- código sequencial por ciclo, atribuído uma vez (advisory lock evita corrida)
  IF NEW.seq IS NULL THEN
    PERFORM pg_advisory_xact_lock(2101, hashtext(NEW.ciclo_id::text));
    SELECT COALESCE(MAX(seq),0)+1 INTO NEW.seq FROM prop_proposta WHERE ciclo_id=NEW.ciclo_id;
    NEW.codigo := (SELECT ano FROM prop_ciclo WHERE id=NEW.ciclo_id)::text || '-' || lpad(NEW.seq::text,3,'0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_prop_derivados ON public.prop_proposta;
CREATE TRIGGER trg_prop_derivados BEFORE INSERT OR UPDATE ON public.prop_proposta
  FOR EACH ROW EXECUTE FUNCTION public.fn_prop_derivados();

-- ── RPC de transição de estado (máquina de estados · Fase 1B) ──────────────
-- Autorização (quem pode) é no backend; aqui é a transição atômica + log.
CREATE OR REPLACE FUNCTION public.fn_prop_transicionar(
  p_id UUID, p_acao TEXT, p_comentario TEXT DEFAULT NULL, p_ator UUID DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_de TEXT; v_para TEXT; v_origem TEXT; v_versao INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(2100, hashtext(p_id::text));
  SELECT * INTO r FROM prop_proposta WHERE id=p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','proposta_inexistente'); END IF;
  v_de := r.estado; v_origem := r.estado_origem; v_versao := r.versao;

  v_para := CASE
    WHEN p_acao='enviar' AND v_de='RASCUNHO' THEN
      CASE WHEN r.lider_usuario_id IS NULL OR r.lider_usuario_id = r.criado_por_usuario_id
           THEN 'AGUARDANDO_DIRETOR_AREA' ELSE 'AGUARDANDO_VALIDACAO_LIDER' END
    WHEN p_acao='validar' AND v_de='AGUARDANDO_VALIDACAO_LIDER' THEN 'AGUARDANDO_DIRETOR_AREA'
    WHEN p_acao='devolver_lider' AND v_de='AGUARDANDO_VALIDACAO_LIDER' THEN 'EM_AJUSTE'
    WHEN p_acao='aprovar' AND v_de='AGUARDANDO_DIRETOR_AREA' THEN 'EM_AVALIACAO'
    WHEN p_acao='devolver_area' AND v_de='AGUARDANDO_DIRETOR_AREA' THEN 'EM_AJUSTE'
    WHEN p_acao='negar' AND v_de='AGUARDANDO_DIRETOR_AREA' THEN 'REPROVADO_AREA'
    WHEN p_acao='reenviar' AND v_de='EM_AJUSTE' THEN COALESCE(v_origem,'AGUARDANDO_DIRETOR_AREA')
    WHEN p_acao='descartar' AND v_de IN ('RASCUNHO','EM_AJUSTE') THEN 'CANCELADO'
    ELSE NULL END;

  IF v_para IS NULL THEN
    RETURN jsonb_build_object('ok',false,'motivo','transicao_invalida','estado',v_de,'acao',p_acao);
  END IF;
  IF p_acao IN ('negar','devolver_area','devolver_lider') AND COALESCE(btrim(p_comentario),'')='' THEN
    RETURN jsonb_build_object('ok',false,'motivo','motivo_obrigatorio');
  END IF;

  UPDATE prop_proposta SET
    estado = v_para,
    estado_origem = CASE WHEN v_para='EM_AJUSTE' THEN v_de ELSE estado_origem END,
    versao = CASE WHEN p_acao='reenviar' THEN versao+1 ELSE versao END,
    updated_at = now()
  WHERE id=p_id;

  INSERT INTO prop_log (proposta_id, de_estado, para_estado, acao, ator_usuario_id, comentario, versao)
  VALUES (p_id, v_de, v_para, p_acao, p_ator, NULLIF(btrim(p_comentario),''),
          CASE WHEN p_acao='reenviar' THEN v_versao+1 ELSE v_versao END);

  RETURN jsonb_build_object('ok',true,'de',v_de,'para',v_para);
END $fn$;

-- ── whitelist de soft-delete · APPEND dinâmico (preserva a lista viva) ─────
DO $$
DECLARE atual TEXT[]; nova TEXT[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO atual;
  IF 'prop_proposta' = ANY(atual) THEN RETURN; END IF;
  nova := atual || ARRAY['prop_proposta'];
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS %L',
    'SELECT ' || quote_literal(nova) || '::TEXT[]'
  );
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  -- tabelas normais (proposta + filhas): leitura módulo>=1, escrita >=2, delete super-admin
  FOREACH t IN ARRAY ARRAY['prop_proposta','prop_indicador','prop_atividade','prop_risco','prop_desembolso','prop_anexo','prop_snapshot'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS %1$s_sel ON public.%1$s;
      CREATE POLICY %1$s_sel ON public.%1$s FOR SELECT TO authenticated
        USING (public.current_user_module_level('propostas') >= 1);
      DROP POLICY IF EXISTS %1$s_wr ON public.%1$s;
      CREATE POLICY %1$s_wr ON public.%1$s FOR ALL TO authenticated
        USING (public.current_user_module_level('propostas') >= 2 OR public.is_super_admin())
        WITH CHECK (public.current_user_module_level('propostas') >= 2 OR public.is_super_admin());
      DROP POLICY IF EXISTS %1$s_svc ON public.%1$s;
      CREATE POLICY %1$s_svc ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true);
    $p$, t);
  END LOOP;
  -- prop_log: append-only (só INSERT + SELECT · sem UPDATE/DELETE)
  EXECUTE 'ALTER TABLE public.prop_log ENABLE ROW LEVEL SECURITY';
  DROP POLICY IF EXISTS prop_log_sel ON public.prop_log;
  CREATE POLICY prop_log_sel ON public.prop_log FOR SELECT TO authenticated
    USING (public.current_user_module_level('propostas') >= 1);
  DROP POLICY IF EXISTS prop_log_ins ON public.prop_log;
  CREATE POLICY prop_log_ins ON public.prop_log FOR INSERT TO authenticated
    WITH CHECK (public.current_user_module_level('propostas') >= 2);
  DROP POLICY IF EXISTS prop_log_svc ON public.prop_log;
  CREATE POLICY prop_log_svc ON public.prop_log FOR ALL TO service_role USING (true) WITH CHECK (true);
END $$;

GRANT EXECUTE ON FUNCTION public.fn_prop_transicionar(UUID, TEXT, TEXT, UUID) TO service_role;

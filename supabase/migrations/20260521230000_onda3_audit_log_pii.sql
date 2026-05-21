-- =====================================================================
-- Onda 3 follow-up · Audit log de mudanças em dados sensíveis
-- =====================================================================
-- Postgres não tem trigger nativo de SELECT · então auditamos
-- mudanças (INSERT/UPDATE/DELETE) em colunas sensíveis.
--
-- Permite responder perguntas tipo:
--   - Quem mudou o salário do funcionário X em qual data?
--   - Quem deletou o registro de batismo do membro Y?
--   - Histórico de CPF de mem_membros (em caso de fraude)
--
-- Estratégia:
--   1. Tabela `app_audit_log` armazena cada mudança (JSONB com before/after)
--   2. Função genérica `audit_log_changes()` trigger
--   3. Triggers em 6 tabelas críticas
--   4. Policies · só super-admin lê (audit é confidencial · só Marcos/Matheus)
-- =====================================================================

-- =====================================================================
-- ETAPA 1 · Tabela app_audit_log
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.app_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  table_name   TEXT NOT NULL,
  row_id       TEXT NOT NULL,           -- TEXT pra aceitar UUID e composta
  action       TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  user_id      UUID,                    -- auth.uid() na hora da mudança
  user_email   TEXT,                    -- snapshot do email pra debug futuro
  changes      JSONB,                   -- {col: {old, new}} pra UPDATE · OLD pra DELETE · NEW pra INSERT
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_audit_log_table_row
  ON public.app_audit_log (table_name, row_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_user
  ON public.app_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_created
  ON public.app_audit_log (created_at DESC);

COMMENT ON TABLE public.app_audit_log IS
  'Audit log de mudanças em tabelas com PII sensível. Imutável (RLS bloqueia UPDATE/DELETE). Só super-admin lê.';

-- RLS · só super-admin lê · só service_role escreve (trigger usa role
-- da função, que é STABLE SECURITY DEFINER · não preciso de policy
-- de INSERT pra trigger)
ALTER TABLE public.app_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_audit_log_select  ON public.app_audit_log;
DROP POLICY IF EXISTS app_audit_log_insert  ON public.app_audit_log;
DROP POLICY IF EXISTS app_audit_log_service ON public.app_audit_log;

CREATE POLICY app_audit_log_select ON public.app_audit_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Nenhuma policy de UPDATE/DELETE · audit log é imutável

CREATE POLICY app_audit_log_service ON public.app_audit_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Permite trigger (que roda como definer) inserir
GRANT INSERT ON public.app_audit_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app_audit_log_id_seq TO authenticated;

-- =====================================================================
-- ETAPA 2 · Função trigger genérica audit_log_changes()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_row_id TEXT;
  v_changes JSONB;
  v_col TEXT;
  v_old JSONB;
  v_new JSONB;
  v_audited_cols TEXT[];
BEGIN
  -- Captura user
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id LIMIT 1;
  END IF;

  -- Determina row_id (id ou chave composta)
  IF TG_OP = 'DELETE' THEN
    v_row_id := COALESCE(OLD.id::text, OLD::text);
    v_old := to_jsonb(OLD);
    v_changes := v_old;
  ELSIF TG_OP = 'INSERT' THEN
    v_row_id := COALESCE(NEW.id::text, NEW::text);
    v_new := to_jsonb(NEW);
    v_changes := v_new;
  ELSE -- UPDATE
    v_row_id := COALESCE(NEW.id::text, NEW::text);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    -- Calcula diff · só colunas que mudaram
    -- TG_ARGV[0] pode conter lista de colunas a auditar (CSV)
    -- Se vazio, audita TODAS as colunas que mudaram (exceto updated_at)
    IF TG_NARGS >= 1 AND TG_ARGV[0] IS NOT NULL AND TG_ARGV[0] != '' THEN
      v_audited_cols := string_to_array(TG_ARGV[0], ',');
    END IF;

    v_changes := '{}'::jsonb;
    FOR v_col IN SELECT jsonb_object_keys(v_new) LOOP
      -- Pula colunas técnicas
      IF v_col IN ('updated_at','created_at') THEN CONTINUE; END IF;
      -- Se whitelist definida, só audita ela
      IF v_audited_cols IS NOT NULL AND NOT (v_col = ANY(v_audited_cols)) THEN
        CONTINUE;
      END IF;
      -- Loga só se mudou
      IF v_new->v_col IS DISTINCT FROM v_old->v_col THEN
        v_changes := v_changes || jsonb_build_object(v_col,
          jsonb_build_object('old', v_old->v_col, 'new', v_new->v_col));
      END IF;
    END LOOP;

    -- Se nada mudou (nas colunas auditadas), sai sem logar
    IF v_changes = '{}'::jsonb THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- Insere no audit log
  INSERT INTO public.app_audit_log (table_name, row_id, action, user_id, user_email, changes)
  VALUES (TG_TABLE_NAME, v_row_id, TG_OP, v_user_id, v_user_email, v_changes);

  RETURN COALESCE(NEW, OLD);
END
$$;

COMMENT ON FUNCTION public.audit_log_changes() IS
  'Trigger genérica de audit log. TG_ARGV[0] opcional: CSV de colunas a auditar (default: todas exceto updated_at/created_at).';

-- =====================================================================
-- ETAPA 3 · Triggers nas tabelas críticas
-- =====================================================================

-- rh_funcionarios · audita salário, grau_id, status, data_demissao, cpf
DROP TRIGGER IF EXISTS trg_audit_rh_funcionarios ON public.rh_funcionarios;
CREATE TRIGGER trg_audit_rh_funcionarios
AFTER INSERT OR UPDATE OR DELETE ON public.rh_funcionarios
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'salario,remuneracao_bruta,grau_id,status,data_demissao,data_admissao,cpf,email,deleted_at'
);

-- mem_membros · audita CPF, status, deleted_at
DROP TRIGGER IF EXISTS trg_audit_mem_membros ON public.mem_membros;
CREATE TRIGGER trg_audit_mem_membros
AFTER INSERT OR UPDATE OR DELETE ON public.mem_membros
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'cpf,status,deleted_at,nome,email,telefone'
);

-- mem_contribuicoes · audita valor, tipo, deleted_at
DROP TRIGGER IF EXISTS trg_audit_mem_contribuicoes ON public.mem_contribuicoes;
CREATE TRIGGER trg_audit_mem_contribuicoes
AFTER INSERT OR UPDATE OR DELETE ON public.mem_contribuicoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'valor,tipo,membro_id,deleted_at'
);

-- pcs_progressoes · audita mudanças salariais
DROP TRIGGER IF EXISTS trg_audit_pcs_progressoes ON public.pcs_progressoes;
CREATE TRIGGER trg_audit_pcs_progressoes
AFTER INSERT OR UPDATE OR DELETE ON public.pcs_progressoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'salario_anterior,salario_novo,remun_bruta_anterior,remun_bruta_nova,grau_anterior_id,grau_novo_id,aprovado_por,deleted_at'
);

-- batismo_inscricoes · audita CPF, status
DROP TRIGGER IF EXISTS trg_audit_batismo_inscricoes ON public.batismo_inscricoes;
CREATE TRIGGER trg_audit_batismo_inscricoes
AFTER INSERT OR UPDATE OR DELETE ON public.batismo_inscricoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'cpf,status,membro_id,deleted_at'
);

-- cultos_decisoes_pessoas · audita CPF
DROP TRIGGER IF EXISTS trg_audit_cultos_decisoes ON public.cultos_decisoes_pessoas;
CREATE TRIGGER trg_audit_cultos_decisoes
AFTER INSERT OR UPDATE OR DELETE ON public.cultos_decisoes_pessoas
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'cpf,responsavel_cpf,telefone,responsavel_telefone,membro_id,deleted_at'
);

-- cargo_modulo_permissao · audita mudanças na matriz (controle de poder)
DROP TRIGGER IF EXISTS trg_audit_cargo_modulo_permissao ON public.cargo_modulo_permissao;
CREATE TRIGGER trg_audit_cargo_modulo_permissao
AFTER INSERT OR UPDATE OR DELETE ON public.cargo_modulo_permissao
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'nivel,pode_exportar,pode_aprovar,escopo_proprio'
);

-- app_super_admins · qualquer mudança na lista de admins
DROP TRIGGER IF EXISTS trg_audit_super_admins ON public.app_super_admins;
CREATE TRIGGER trg_audit_super_admins
AFTER INSERT OR UPDATE OR DELETE ON public.app_super_admins
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'email,ativo,nome'
);

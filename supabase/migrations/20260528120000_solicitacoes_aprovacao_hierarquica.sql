-- ============================================================================
-- MIGRATION · Solicitacoes · Aprovacao hierarquica pelo diretor de origem
-- ============================================================================
-- Spec 001 (TRANSVERSAL) do modulo Marketing · afeta TODAS as areas, nao so MKT
--
-- Mudancas:
--   1. Tabela setor_diretor (3 linhas seed)
--   2. Flag is_diretoria_geral=true em Eduardo + Pedro Menezes
--   3. 8 colunas novas em solicitacoes (aprovacao_origem_* + urgencia_*)
--   4. Novo status 'aguardando_aprovacao_origem' no CHECK
--   5. Funcao fn_solicitacoes_resolver_diretor_origem (mapeia profile.area->setor)
--   6. Trigger fn_solicitacoes_roteamento_aprovacao (BEFORE INSERT)
--      - Bloqueia POST de quem NAO eh funcionario (current_user_funcionario_id IS NULL)
--      - Dispensa diretores de setor + diretoria_geral
--      - Fallback super-admins se diretor nao encontrado
--   7. Indices parciais p/ fila do diretor
--   8. Audit trigger estendido
--
-- Mapeamento DISTINCT profile.area -> setor (consulta pre-flight 2026-05-28):
--   Criativo  (9 profiles) -> Criativo    (Pedro Menezes)
--   Gestao    (1 profile)  -> Gestao      (Eduardo) · normaliza acento
--   Gestao    (12 profiles)-> Gestao      (Eduardo)
--   Ministerial (14 profs) -> Ministerial (Arthur Serpa)
--   Voluntariado (1)       -> Ministerial (Arthur Serpa) · Ariel Jardim
--
-- Backward compat: solicitacoes pre-existentes ficam com aprovacao_origem_status
-- = NULL · trigger so atua em INSERTs novos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Flag is_diretoria_geral=true nos 2 diretores que ainda nao tinham
-- ----------------------------------------------------------------------------
-- Arthur Serpa ja tinha · Pedrao nao tem profile · Juninho ja tinha.
-- Eduardo Gnisci e Pedro Menezes precisam do flag pra dispensar aprovacao.

UPDATE public.profiles
   SET is_diretoria_geral = true,
       funcao_diretoria   = COALESCE(funcao_diretoria, 'Lider de Gestao')
 WHERE id = '341991ac-a4b9-4754-bc3e-14bc89b32f26'  -- Eduardo Gnisci
   AND COALESCE(is_diretoria_geral, false) = false;

UPDATE public.profiles
   SET is_diretoria_geral = true,
       funcao_diretoria   = COALESCE(funcao_diretoria, 'Lider Criativo')
 WHERE id = '381800fb-c6ed-443c-95fe-50799419bea3'  -- Pedro Menezes
   AND COALESCE(is_diretoria_geral, false) = false;

-- ----------------------------------------------------------------------------
-- 2. Tabela setor_diretor
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.setor_diretor (
  setor         text PRIMARY KEY,
  diretor_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  diretor_nome  text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.setor_diretor IS
  'Mapeamento setor (profile.area normalizado) -> diretor de origem para aprovacao hierarquica de solicitacoes. Seedado com as 3 diretorias da CBRio (Gestao/Criativo/Ministerial · 2026-05-28).';

INSERT INTO public.setor_diretor (setor, diretor_id, diretor_nome)
VALUES
  ('Gestao',      '341991ac-a4b9-4754-bc3e-14bc89b32f26', 'Eduardo Gnisci'),
  ('Criativo',    '381800fb-c6ed-443c-95fe-50799419bea3', 'Pedro Menezes'),
  ('Ministerial', '77a2347e-606d-439f-a094-ef9e46821bcf', 'Arthur Serpa')
ON CONFLICT (setor) DO UPDATE
  SET diretor_id   = EXCLUDED.diretor_id,
      diretor_nome = EXCLUDED.diretor_nome,
      updated_at   = now();

-- RLS · setor_diretor eh referencia operacional (catalogo)
ALTER TABLE public.setor_diretor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS setor_diretor_read ON public.setor_diretor;
CREATE POLICY setor_diretor_read ON public.setor_diretor
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS setor_diretor_write ON public.setor_diretor;
CREATE POLICY setor_diretor_write ON public.setor_diretor
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS setor_diretor_service ON public.setor_diretor;
CREATE POLICY setor_diretor_service ON public.setor_diretor
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3. Colunas novas em solicitacoes
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes
  ADD COLUMN IF NOT EXISTS aprovacao_origem_diretor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_origem_status     text,
  ADD COLUMN IF NOT EXISTS aprovacao_origem_em         timestamptz,
  ADD COLUMN IF NOT EXISTS aprovacao_origem_motivo     text,
  ADD COLUMN IF NOT EXISTS urgencia_decisao            text,
  ADD COLUMN IF NOT EXISTS urgencia_decidida_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS urgencia_motivo_recusa      text,
  ADD COLUMN IF NOT EXISTS urgencia_decidida_em        timestamptz;

-- CHECK pros novos enums (NULL aceito · backward compat)
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_aprovacao_origem_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_aprovacao_origem_status_check
  CHECK (aprovacao_origem_status IS NULL OR aprovacao_origem_status IN
    ('pendente', 'aprovada', 'rejeitada', 'dispensada'));

ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_urgencia_decisao_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_urgencia_decisao_check
  CHECK (urgencia_decisao IS NULL OR urgencia_decisao IN
    ('nao_aplicavel', 'pendente', 'aceita', 'recusada'));

-- ----------------------------------------------------------------------------
-- 4. Expande CHECK de status para incluir 'aguardando_aprovacao_origem'
-- ----------------------------------------------------------------------------
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_status_check
  CHECK (status IN (
    'aguardando_aprovacao_origem',  -- NOVO · antes de pendente
    'pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido',
    'aguardando_aprovacao_financeira', 'em_atendimento', 'aguardando_entrega', 'avaliado'
  ));

-- ----------------------------------------------------------------------------
-- 5. Helper · normalizar setor (unaccent + mapear Voluntariado -> Ministerial)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.fn_normalizar_setor(p_area text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH norm AS (
    SELECT LOWER(unaccent(TRIM(p_area))) AS valor
  )
  SELECT CASE
    WHEN valor IN ('gestao', 'gestão')                           THEN 'Gestao'
    WHEN valor IN ('criativo', 'criativa')                       THEN 'Criativo'
    WHEN valor IN ('ministerial', 'ministério', 'ministerio',
                   'voluntariado', 'voluntariada', 'pastoral')   THEN 'Ministerial'
    ELSE NULL
  END
  FROM norm
$$;

COMMENT ON FUNCTION public.fn_normalizar_setor(text) IS
  'Mapeia profile.area -> setor (Gestao/Criativo/Ministerial) usado em setor_diretor.';

GRANT EXECUTE ON FUNCTION public.fn_normalizar_setor(text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Funcao · resolver diretor de origem
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_solicitacoes_resolver_diretor_origem(p_solicitante_id uuid)
RETURNS TABLE(diretor_id uuid, diretor_nome text, setor text)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_area text;
  v_setor text;
BEGIN
  SELECT area INTO v_area FROM public.profiles WHERE id = p_solicitante_id;
  IF v_area IS NULL THEN
    RETURN;
  END IF;
  v_setor := public.fn_normalizar_setor(v_area);
  IF v_setor IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT sd.diretor_id, sd.diretor_nome, sd.setor
      FROM public.setor_diretor sd
     WHERE sd.setor = v_setor;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_solicitacoes_resolver_diretor_origem(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Trigger · BEFORE INSERT em solicitacoes
--    - Bloqueia POST de nao-funcionario (regra Marcos 2026-05-28)
--    - Decide se dispensa aprovacao (diretor de setor / diretoria geral / super-admin)
--    - Senao roteia pra diretor de origem
--    - Se diretor nao encontrado · fallback pros super-admins (NULL no diretor_id +
--      marca dispensada com motivo, deixando rastro no audit log)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_solicitacoes_roteamento_aprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_diretor_id uuid;
  v_diretor_nome text;
  v_setor text;
  v_is_diretor_setor boolean;
  v_is_diretoria_geral boolean;
  v_funcionario_id uuid;
BEGIN
  -- Pular logica se for service_role (backend admin, jobs, seeds)
  -- · service_role bypassa RLS · trigger ainda dispara mas confiamos no caller
  -- · INSERT direto via SQL Editor tambem pula (auth.uid() retorna NULL)
  IF auth.uid() IS NULL THEN
    -- Caller eh service_role ou SQL puro · so popula default e segue
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

  -- Apenas funcionarios criam solicitacao (Marcos 2026-05-28 · "membros nao fazem solicitacoes")
  v_funcionario_id := public.current_user_funcionario_id();
  IF v_funcionario_id IS NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas funcionarios podem criar solicitacoes (sem vinculo rh_funcionarios)'
      USING ERRCODE = '42501';
  END IF;

  -- Default urgencia_decisao
  IF NEW.urgencia_decisao IS NULL THEN
    NEW.urgencia_decisao := CASE WHEN COALESCE(NEW.eh_urgente, false) THEN 'pendente' ELSE 'nao_aplicavel' END;
  END IF;

  -- Se o caller ja preencheu aprovacao_origem_status (caso raro · seed/migration),
  -- nao mexer
  IF NEW.aprovacao_origem_status IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Regra de dispensa #1 · solicitante eh um dos 3 diretores de setor
  SELECT EXISTS(
    SELECT 1 FROM public.setor_diretor WHERE diretor_id = NEW.solicitante_id
  ) INTO v_is_diretor_setor;

  -- Regra de dispensa #2 · solicitante eh diretoria geral
  SELECT COALESCE(is_diretoria_geral, false) INTO v_is_diretoria_geral
    FROM public.profiles WHERE id = NEW.solicitante_id;

  IF v_is_diretor_setor OR v_is_diretoria_geral THEN
    NEW.aprovacao_origem_status := 'dispensada';
    NEW.aprovacao_origem_motivo := CASE
      WHEN v_is_diretor_setor   THEN 'Solicitante eh diretor de setor'
      WHEN v_is_diretoria_geral THEN 'Solicitante eh diretoria geral'
    END;
    NEW.aprovacao_origem_em := now();
    -- status do kanban segue pro fluxo normal (pendente)
    IF NEW.status IS NULL OR NEW.status = 'aguardando_aprovacao_origem' THEN
      NEW.status := 'pendente';
    END IF;
    RETURN NEW;
  END IF;

  -- Caso normal · resolve diretor de origem
  SELECT diretor_id, diretor_nome, setor
    INTO v_diretor_id, v_diretor_nome, v_setor
    FROM public.fn_solicitacoes_resolver_diretor_origem(NEW.solicitante_id);

  IF v_diretor_id IS NULL THEN
    -- Fallback · sem diretor mapeado · dispensa com motivo (super-admins assumem)
    NEW.aprovacao_origem_status := 'dispensada';
    NEW.aprovacao_origem_motivo := 'Sem diretor mapeado para o setor do solicitante · fallback super-admin';
    NEW.aprovacao_origem_em := now();
    IF NEW.status IS NULL OR NEW.status = 'aguardando_aprovacao_origem' THEN
      NEW.status := 'pendente';
    END IF;
    RETURN NEW;
  END IF;

  -- Roteia pro diretor de origem
  NEW.aprovacao_origem_diretor_id := v_diretor_id;
  NEW.aprovacao_origem_status := 'pendente';
  NEW.status := 'aguardando_aprovacao_origem';
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_solicitacoes_roteamento_aprovacao() IS
  'BEFORE INSERT em solicitacoes · bloqueia nao-funcionarios, dispensa diretores+diretoria geral, roteia outros pro diretor de origem.';

DROP TRIGGER IF EXISTS tg_solicitacoes_roteamento_aprovacao ON public.solicitacoes;
CREATE TRIGGER tg_solicitacoes_roteamento_aprovacao
  BEFORE INSERT ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_solicitacoes_roteamento_aprovacao();

-- ----------------------------------------------------------------------------
-- 8. Indices · fila do diretor + queries de aprovacao
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_solicitacoes_aprovacao_origem_pendente
  ON public.solicitacoes (aprovacao_origem_diretor_id, created_at DESC)
  WHERE aprovacao_origem_status = 'pendente' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_aguardando_origem
  ON public.solicitacoes (created_at DESC)
  WHERE status = 'aguardando_aprovacao_origem' AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 9. Audit log estendido · captura mudancas em aprovacao_origem_*
-- ----------------------------------------------------------------------------
-- Tabela solicitacoes ainda nao tinha audit trigger · adicionar agora cobrindo
-- as colunas novas + nps_nota (LGPD-lite · feedback eh privado)
DROP TRIGGER IF EXISTS trg_audit_solicitacoes ON public.solicitacoes;
CREATE TRIGGER trg_audit_solicitacoes
  AFTER INSERT OR UPDATE OR DELETE ON public.solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
    'aprovacao_origem_diretor_id,aprovacao_origem_status,aprovacao_origem_motivo,urgencia_decisao,urgencia_motivo_recusa,status,deleted_at,nps_nota'
  );

-- ----------------------------------------------------------------------------
-- 10. Backfill defensivo · solicitacoes pre-existentes
-- ----------------------------------------------------------------------------
-- Solicitacoes criadas ANTES desta migration sao consideradas dispensadas
-- (nao reabrem o fluxo · backward compat).
UPDATE public.solicitacoes
   SET aprovacao_origem_status = 'dispensada',
       aprovacao_origem_motivo = 'Pre-migration · backward compat',
       aprovacao_origem_em     = COALESCE(updated_at, created_at, now())
 WHERE aprovacao_origem_status IS NULL;

-- urgencia_decisao tambem
UPDATE public.solicitacoes
   SET urgencia_decisao = CASE WHEN COALESCE(eh_urgente, false) THEN 'pendente' ELSE 'nao_aplicavel' END
 WHERE urgencia_decisao IS NULL;

-- ----------------------------------------------------------------------------
-- 11. Comentarios finais (referencia)
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.solicitacoes.aprovacao_origem_diretor_id IS
  'Diretor de origem responsavel pela aprovacao hierarquica. NULL quando dispensada.';
COMMENT ON COLUMN public.solicitacoes.aprovacao_origem_status IS
  'pendente | aprovada | rejeitada | dispensada · NULL apenas em registros pre-migration (que foram backfillados).';
COMMENT ON COLUMN public.solicitacoes.urgencia_decisao IS
  'nao_aplicavel (sem urgencia) | pendente | aceita | recusada · decidida pelo coordenador da area alvo.';

-- ============================================================================
-- Solicitações · Fluxo BPMN (Levas 2/3 · 2026-07-02)
-- Decisões do gestor (gestao@cbrio.com.br):
--   1. "Planejado" = checkbox do solicitante → pedido planejado PULA aprovação
--      (o diretor já aprovou o mérito quando entrou no planejamento).
--   2. Não-planejado = DUPLA aprovação (diretor da área do demandante E diretor
--      de Gestão/Operações · Eduardo + Juliana co-aprovadora). Demandante do
--      setor Gestão → os dois papéis colapsam num carimbo só.
--   3. Não-planejado COM CUSTO → julgamento de mérito pelo Pastor Presidente
--      (Pr. Juninho · ele mesmo entra no sistema · exceção pontual às 3 telas).
--   4. Financeiro ganha 3ª opção: SOBRESTAR (em espera · motivo + data de
--      revisão · SLA pausado). Responsável de serviços também pode sobrestar.
-- Também: lockdown de RLS pré-auditoria da tabela (leitura aberta expunha
-- chave_pix/dados bancários pela anon key; update permitia o solicitante
-- editar campos de decisão) e fix do vazamento de canceladas no calendário
-- de reservas.
-- ============================================================================
BEGIN;

-- ─── 1 · Status novos no CHECK (lista completa vigente da 20260616160000) ───
ALTER TABLE public.solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_status_check;
ALTER TABLE public.solicitacoes ADD CONSTRAINT solicitacoes_status_check
  CHECK (status IN (
    'aguardando_aprovacao_origem', 'em_cotacao',
    'pendente', 'em_analise', 'aprovado', 'rejeitado', 'concluido',
    'aguardando_aprovacao_financeira', 'em_atendimento', 'aguardando_entrega', 'avaliado',
    'aguardando_ajuste', 'cancelado',
    'aguardando_merito', 'sobrestada'
  ));

-- ─── 2 · Colunas novas (aditivas) ───────────────────────────────────────────
ALTER TABLE public.solicitacoes
  -- Planejado: NULL = linha legada (fluxo antigo) · true/false = fluxo novo.
  ADD COLUMN IF NOT EXISTS eh_planejado boolean,
  ADD COLUMN IF NOT EXISTS planejado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- 2º carimbo (diretor de Gestão/Operações) · NULL = legado ou planejado.
  ADD COLUMN IF NOT EXISTS aprovacao_gestao_status text
    CHECK (aprovacao_gestao_status IS NULL OR aprovacao_gestao_status IN ('pendente','aprovada','rejeitada','dispensada')),
  ADD COLUMN IF NOT EXISTS aprovacao_gestao_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_gestao_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovacao_gestao_motivo text,
  -- Julgamento de mérito (Pastor Presidente · não-planejado com custo).
  ADD COLUMN IF NOT EXISTS merito_status text
    CHECK (merito_status IS NULL OR merito_status IN ('pendente','aprovado','rejeitado')),
  ADD COLUMN IF NOT EXISTS merito_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merito_em timestamptz,
  ADD COLUMN IF NOT EXISTS merito_motivo text,
  -- Sobrestamento (em espera · pausa SLA · retomável).
  ADD COLUMN IF NOT EXISTS sobrestada_em timestamptz,
  ADD COLUMN IF NOT EXISTS sobrestada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sobrestada_motivo text,
  ADD COLUMN IF NOT EXISTS sobrestada_revisao date,
  ADD COLUMN IF NOT EXISTS sobrestada_status_anterior text;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_merito
  ON public.solicitacoes (created_at DESC) WHERE status = 'aguardando_merito' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_sobrestadas
  ON public.solicitacoes (sobrestada_em DESC) WHERE status = 'sobrestada' AND deleted_at IS NULL;

-- ─── 3 · Aprovadores de mérito (padrão setor_coaprovadores) ─────────────────
CREATE TABLE IF NOT EXISTS public.solicitacoes_merito_aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por text,
  UNIQUE (profile_id)
);
ALTER TABLE public.solicitacoes_merito_aprovadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS merito_aprov_select ON public.solicitacoes_merito_aprovadores;
CREATE POLICY merito_aprov_select ON public.solicitacoes_merito_aprovadores
  FOR SELECT TO authenticated USING (true);  -- catálogo (nomes de papel, sem PII)
DROP POLICY IF EXISTS merito_aprov_write ON public.solicitacoes_merito_aprovadores;
CREATE POLICY merito_aprov_write ON public.solicitacoes_merito_aprovadores
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS merito_aprov_service ON public.solicitacoes_merito_aprovadores;
CREATE POLICY merito_aprov_service ON public.solicitacoes_merito_aprovadores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed: Pr. Juninho (decisão do gestor 2026-07-02 · ele mesmo entra no sistema)
INSERT INTO public.solicitacoes_merito_aprovadores (profile_id, nome, criado_por)
SELECT p.id, COALESCE(p.name, 'Pr. Juninho'), 'migration-bpmn'
FROM public.profiles p
WHERE lower(p.email) = 'juninho.lit@cbrio.org'
ON CONFLICT (profile_id) DO NOTHING;

-- ─── 4 · Acesso do Pastor Presidente ao módulo (exceção pontual às 3 telas) ─
-- Nível 1 (ver) em `solicitacoes` pro cargo pastor-presidente: o menu passa a
-- mostrar Solicitações e a aba Aprovar exibe SÓ a fila de mérito dele.
DO $$
DECLARE v_cargo int; v_modulo int;
BEGIN
  SELECT id INTO v_cargo  FROM public.cargos  WHERE slug = 'pastor-presidente';
  SELECT id INTO v_modulo FROM public.modulos WHERE slug = 'solicitacoes';
  IF v_cargo IS NOT NULL AND v_modulo IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    VALUES (v_cargo, v_modulo, 1, false, true, false)
    ON CONFLICT (cargo_id, modulo_id)
    DO UPDATE SET nivel = GREATEST(public.cargo_modulo_permissao.nivel, 1), pode_aprovar = true;
  END IF;
END $$;

-- ─── 5 · Audit: decisões novas entram no audit log ──────────────────────────
DROP TRIGGER IF EXISTS trg_audit_solicitacoes ON public.solicitacoes;
CREATE TRIGGER trg_audit_solicitacoes
AFTER INSERT OR UPDATE OR DELETE ON public.solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'aprovacao_origem_diretor_id,aprovacao_origem_status,aprovacao_origem_motivo,urgencia_decisao,urgencia_motivo_recusa,status,deleted_at,nps_nota,eh_planejado,aprovacao_gestao_status,merito_status,merito_por,sobrestada_em'
);

-- ─── 6 · Lockdown RLS da tabela solicitacoes (achado da auditoria do fluxo) ─
-- Antes: SELECT USING(true) (qualquer autenticado lia chave_pix/banco/valores
-- de todo mundo pela anon key) e UPDATE por solicitante/responsável SEM
-- restrição de coluna (dava pra auto-aprovar via PostgREST). Todo write real
-- passa pelo backend (service_role); o frontend só LÊ via realtime (gatilho de
-- reload). Portanto: SELECT contextual, writes só service_role/super-admin.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'solicitacoes'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.solicitacoes', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY solicitacoes_select ON public.solicitacoes
  FOR SELECT TO authenticated
  USING (
    solicitante_id = auth.uid()
    OR responsavel_id = auth.uid()
    OR public.current_user_module_level('solicitacoes') >= 1
    OR public.is_super_admin()
  );
CREATE POLICY solicitacoes_write_admin ON public.solicitacoes
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY solicitacoes_service ON public.solicitacoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Eventos: INSERT era aberto a autenticado (dava pra forjar histórico).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = 'solicitacoes_eventos'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.solicitacoes_eventos', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY solic_eventos_select ON public.solicitacoes_eventos
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('solicitacoes') >= 1
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.solicitacoes s
      WHERE s.id = solicitacao_id AND (s.solicitante_id = auth.uid() OR s.responsavel_id = auth.uid())
    )
  );
CREATE POLICY solic_eventos_service ON public.solicitacoes_eventos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 7 · Fix: calendário de reservas vazava canceladas (bug pré-existente) ──
-- Espelho EXATO da view vigente (20260528500000) · muda só o filtro de status
-- (antes: <> 'rejeitado' · vazava cancelado; sobrestada tampouco deve reter o
-- espaço) + exclui soft-deletadas.
DROP VIEW IF EXISTS public.vw_reserva_espacos;
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
    AND s.status NOT IN ('rejeitado', 'cancelado', 'sobrestada')
    AND s.data_uso IS NOT NULL
    AND s.deleted_at IS NULL
  ORDER BY s.data_uso, s.horario_inicio;

COMMENT ON COLUMN public.solicitacoes.eh_planejado IS
  'Checkbox do solicitante: pedido estava no planejamento → pula aprovação (o diretor já aprovou o mérito no planejamento). NULL = linha anterior ao fluxo BPMN. Atendente/aprovador pode contestar (backend).';
COMMENT ON COLUMN public.solicitacoes.aprovacao_gestao_status IS
  '2º carimbo do não-planejado: diretor de Gestão/Operações (setor_diretor Gestao + co-aprovadores). Dispensado quando o demandante é do próprio setor Gestão (papéis colapsam).';
COMMENT ON COLUMN public.solicitacoes.merito_status IS
  'Julgamento de mérito do Pastor Presidente (não-planejado com custo). Reprovação é imutável (cria-se nova solicitação).';
COMMENT ON COLUMN public.solicitacoes.sobrestada_revisao IS
  'Data de revisão do sobrestamento (lembrete automático via notificacaoGenerator) — sobrestada sem prazo vira limbo.';

COMMIT;

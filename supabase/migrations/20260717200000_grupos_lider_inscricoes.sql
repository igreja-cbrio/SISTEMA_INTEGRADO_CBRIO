-- ============================================================================
-- Grupos · Inscrição pública de NOVOS LÍDERES E ANFITRIÕES (2026-07-17)
--
-- Form público /inscricao-lideres: a pessoa se candidata a líder, anfitrião
-- ou os dois (+ "o que motivou sua decisão"). A candidatura cai na caixa de
-- entrada do /grupos como terceira origem (inscrição · Next · novos líderes)
-- e a equipe decide: aceitar → vincular a um grupo existente (entra como MAIS
-- UM líder/anfitrião/líder em treinamento no roster — NUNCA substitui o
-- lider_id principal; Marcos 17/07) ou criar um grupo novo já com a pessoa
-- de líder. Recusa é silenciosa (a equipe devolve o contato pessoalmente).
-- Fluxo 100% assistido — SEM WhatsApp em nenhuma etapa (decisão do Marcos).
--
-- Identidade: mesma fundação das outras portas — os dados pessoais vivem em
-- mem_cadastros_pendentes (CPF/dedup/foto) OU num membro já casado pelo
-- matcher; esta tabela guarda só a candidatura em si.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mem_lider_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem se candidatou (pelo menos um; na vinculação o cadastro é promovido a
  -- membro e o ponteiro do membro passa a valer). De propósito NÃO é XOR
  -- estrito como no mem_grupo_pedidos: o check permissivo evita o 23514 na
  -- transição cadastro→membro (lição do aprovarPedidoCore, que precisa limpar
  -- o ponteiro no MESMO update).
  cadastro_pendente_id uuid REFERENCES public.mem_cadastros_pendentes(id) ON DELETE SET NULL,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,

  -- Snapshot pra caixa de entrada (o cadastro pode ser fundido/alterado depois)
  nome text NOT NULL,
  telefone text,
  email text,
  bairro text,
  endereco text,

  quer_lider boolean NOT NULL DEFAULT false,
  quer_anfitriao boolean NOT NULL DEFAULT false,
  motivacao text,

  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aceito', 'vinculado', 'recusado')),
  motivo_recusa text,
  decidido_por uuid,
  decidido_por_nome text,
  decidido_em timestamptz,

  vinculado_grupo_id uuid REFERENCES public.mem_grupos(id) ON DELETE SET NULL,
  vinculo_funcao text CHECK (vinculo_funcao IN ('lider', 'anfitriao', 'lider_treinamento')),
  vinculado_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT chk_lider_inscricao_papel CHECK (quer_lider OR quer_anfitriao),
  CONSTRAINT chk_lider_inscricao_pessoa CHECK (cadastro_pendente_id IS NOT NULL OR membro_id IS NOT NULL)
);

COMMENT ON TABLE public.mem_lider_inscricoes IS
  'Candidaturas públicas a líder/anfitrião de grupo (form /inscricao-lideres). Caixa de entrada do /grupos decide: vincular a grupo existente (roster · nunca substitui lider_id) ou criar grupo novo. Sem WhatsApp (processo assistido).';

CREATE INDEX IF NOT EXISTS idx_mem_lider_inscricoes_ativas
  ON public.mem_lider_inscricoes (status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_lider_inscricoes_membro
  ON public.mem_lider_inscricoes (membro_id) WHERE deleted_at IS NULL;

-- ── Soft-delete: whitelist app_soft_deletable_tables() += mem_lider_inscricoes
-- (lista copiada do estado VIVO de produção em 2026-07-17 · 62 tabelas + esta)
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios','kids_estoque',
    'kpi_indicadores_taticos','kpi_metas','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','marketing_entregaveis','marketing_kanban_cards',
    'marketing_membros','mem_contribuicoes','mem_devocionais','mem_familias',
    'mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios',
    'mem_vinculos_familiares','next_matriculas','next_turmas','nsm_eventos',
    'pcs_progressoes','projects','rh_documentos','rh_funcionarios','solicitacoes',
    'usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes','log_compras',
    'fin_contas_pagar','cui_primeiro_contato_fila','cui_batismo_next_fila',
    'governance_meetings','governance_meeting_docs','governance_memoria',
    'apresentacao_criancas','ext_eventos','ext_inscricoes','vol_email_disparos',
    'vol_email_disparo_destinatarios','nps_pesquisas','mem_contatos',
    'mem_lider_inscricoes'
  ]::text[]
$$;

-- ── RLS: leitura pra equipe de grupos · escrita só pelo backend (service_role)
ALTER TABLE public.mem_lider_inscricoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mem_lider_inscricoes' AND policyname = 'mem_lider_inscricoes_select'
  ) THEN
    CREATE POLICY mem_lider_inscricoes_select ON public.mem_lider_inscricoes
      FOR SELECT TO authenticated
      USING (public.current_user_module_level('grupos') >= 1 OR public.is_super_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mem_lider_inscricoes' AND policyname = 'mem_lider_inscricoes_service'
  ) THEN
    CREATE POLICY mem_lider_inscricoes_service ON public.mem_lider_inscricoes
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

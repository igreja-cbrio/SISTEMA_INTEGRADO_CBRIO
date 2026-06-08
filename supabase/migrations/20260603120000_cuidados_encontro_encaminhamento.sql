-- ============================================================================
-- Cuidados · Encontro pastoral + Encaminhamento da Jornada (2026-06-03)
-- ============================================================================
-- Marcos: na aba Convertidos, o encontro pastoral vira um registro de verdade
-- (data + HORA + quem vai atender + compareceu) e o DESFECHO encaminha a
-- pessoa pros proximos valores da jornada (Grupos/Voluntarios/Jornada 180).
-- Cada area receptora tem uma caixa de entrada onde registra contato +
-- devolutiva (Pendente/Nao respondeu/Em duvida/Engajou/Sem interesse).
--
-- Principios (decididos com Marcos):
--   - SEM "nao se converteu" · nao interrompe o fluxo (qualidade de entrada e
--     da Integracao) · NAO mexe em trilha/NSM.
--   - NAO taxar a dor · guarda a DIRECAO (proximo valor), nao o diagnostico.
--     Motivo sensivel so em observacao discreta.
--   - Toda pessoa sai do atendimento com >= 1 encaminhamento.
--   - Liga conversao -> proximos valores (amarracao que nao existia · alimenta o NSM).
--
-- PII: jornada_encaminhamentos guarda nome/telefone · segue o padrao de
-- seguranca (deleted_at + indice parcial + whitelist + RLS contextual).
-- O log de contatos (filho) e CASCADE do pai · sem soft-delete proprio.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em cui_convertidos · encontro pastoral com agenda real
-- ----------------------------------------------------------------------------
ALTER TABLE public.cui_convertidos
  ADD COLUMN IF NOT EXISTS encontro_hora           time,
  ADD COLUMN IF NOT EXISTS encontro_responsavel_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS encontro_responsavel_nome text,
  ADD COLUMN IF NOT EXISTS encontro_status         text
    CHECK (encontro_status IN ('agendado','realizado','faltou','cancelado')),
  ADD COLUMN IF NOT EXISTS encontro_compareceu     boolean,
  ADD COLUMN IF NOT EXISTS desfecho_em             timestamptz,
  ADD COLUMN IF NOT EXISTS desfecho_por            uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS desfecho_observacoes    text;

COMMENT ON COLUMN public.cui_convertidos.encontro_hora IS
  'Hora do encontro pastoral · complementa data_encontro (so data)';
COMMENT ON COLUMN public.cui_convertidos.encontro_responsavel_id IS
  'Quem vai atender (pastor) · auth.users · snapshot em encontro_responsavel_nome';
COMMENT ON COLUMN public.cui_convertidos.encontro_status IS
  'agendado -> realizado/faltou (no desfecho) · cancelado se desmarcado';
COMMENT ON COLUMN public.cui_convertidos.encontro_compareceu IS
  'A pessoa compareceu ao encontro marcado · preenchido no desfecho';

-- ----------------------------------------------------------------------------
-- 2. jornada_encaminhamentos · a "amarracao" conversao -> proximos valores
--    1 linha por (pessoa x destino). Status = devolutiva do ultimo contato.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jornada_encaminhamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- origem: hoje so 'cuidados' (desfecho do encontro) · extensivel
  origem          text NOT NULL DEFAULT 'cuidados',
  convertido_id   uuid REFERENCES public.cui_convertidos(id) ON DELETE SET NULL,
  membro_id       uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome            text NOT NULL,
  telefone        text,
  -- pra onde a pessoa foi encaminhada
  destino         text NOT NULL
                    CHECK (destino IN ('jornada180','grupos','voluntarios')),
  -- valor da jornada que esse destino serve (analitico · alimenta NSM)
  valor_alvo      text
                    CHECK (valor_alvo IN ('seguir','conectar','investir','servir','generosidade')),
  -- observacao inicial discreta do pastor (opcional)
  observacao      text,
  -- status = devolutiva mais recente do log de contatos
  status          text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','nao_respondeu','em_duvida','engajou','sem_interesse')),
  encaminhado_por uuid REFERENCES auth.users(id),
  encaminhado_em  timestamptz NOT NULL DEFAULT now(),
  recebido_por    uuid REFERENCES auth.users(id),
  recebido_em     timestamptz,
  resolvido_em    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS jornada_enc_destino_status_idx
  ON public.jornada_encaminhamentos (destino, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS jornada_enc_convertido_idx
  ON public.jornada_encaminhamentos (convertido_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS jornada_enc_membro_idx
  ON public.jornada_encaminhamentos (membro_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. jornada_encaminhamento_contatos · log de contatos (fica na ficha)
--    cada toque do lider = 1 linha · observacao appendable + devolutiva.
--    Filho CASCADE do encaminhamento · sem soft-delete proprio (item trivial).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jornada_encaminhamento_contatos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encaminhamento_id uuid NOT NULL
                      REFERENCES public.jornada_encaminhamentos(id) ON DELETE CASCADE,
  data_contato      date NOT NULL DEFAULT CURRENT_DATE,
  -- qual foi o contato
  canal             text CHECK (canal IN ('ligacao','whatsapp','presencial','mensagem','outro')),
  observacao        text,
  -- devolutiva do contato · pode ser null se for so anotacao
  devolutiva        text CHECK (devolutiva IN ('nao_respondeu','em_duvida','engajou','sem_interesse')),
  feito_por         uuid REFERENCES auth.users(id),
  feito_por_nome    text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jornada_enc_contatos_enc_idx
  ON public.jornada_encaminhamento_contatos (encaminhamento_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Whitelist soft-delete · extende app_soft_deletable_tables()
--    Lista atual + jornada_encaminhamentos no final.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'mem_membros', 'mem_familias', 'mem_grupos', 'mem_grupo_membros',
    'mem_voluntarios', 'mem_contribuicoes', 'mem_trilha_valores',
    'mem_devocionais', 'mem_historico', 'mem_grupo_encontros',
    'mem_grupo_pedidos',
    'cultos', 'cultos_decisoes_pessoas', 'batismo_inscricoes', 'nsm_eventos',
    'kids_criancas', 'kids_checkins', 'kids_sessoes',
    'cui_jornada180', 'cui_acompanhamentos', 'cui_convertidos', 'int_visitantes',
    'kpi_indicadores_taticos', 'kpi_metas',
    'rh_funcionarios', 'rh_documentos', 'pcs_progressoes',
    'projects', 'solicitacoes', 'usuarios',
    'apresentacao_bebes',
    'whatsapp_lideres', 'whatsapp_coletas',
    'jornada_encaminhamentos'
  ]::TEXT[]
$$;

-- ----------------------------------------------------------------------------
-- 5. RLS · backend escreve via service_role · leitura contextual por modulo
--    do destino (cuidados ve tudo · grupos ve os de grupos · etc).
-- ----------------------------------------------------------------------------
ALTER TABLE public.jornada_encaminhamentos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornada_encaminhamento_contatos    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jornada_enc_select ON public.jornada_encaminhamentos;
CREATE POLICY jornada_enc_select ON public.jornada_encaminhamentos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.is_super_admin()
      OR public.current_user_module_level('cuidados') >= 1
      OR (destino = 'grupos'      AND public.current_user_module_level('grupos') >= 1)
      OR (destino = 'voluntarios' AND public.current_user_module_level('voluntariado') >= 1)
    )
  );

DROP POLICY IF EXISTS jornada_enc_service ON public.jornada_encaminhamentos;
CREATE POLICY jornada_enc_service ON public.jornada_encaminhamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS jornada_enc_contatos_select ON public.jornada_encaminhamento_contatos;
CREATE POLICY jornada_enc_contatos_select ON public.jornada_encaminhamento_contatos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('cuidados') >= 1
    OR public.current_user_module_level('grupos') >= 1
    OR public.current_user_module_level('voluntariado') >= 1
  );

DROP POLICY IF EXISTS jornada_enc_contatos_service ON public.jornada_encaminhamento_contatos;
CREATE POLICY jornada_enc_contatos_service ON public.jornada_encaminhamento_contatos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- ----------------------------------------------------------------------------
-- Conferencia (rodar apos aplicar):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='cui_convertidos' AND column_name LIKE 'encontro%';
--   -- esperado: encontro_hora, encontro_responsavel_id, encontro_responsavel_nome,
--   --           encontro_status, encontro_compareceu
--   SELECT count(*) FROM jornada_encaminhamentos;          -- 0 (vazio · UI popula)
--   SELECT 'jornada_encaminhamentos' = ANY(app_soft_deletable_tables());  -- true
-- ============================================================================

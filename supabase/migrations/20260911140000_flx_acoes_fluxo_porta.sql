-- ════════════════════════════════════════════════════════════════════════════
--  FLUXOS DE PORTA · a tabela das AÇÕES HUMANAS (11/09/2026)
--
--  Pedido do Marcos: "toda porta pública gera fluxos de processos a serem
--  seguidos... colocar em algum lugar para ser avaliado se está sendo seguido".
--
--  ⚠️⚠️ UMA TABELA SÓ, e ela guarda o MENOS POSSÍVEL — de propósito.
--  O estado do fluxo NÃO mora aqui: é CALCULADO por `backend/utils/portaFluxos`
--  a partir das colunas que a própria porta já tem (voucher_status,
--  pesquisa_respondida_em, primeiro_contato_em...). Guardar "etapa atual" numa
--  coluna criaria uma segunda verdade, e no dia em que ela divergisse do dado
--  real ninguém saberia qual das duas está certa.
--  Aqui entra só o que NÃO existe em lugar nenhum: a ação humana que fecha uma
--  etapa — hoje, o DESFECHO.
--
--  ⚠️ Por que genérica (porta + ref_tipo + ref_id) e não colunas em vis_visitas:
--  é exatamente o erro que estamos consertando. `cui_convertidos` ganhou VINTE
--  colunas de fluxo por ALTER ao longo de 2026, e em 90 dias mediu encontro
--  marcado 0 · direcionamento 2 · desfecho 0. Repetir isso porta a porta
--  multiplicaria o problema por sete.
--
--  ⚠️ SEM FK para a linha da porta: `ref_id` aponta pra tabelas diferentes
--  (vis_visitas hoje, cui_convertidos/next_matriculas amanhã). A integridade é
--  do servidor, que só escreve depois de LER a linha da porta. Em troca, a
--  tabela não trava a evolução das outras.
--
--  Aditiva e idempotente. Nenhuma linha existente muda.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.flx_acoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- qual fluxo · o catálogo vive em backend/utils/portaFluxos.js (no gate)
  porta           text NOT NULL,
  -- onde mora a pessoa nesta porta (tabela + linha) · sem FK, ver cabeçalho
  ref_tipo        text NOT NULL,
  ref_id          uuid NOT NULL,
  -- a pessoa, quando o matcher já resolveu (pode ser null: a visita não depende dele)
  membro_id       uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  -- qual etapa do fluxo esta ação fecha
  etapa           text NOT NULL,
  -- o que aconteceu · vocabulário do catálogo (DESFECHOS), validado no servidor
  resultado       text NOT NULL,
  -- para onde encaminhou, quando o desfecho é 'encaminhada'
  encaminhamento  text,
  observacao      text,
  -- quem fez · snapshot do nome junto, porque perfil sai e o histórico fica
  feito_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  feito_por_nome  text,
  feito_em        timestamptz NOT NULL DEFAULT now(),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz,
  deleted_at      timestamptz
);

COMMENT ON TABLE public.flx_acoes IS
  'Ações HUMANAS dos fluxos de porta (11/09/2026). O estado do fluxo é calculado por backend/utils/portaFluxos a partir das colunas da própria porta; esta tabela guarda só o que não existe em outro lugar — hoje, o desfecho que ENCERRA o fluxo. Genérica de propósito (porta + ref_tipo + ref_id): o erro que ela evita é o de cui_convertidos, que ganhou 20 colunas de fluxo por ALTER e mediu 0 desfechos em 90 dias.';
COMMENT ON COLUMN public.flx_acoes.ref_id IS
  'Linha da porta (vis_visitas.id hoje). SEM FK de propósito: aponta pra tabelas diferentes conforme a porta; quem garante que existe é o servidor, que lê a linha antes de escrever.';
COMMENT ON COLUMN public.flx_acoes.resultado IS
  'Vocabulário de portaFluxos.DESFECHOS: encaminhada (exige encaminhamento) · sem_necessidade · nao_alcancada. Sem CHECK no banco porque o catálogo vive no código e entra no gate — CHECK aqui viraria migration a cada etapa nova de qualquer porta.';

-- ⚠️ UMA ação por etapa por pessoa. PARCIAL (só entre as vivas) porque o
-- soft-delete precisa liberar a chave: sem isso, desfazer um desfecho errado
-- trancaria a etapa pra sempre. (Lição do uq_mem_devocionais_dia, 09/09.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_flx_acoes_etapa
  ON public.flx_acoes (porta, ref_id, etapa) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flx_acoes_ref
  ON public.flx_acoes (ref_tipo, ref_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flx_acoes_porta_feito
  ON public.flx_acoes (porta, feito_em DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flx_acoes_membro
  ON public.flx_acoes (membro_id) WHERE membro_id IS NOT NULL AND deleted_at IS NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Quem opera o fluxo do visitante é a equipe de Cuidados (a mesma régua da
-- própria vis_visitas: módulo `visitantes` OU `cuidados`). Escrita pelo
-- servidor com service_role; leitura direta só pra quem tem o módulo.
-- ⚠️ Sem FORCE: o padrão da casa (vis_visitas, 09/09) é só ENABLE. FORCE sujeita
-- o DONO da tabela à RLS e já quebrou migration rodada como postgres em outros
-- projetos — consistência com o que foi auditado vale mais que rigor extra aqui.
ALTER TABLE public.flx_acoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flx_acoes_service_role ON public.flx_acoes;
CREATE POLICY flx_acoes_service_role ON public.flx_acoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS flx_acoes_leitura_modulo ON public.flx_acoes;
CREATE POLICY flx_acoes_leitura_modulo ON public.flx_acoes
  FOR SELECT TO authenticated
  USING (
    public.current_user_module_level('cuidados') >= 1
    OR public.current_user_module_level('visitantes') >= 1
  );

-- ⚠️ Sem policy de INSERT/UPDATE para `authenticated`: toda escrita passa pelo
-- servidor, que valida o desfecho contra o catálogo (portaFluxos.validarDesfecho)
-- antes de gravar. Abrir escrita direta deixaria entrar resultado fora da lista.

REVOKE ALL ON public.flx_acoes FROM anon;
GRANT SELECT ON public.flx_acoes TO authenticated;

-- ── Conferência (o SQL Editor mostra só o ÚLTIMO comando · lei de 09/09) ─────
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'flx_acoes')              AS colunas,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'flx_acoes')                 AS indices,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'flx_acoes')                 AS policies,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.flx_acoes'::regclass) AS rls_ligada,
  (SELECT count(*) FROM public.flx_acoes)                                     AS linhas;

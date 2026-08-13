-- ============================================================================
-- Grupos · RENOVAÇÃO DE TEMPORADA PELO LÍDER (Marcos · 2026-07-21)
--
-- 1×/semestre, com a temporada fechada, todos os líderes recebem um WhatsApp
-- (template + link tokenizado /g/r/<token> · disparo MANUAL da coordenação —
-- lei de 20/07: nada automático pro líder) perguntando se continuam com o
-- grupo na próxima temporada:
--   · SIM → checklist do roster ("quem provavelmente continua" · estimativa);
--     quem não for marcado sai do grupo (saiu_em · SOFT — segue no sistema e
--     pode se reinscrever na abertura). Re-submissão permitida: a última vence.
--   · NÃO → motivo obrigatório; o grupo NÃO fecha — vira item na caixa de
--     entrada da coordenação (Naná) pra triagem (fechar/buscar líder/manter).
--
-- 1 linha por (grupo, temporada destino). Reenvio incrementa token_geracao →
-- links antigos morrem (revogação server-side de link encaminhado/vazado).
-- ============================================================================

-- ── 1) Tabela da renovação ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mem_grupo_renovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOTA (exceção documentada · CLAUDE.md "FKs CASCADE→SET NULL"): CASCADE
  -- intencional — renovação é registro transitório do grupo (mesmo racional de
  -- mem_grupo_pedidos); hard delete de mem_grupos é só super-admin.
  grupo_id uuid NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,
  temporada_id text NOT NULL REFERENCES public.mem_temporadas(id) ON DELETE CASCADE,

  -- Snapshot do líder cobrado (o grupo pode trocar de líder depois; o token
  -- amarra o líder da época — payload.l — e o painel mostra quem respondeu)
  lider_membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  lider_nome text,
  lider_telefone text,

  status text NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada', 'continua', 'nao_continua', 'triada')),
  -- Obrigatório (validado no backend) quando o líder responde que NÃO continua
  motivo text,

  -- Resumo do checklist (cache de exibição · a fonte auditável é o audit log
  -- de mem_grupo_membros + a coluna renovacao_id dos vínculos fechados)
  roster_total integer,
  confirmados_count integer,
  removidos_count integer,
  confirmados_ids jsonb,
  removidos_vinculo_ids jsonb,

  -- Reenvio incrementa a geração; token carrega `g` e só vale se bater —
  -- revogação efetiva de link antigo/encaminhado, sem tabela de tokens.
  token_geracao integer NOT NULL DEFAULT 1,
  enviado_em timestamptz,
  primeira_resposta_em timestamptz,
  ultima_resposta_em timestamptz,

  -- Triagem da coordenação (só quando nao_continua)
  triagem_acao text CHECK (triagem_acao IN ('fechar_grupo', 'buscar_lider', 'manter')),
  triagem_obs text,
  triado_por uuid,
  triado_por_nome text,
  triado_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,

  CONSTRAINT uniq_mem_grupo_renovacoes_grupo_temporada UNIQUE (grupo_id, temporada_id)
);

COMMENT ON TABLE public.mem_grupo_renovacoes IS
  'Renovação de temporada respondida pelo líder via link WhatsApp (/g/r/<token>). 1 linha por (grupo, temporada destino); reenvio incrementa token_geracao (revoga link antigo). nao_continua entra na caixa de entrada do /grupos pra triagem da coordenação.';

CREATE INDEX IF NOT EXISTS idx_mem_grupo_renovacoes_temporada
  ON public.mem_grupo_renovacoes (temporada_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupo_renovacoes_grupo
  ON public.mem_grupo_renovacoes (grupo_id) WHERE deleted_at IS NULL;

-- ── 2) Vínculo fechado pela renovação → coluna dedicada (NÃO tag em texto) ──
-- Reativar no re-submit = limpar saiu_em APENAS onde renovacao_id = :id.
-- motivo_saida recebe só o rótulo humano (é exibido na UI e é texto livre).
ALTER TABLE public.mem_grupo_membros
  ADD COLUMN IF NOT EXISTS renovacao_id uuid REFERENCES public.mem_grupo_renovacoes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.mem_grupo_membros.renovacao_id IS
  'Preenchido quando a saída (saiu_em) foi feita pela renovação de temporada — permite reativação precisa no re-submit do líder. NULL em saídas manuais/outros fluxos.';

CREATE INDEX IF NOT EXISTS idx_mem_grupo_membros_renovacao
  ON public.mem_grupo_membros (renovacao_id) WHERE renovacao_id IS NOT NULL;

-- ── 3) Multi-grupo formalizado (herdado do PR #1672, nunca aplicado) ────────
-- O índice existe no git (20260413160000) mas NUNCA valeu em prod (drift —
-- os imports da T1 criaram multi-grupo real). Decisão do Marcos (09/07):
-- multi-grupo é permitido. O DROP é no-op em prod e evita 23505 na
-- reativação da renovação em ambientes recriados do git.
DROP INDEX IF EXISTS public.uniq_mem_grupo_membros_ativo;

-- ── 4) Soft-delete: whitelist (lista do estado VIVO de prod · 2026-07-21,
--       63 tabelas lidas via RPC + esta) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','apresentacao_criancas','batismo_inscricoes',
    'cui_acompanhamentos','cui_batismo_next_fila','cui_convertidos','cui_jornada180',
    'cui_primeiro_contato_fila','cultos','cultos_decisoes_pessoas','ext_eventos',
    'ext_inscricoes','fin_contas_pagar','governance_meeting_docs','governance_meetings',
    'governance_memoria','int_visitantes','kids_atendimentos','kids_checkins',
    'kids_criancas','kids_estoque','kids_pagers','kids_sala_voluntarios','kids_sessoes',
    'kids_vinculo_solicitacoes','kpi_indicadores_taticos','kpi_metas','log_compras',
    'marketing_capacidade_override','marketing_compromissos_recorrentes',
    'marketing_entregaveis','marketing_kanban_cards','marketing_membros','mem_contatos',
    'mem_contribuicoes','mem_devocionais','mem_familias','mem_grupo_encontros',
    'mem_grupo_membros','mem_grupo_pedidos','mem_grupos','mem_historico',
    'mem_lider_inscricoes','mem_membros','mem_trilha_valores','mem_vinculos_familiares',
    'mem_voluntarios','next_matriculas','next_turmas','nps_pesquisas','nsm_eventos',
    'pcs_progressoes','projects','rh_documentos','rh_funcionarios','solicitacoes',
    'usuarios','vol_background_checks','vol_email_disparo_destinatarios',
    'vol_email_disparos','wifi_conexoes','wifi_visitantes',
    'mem_grupo_renovacoes'
  ]::text[]
$$;

-- ── 5) RLS: leitura pra equipe de grupos · escrita só pelo backend ──────────
-- (molde mem_lider_inscricoes · fail-closed: sem policy de write pra
-- authenticated — INSERT/UPDATE/DELETE só via service_role)
ALTER TABLE public.mem_grupo_renovacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mem_grupo_renovacoes' AND policyname = 'mem_grupo_renovacoes_select'
  ) THEN
    CREATE POLICY mem_grupo_renovacoes_select ON public.mem_grupo_renovacoes
      FOR SELECT TO authenticated
      USING (public.current_user_module_level('grupos') >= 1 OR public.is_super_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mem_grupo_renovacoes' AND policyname = 'mem_grupo_renovacoes_service'
  ) THEN
    CREATE POLICY mem_grupo_renovacoes_service ON public.mem_grupo_renovacoes
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 6) Audit log (reenvio sobrescreve contadores — o diff fica auditado) ────
DROP TRIGGER IF EXISTS trg_audit_mem_grupo_renovacoes ON public.mem_grupo_renovacoes;
CREATE TRIGGER trg_audit_mem_grupo_renovacoes
AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupo_renovacoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,motivo,token_geracao,triagem_acao,triagem_obs,confirmados_count,removidos_count,deleted_at'
);

-- ── 7) PostgREST: o backend consulta a tabela nova imediatamente ────────────
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Grupos · "CONFIRA A LISTA DO SEU GRUPO" (Marcos · 2026-07-31)
--
-- 3º fluxo do líder, irmão da renovação (20260721170000) mas SEM a pergunta
-- "vai continuar?" e SEM a trava de temporada aberta. A coordenação (Naná /
-- Pr. Nélio) DISPARA MANUALMENTE (lei de 20/07: nada automático pro líder) um
-- template com link tokenizado /g/c/<token>; o líder abre, vê a lista atual do
-- grupo — TODA MARCADA como "faz parte" — e DESMARCA quem não faz mais parte.
--
-- Por que existe: o roster está poluído (gente que saiu, cadastros de teste da
-- varredura de julho, importados de 10/07 que talvez nunca tenham frequentado).
-- A coordenação não tem como saber — o LÍDER é a única fonte confiável. Os 2
-- links que existiam não resolvem: a frequência (/g/f/) só MARCA PRESENÇA (não
-- remove ninguém) e a renovação (/g/r/) é BLOQUEADA com as inscrições da
-- temporada abertas e fala de "preparar a próxima temporada" (confuso no meio
-- da T2).
--
-- Decisões de produto (fechadas):
--   · Marca quem SAI (o oposto da renovação, que vem desmarcada): aqui o padrão
--     esperado é "a lista está certa" e o atrito fica só em quem sai.
--   · Motivo/observação é ÚNICO e OPCIONAL pro lote (por pessoa é atrito demais).
--   · Remoção é SOFT e rastreável: mem_grupo_membros.saiu_em + conferencia_id
--     (espelha o renovacao_id, coluna dedicada — NUNCA tag em texto).
--   · Reedição permitida (última vence), reativando SÓ o que ESTA conferência
--     removeu. NUNCA remover por omissão (líder que não responde = roster
--     intocado). A pessoa removida NÃO é notificada (decisão pastoral vigente).
--
-- Repetível ao longo da temporada (diferente da renovação, que é 1×/semestre):
-- 1 linha por (grupo, rodada). Reenvio incrementa token_geracao → link antigo
-- morre. Rodada nova só por pedido explícito da coordenação.
-- ============================================================================

-- ── 1) Tabela da conferência ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mem_grupo_conferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOTA (exceção documentada · CLAUDE.md "FKs CASCADE→SET NULL"): CASCADE
  -- intencional — conferência é registro transitório do grupo (mesmo racional
  -- de mem_grupo_pedidos e mem_grupo_renovacoes); hard delete de mem_grupos é
  -- só super-admin.
  grupo_id uuid NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,

  -- Temporada é SNAPSHOT informativo (em qual temporada a conferência rodou) —
  -- de propósito NÃO participa de constraint nem de trava: ao contrário da
  -- renovação, esta conferência PODE rodar com as inscrições abertas.
  temporada_id text REFERENCES public.mem_temporadas(id) ON DELETE SET NULL,

  -- Rodada: a coordenação pode conferir a lista mais de uma vez na temporada.
  rodada integer NOT NULL DEFAULT 1,

  -- Snapshot do líder cobrado (o grupo pode trocar de líder depois; o token
  -- amarra o líder da época — payload.l — e o painel mostra quem respondeu)
  lider_membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  lider_nome text,
  lider_telefone text,

  status text NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada', 'respondida', 'triada')),

  -- Observação ÚNICA e OPCIONAL do lote (decisão de produto: motivo por pessoa
  -- é atrito demais neste fluxo).
  observacao text,

  -- Resumo da resposta (cache de exibição · a fonte auditável é o audit log de
  -- mem_grupo_membros + a coluna conferencia_id dos vínculos fechados)
  roster_total integer,
  mantidos_count integer,
  removidos_count integer,
  mantidos_ids jsonb,
  removidos_vinculo_ids jsonb,

  -- Reenvio incrementa a geração; o token carrega `g` e só vale se bater —
  -- revogação efetiva de link antigo/encaminhado, sem tabela de tokens.
  token_geracao integer NOT NULL DEFAULT 1,
  enviado_em timestamptz,
  primeira_resposta_em timestamptz,
  ultima_resposta_em timestamptz,

  -- Triagem da coordenação (marcar como tratada — some da fila de pendências)
  triagem_obs text,
  triado_por uuid,
  triado_por_nome text,
  triado_em timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.mem_grupo_conferencias IS
  'Conferência da lista do grupo respondida pelo líder via link WhatsApp (/g/c/<token>). O líder DESMARCA quem não faz mais parte (a lista vem toda marcada). 1 linha por (grupo, rodada); reenvio incrementa token_geracao (revoga link antigo). Diferente da renovação: sem a pergunta "vai continuar?" e SEM trava de temporada aberta.';
COMMENT ON COLUMN public.mem_grupo_conferencias.temporada_id IS
  'Snapshot informativo de em qual temporada a conferência rodou. NÃO trava nada — esta conferência pode rodar com as inscrições abertas (é o que a diferencia da renovação).';
COMMENT ON COLUMN public.mem_grupo_conferencias.observacao IS
  'Motivo/observação ÚNICO e OPCIONAL do lote todo (decisão do Marcos: motivo por pessoa é atrito demais neste fluxo).';

-- UNIQUE PARCIAL (índice, não constraint): a idempotência do disparo é
-- (grupo, rodada), mas só entre linhas VIVAS. Constraint de tabela valida
-- inclusive linha soft-deletada e faria a rodada 1 estourar 23505 depois de um
-- soft-delete — mesma armadilha documentada nas FKs (deleted_at não isenta).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_grupo_conferencias_grupo_rodada
  ON public.mem_grupo_conferencias (grupo_id, rodada) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mem_grupo_conferencias_status
  ON public.mem_grupo_conferencias (status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupo_conferencias_temporada
  ON public.mem_grupo_conferencias (temporada_id) WHERE deleted_at IS NULL;

-- ── 2) Vínculo fechado pela conferência → coluna dedicada (NÃO tag em texto) ──
-- Espelha o renovacao_id (20260721170000): reativar no re-submit = limpar
-- saiu_em APENAS onde conferencia_id = :id. motivo_saida recebe só o rótulo
-- humano (é exibido na UI e é texto livre).
ALTER TABLE public.mem_grupo_membros
  ADD COLUMN IF NOT EXISTS conferencia_id uuid;

-- FK em bloco PRÓPRIO: `ADD COLUMN IF NOT EXISTS ... REFERENCES` ENGOLE a FK
-- quando a coluna já existe (lição registrada no CLAUDE.md · caso
-- vol_profiles.membresia_id). Guardado por pg_constraint pra ser idempotente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mem_grupo_membros_conferencia_id_fkey'
      AND conrelid = 'public.mem_grupo_membros'::regclass
  ) THEN
    -- Rede de segurança antes do ADD CONSTRAINT (a criação da FK não pode
    -- depender de a lógica de repoint ter sido perfeita · lição do 23503).
    UPDATE public.mem_grupo_membros m SET conferencia_id = NULL
     WHERE m.conferencia_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.mem_grupo_conferencias c WHERE c.id = m.conferencia_id);
    ALTER TABLE public.mem_grupo_membros
      ADD CONSTRAINT mem_grupo_membros_conferencia_id_fkey
      FOREIGN KEY (conferencia_id) REFERENCES public.mem_grupo_conferencias(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.mem_grupo_membros.conferencia_id IS
  'Preenchido quando a saída (saiu_em) foi feita pela conferência da lista ("Confira a lista do seu grupo") — permite reativação precisa no re-submit do líder. NULL em saídas manuais/renovação/outros fluxos.';

CREATE INDEX IF NOT EXISTS idx_mem_grupo_membros_conferencia
  ON public.mem_grupo_membros (conferencia_id) WHERE conferencia_id IS NOT NULL;

-- ── 3) Soft-delete: whitelist (lê a lista VIVA e só acrescenta) ─────────────
-- Padrão da 20260730210000: NUNCA reescrever a lista à mão (o arquivo do repo
-- pode estar defasado do estado vivo de prod).
DO $$
DECLARE atual text[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO atual;
  IF NOT ('mem_grupo_conferencias' = ANY(atual)) THEN
    atual := array_append(atual, 'mem_grupo_conferencias'::text);
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
      atual
    );
  END IF;
END $$;

-- ── 4) RLS: leitura pra equipe de grupos · escrita só pelo backend ──────────
-- (molde mem_grupo_renovacoes · fail-closed: sem policy de write pra
-- authenticated — INSERT/UPDATE/DELETE só via service_role)
ALTER TABLE public.mem_grupo_conferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mem_grupo_conferencias_select ON public.mem_grupo_conferencias;
CREATE POLICY mem_grupo_conferencias_select ON public.mem_grupo_conferencias
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('grupos') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS mem_grupo_conferencias_service ON public.mem_grupo_conferencias;
CREATE POLICY mem_grupo_conferencias_service ON public.mem_grupo_conferencias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 5) Audit log (reenvio/reedição sobrescreve contadores — o diff fica) ────
DROP TRIGGER IF EXISTS trg_audit_mem_grupo_conferencias ON public.mem_grupo_conferencias;
CREATE TRIGGER trg_audit_mem_grupo_conferencias
AFTER INSERT OR UPDATE OR DELETE ON public.mem_grupo_conferencias
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,observacao,token_geracao,rodada,mantidos_count,removidos_count,triagem_obs,deleted_at'
);

-- ── 6) PostgREST: o backend consulta a tabela nova imediatamente ────────────
NOTIFY pgrst, 'reload schema';

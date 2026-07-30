-- Convite de familiar pelo app de membros
-- ─────────────────────────────────────────────────────────────────────────────
-- Uma pessoa (membro) gera um convite (código curto + link), envia pro familiar,
-- e o familiar ACEITA logado no app → entra na mesma família (mem_membros.familia_id)
-- e, opcionalmente, ganha o vínculo de parentesco (mem_vinculos_familiares). É um
-- ato EXPLÍCITO dos dois lados (quem convida cria; quem aceita confirma) — respeita
-- a lei "juntar núcleos é ato explícito, nunca automático".
--
-- Soft-delete gerenciado pelo backend (UPDATE deleted_at direto · padrão dos
-- módulos cui_pedidos/cui_visitas) — NÃO entra em app_soft_deletable_tables() pra
-- não arriscar re-declarar a whitelist inteira; cancelamento normal é status.
-- Idempotente / backwards-compatible.

CREATE TABLE IF NOT EXISTS public.mem_familia_convites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                text NOT NULL,
  criador_membro_id     uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  familia_id            uuid REFERENCES public.mem_familias(id) ON DELETE SET NULL,
  -- parentesco do CONVIDADO em relação a quem convida (chave de VINC_INVERSO:
  -- filho|pai_mae|conjuge|irmao|outro). Nullable = só junta na família, sem grafo.
  parentesco            text,
  status                text NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente','aceito','expirado','cancelado')),
  aceito_por_membro_id  uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  aceito_em             timestamptz,
  expira_em             timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

-- Código único entre convites vivos (a geração no backend confere só os pendentes)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mem_familia_convites_codigo
  ON public.mem_familia_convites (codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_familia_convites_criador
  ON public.mem_familia_convites (criador_membro_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_familia_convites_pendente
  ON public.mem_familia_convites (status) WHERE status = 'pendente' AND deleted_at IS NULL;

COMMENT ON TABLE public.mem_familia_convites IS
  'Convites de familiar gerados no app de membros. Aceite (logado no app) junta o convidado na família do criador e cria o vínculo de parentesco. Soft-delete via backend.';

ALTER TABLE public.mem_familia_convites ENABLE ROW LEVEL SECURITY;

-- Leitura: o próprio criador ou quem aceitou (o app usa service_role, mas mantém
-- a régua contextual pra qualquer acesso direto). Escrita só pelo backend.
DROP POLICY IF EXISTS mem_familia_convites_select ON public.mem_familia_convites;
CREATE POLICY mem_familia_convites_select ON public.mem_familia_convites
  FOR SELECT TO authenticated
  USING (
    criador_membro_id = public.current_user_membro_id()
    OR aceito_por_membro_id = public.current_user_membro_id()
    OR public.current_user_module_level('membresia') >= 1
  );

DROP POLICY IF EXISTS mem_familia_convites_service ON public.mem_familia_convites;
CREATE POLICY mem_familia_convites_service ON public.mem_familia_convites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

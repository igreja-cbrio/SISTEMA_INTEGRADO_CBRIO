-- ============================================================================
-- Reconciliação de CPF tardio (auditoria CPF · 2026-07-16)
--
-- Contexto: CPF virou identidade global (UNIQUE uniq_mem_membros_cpf_ativo ·
-- 20260715120000), mas quem entra SEM CPF (decisão de culto → membro-stub) e
-- traz o CPF DEPOIS (batismo, Next, ficha de voluntário, censo) não era
-- reconciliado: o CPF ficava na linha-satélite e o membro seguia sem CPF.
--
-- Esta migration cobre a parte SQL do conserto (o resto é backend ·
-- services/cpfReconciliar.js):
--   1. trg_batismo_realizado passa a disparar também quando o MEMBRO_ID chega
--      depois do status 'realizado' (vínculo tardio nunca criava a trilha
--      'batismo' nem promovia a membro_ativo).
--   2. Backfill: cria a trilha 'batismo' + promove quem já estava nesse limbo.
--   3. Tabela identidade_pendencias · fila humana dos conflitos de identidade
--      que a reconciliação NÃO resolve sozinha (política: nunca auto-fundir).
--      É a fonte que o módulo Entradas vai consumir como "resolvedor de
--      duplicatas de inscrição".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ⚠️ Constraint UNIQUE TOTAL legada em mem_membros.cpf
--
-- Em prod existe a constraint antiga mem_membros_cpf_key (UNIQUE total na
-- coluna, pré-histórica) ALÉM do índice parcial uniq_mem_membros_cpf_ativo
-- (20260715120000). A total contradiz o design do índice parcial: o
-- comentário da 20260715 diz "soft-delete libera o CPF pro cadastro vivo",
-- mas a constraint total trava o CPF ATÉ de cadastros deletados — descoberto
-- na prática pelo backfill (23505 em mem_membros_cpf_key com dono deletado).
-- O DROP alinha prod à decisão de 15/07; a unicidade entre VIVOS continua
-- garantida pelo índice parcial normalizado.
-- ----------------------------------------------------------------------------
ALTER TABLE public.mem_membros DROP CONSTRAINT IF EXISTS mem_membros_cpf_key;

-- ----------------------------------------------------------------------------
-- 1. Trigger de batismo realizado · dispara também no vínculo tardio
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_batismo_realizado_to_trilha()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'realizado'
     AND (TG_OP = 'INSERT'
          OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.membro_id IS DISTINCT FROM NEW.membro_id)
     AND NEW.membro_id IS NOT NULL
  THEN
    -- Cria trilha 'batismo' (idempotente)
    INSERT INTO mem_trilha_valores (membro_id, etapa, concluida, data_conclusao, observacoes)
    SELECT NEW.membro_id, 'batismo', true,
           COALESCE(NEW.data_batismo, CURRENT_DATE),
           'Auto: batismo realizado ' || NEW.id::text
    WHERE NOT EXISTS (
      SELECT 1 FROM mem_trilha_valores
      WHERE membro_id = NEW.membro_id AND etapa = 'batismo'
    );

    -- Avanca status do visitante linkado
    UPDATE int_visitantes SET status = 'batizado'
    WHERE membresia_id = NEW.membro_id
      AND status NOT IN ('batizado','membro_ativo');

    -- Promove a 'membro_ativo' (batismo = oficializa membresia)
    UPDATE mem_membros SET status = 'membro_ativo'
    WHERE id = NEW.membro_id AND status IN ('visitante', 'novo');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_batismo_realizado ON batismo_inscricoes;
CREATE TRIGGER trg_batismo_realizado
  AFTER INSERT OR UPDATE OF status, membro_id ON batismo_inscricoes
  FOR EACH ROW
  EXECUTE FUNCTION fn_batismo_realizado_to_trilha();

COMMENT ON FUNCTION fn_batismo_realizado_to_trilha() IS
  'Batismo realizado → trilha batismo + promoção a membro_ativo. Desde 20260716150000 dispara também quando o membro_id chega DEPOIS do status realizado (vínculo tardio · check-in/Entradas/reconciliação de CPF).';

-- ----------------------------------------------------------------------------
-- 2. Backfill · quem já estava no limbo (realizado + vínculo tardio sem trilha)
-- ----------------------------------------------------------------------------
INSERT INTO mem_trilha_valores (membro_id, etapa, concluida, data_conclusao, observacoes)
SELECT DISTINCT ON (bi.membro_id)
       bi.membro_id, 'batismo', true,
       COALESCE(bi.data_batismo, CURRENT_DATE),
       'Backfill vínculo tardio: batismo realizado ' || bi.id::text || ' (migration 20260716150000)'
  FROM batismo_inscricoes bi
 WHERE bi.status = 'realizado'
   AND bi.membro_id IS NOT NULL
   AND bi.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM mem_trilha_valores t
      WHERE t.membro_id = bi.membro_id AND t.etapa = 'batismo'
   )
 ORDER BY bi.membro_id, bi.data_batismo DESC NULLS LAST;

UPDATE mem_membros m SET status = 'membro_ativo'
 WHERE m.status IN ('visitante', 'novo')
   AND m.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM batismo_inscricoes bi
      WHERE bi.membro_id = m.id AND bi.status = 'realizado' AND bi.deleted_at IS NULL
   );

-- ----------------------------------------------------------------------------
-- 3. identidade_pendencias · fila humana de conflitos de identidade
--    (sem PII própria: só referências a mem_membros + contexto curto · o CPF
--    em disputa é lido do próprio membro_conflito. Ciclo de vida por status,
--    por isso sem deleted_at/whitelist de soft-delete.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.identidade_pendencias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                text NOT NULL CHECK (tipo IN ('cpf_conflito','cpf_divergente','vinculo_divergente')),
  membro_id           uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  membro_conflito_id  uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  origem              text,          -- porta que revelou (decisao_edicao · batismo_checkin · vol_ficha · matcher:* · backfill)
  origem_id           text,          -- id da linha de origem (quando houver)
  detalhe             text,
  status              text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','resolvida','descartada')),
  resolvida_por       uuid,
  resolvida_em        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 1 pendência ABERTA por (tipo, par de membros) · reentradas são no-op (23505)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_identidade_pendencia_aberta
  ON public.identidade_pendencias (tipo, membro_id, membro_conflito_id)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_identidade_pendencias_status
  ON public.identidade_pendencias (status, created_at DESC);

ALTER TABLE public.identidade_pendencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identidade_pendencias_select ON public.identidade_pendencias;
CREATE POLICY identidade_pendencias_select ON public.identidade_pendencias
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('membresia')  >= 1
    OR public.current_user_module_level('integracao') >= 1
    OR public.current_user_module_level('next')       >= 1
    OR public.current_user_module_level('cuidados')   >= 1
  );

DROP POLICY IF EXISTS identidade_pendencias_insert ON public.identidade_pendencias;
CREATE POLICY identidade_pendencias_insert ON public.identidade_pendencias
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.current_user_module_level('membresia')  >= 3
    OR public.current_user_module_level('integracao') >= 3
  );

DROP POLICY IF EXISTS identidade_pendencias_update ON public.identidade_pendencias;
CREATE POLICY identidade_pendencias_update ON public.identidade_pendencias
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('membresia')  >= 3
    OR public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('next')       >= 3
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.current_user_module_level('membresia')  >= 3
    OR public.current_user_module_level('integracao') >= 3
    OR public.current_user_module_level('next')       >= 3
  );

DROP POLICY IF EXISTS identidade_pendencias_delete ON public.identidade_pendencias;
CREATE POLICY identidade_pendencias_delete ON public.identidade_pendencias
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS identidade_pendencias_service ON public.identidade_pendencias;
CREATE POLICY identidade_pendencias_service ON public.identidade_pendencias
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.identidade_pendencias IS
  'Fila humana de conflitos de identidade por CPF (nunca auto-fundir): cpf_conflito = CPF chegou pra cadastro sem CPF mas pertence a outro membro (provável duplicata → fundir via merge_membros) · cpf_divergente = membro já tinha outro CPF · vinculo_divergente = linha-satélite aponta pra membro diferente do dono do CPF. Alimentada por services/cpfReconciliar.js e pelo backfill. Consumidor: módulo Entradas (resolvedor de duplicatas).';

-- ----------------------------------------------------------------------------
-- Conferência:
--   SELECT count(*) FROM mem_trilha_valores WHERE observacoes LIKE 'Backfill vínculo tardio%';
--   SELECT tipo, status, count(*) FROM identidade_pendencias GROUP BY 1,2;
-- ============================================================================

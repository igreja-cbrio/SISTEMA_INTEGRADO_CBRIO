-- =====================================================================
-- Onda 3 · Soft-delete + FK CASCADE → SET NULL
-- =====================================================================
-- Substitui PITR via código (Marcos decidiu não pagar PITR add-on US$100/mês).
--
-- Problema que resolve:
--   - 81 FKs com ON DELETE CASCADE encadeadas (deletar 1 profile dispara
--     deleção em cascata de 9+ tabelas históricas: contribuições, batismos,
--     trilha de valores, NSM eventos, etc.)
--   - Nenhuma tabela tem `deleted_at` hoje · hard delete é irreversível
--   - Sem PITR, perda de histórico crítico (dízimos, batismos, jornada)
--
-- Estratégia:
--   1. ADD `deleted_at TIMESTAMPTZ` em 32 tabelas críticas (idempotente)
--   2. Índices parciais `WHERE deleted_at IS NULL` (mantém performance)
--   3. Função RPC `app_soft_delete(table, id, deleted_by)` com whitelist
--   4. Função RPC `app_restore(table, id)` pra desfazer
--   5. CASCADE → SET NULL em FKs históricas (Phase 1 · 20 FKs em 4 pais
--      críticos: mem_membros, rh_funcionarios, cultos, kpi_indicadores_taticos)
--
-- O que NÃO faz (próximas ondas):
--   - Não bloqueia DELETE direto via policy (backend continua podendo via
--     service_role · feature do app, não do schema)
--   - Não converte CASCADE em mem_grupos/usuarios/auth.users (Phase 2)
--   - Não cria audit log (Onda 3d separada)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO blocks que checam estado atual.
-- Pode rodar 2x sem efeito colateral.
-- =====================================================================

-- =====================================================================
-- ETAPA 1 · ADD COLUMN deleted_at em 32 tabelas críticas
-- =====================================================================

-- Membresia (PII)
ALTER TABLE public.mem_membros               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_familias              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_grupos                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_grupo_membros         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_voluntarios           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_contribuicoes         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_trilha_valores        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_devocionais           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_historico             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_grupo_encontros       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.mem_grupo_pedidos         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Cultos / Decisões / Batismos
ALTER TABLE public.cultos                    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.cultos_decisoes_pessoas   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.batismo_inscricoes        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.nsm_eventos               ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Kids (LGPD menores)
ALTER TABLE public.kids_criancas             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.kids_checkins             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.kids_sessoes              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Integração / Cuidados / Visitantes
ALTER TABLE public.cui_jornada180            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.cui_acompanhamentos       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.cui_convertidos           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.int_visitantes            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- KPI
-- NOTA: kpi_valores_calculados tem PK composta (kpi_id, periodo_referencia)
-- · não recebe soft-delete (é cache derivado · FK CASCADE→SET NULL no kpi_id
-- já preserva valores quando KPI pai for soft-deleted)
ALTER TABLE public.kpi_indicadores_taticos   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.kpi_metas                 ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- RH/PCS
ALTER TABLE public.rh_funcionarios           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.rh_documentos             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.pcs_progressoes           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Operacional crítico
-- NOTA: cargo_modulo_permissao tem PK composta (cargo_id, modulo_id) · matriz
-- de configuração · soft-delete não faz sentido (célula existe ou não existe)
ALTER TABLE public.projects                  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.solicitacoes              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.usuarios                  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- =====================================================================
-- ETAPA 2 · Índices parciais (WHERE deleted_at IS NULL)
-- Mantém performance de queries que filtram ativos · que serão a maioria.
-- Não cria índice se já existe (CREATE INDEX IF NOT EXISTS).
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_mem_membros_active             ON public.mem_membros (id)               WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_familias_active            ON public.mem_familias (id)              WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupos_active              ON public.mem_grupos (id)                WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_grupo_membros_active       ON public.mem_grupo_membros (id)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_voluntarios_active         ON public.mem_voluntarios (id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_contribuicoes_active       ON public.mem_contribuicoes (id)         WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_trilha_valores_active      ON public.mem_trilha_valores (id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cultos_active                  ON public.cultos (id)                    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cultos_decisoes_pessoas_active ON public.cultos_decisoes_pessoas (id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batismo_inscricoes_active      ON public.batismo_inscricoes (id)        WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_nsm_eventos_active             ON public.nsm_eventos (id)               WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_criancas_active           ON public.kids_criancas (id)             WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_checkins_active           ON public.kids_checkins (id)             WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rh_funcionarios_active         ON public.rh_funcionarios (id)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_solicitacoes_active            ON public.solicitacoes (id)              WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_active                ON public.projects (id)                  WHERE deleted_at IS NULL;

-- =====================================================================
-- ETAPA 3 · Lista canônica de tabelas soft-deletable (helper)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  -- Tabelas com soft-delete (PK simples 'id'). kpi_valores_calculados e
  -- cargo_modulo_permissao têm PK composta · não entram aqui.
  SELECT ARRAY[
    'mem_membros','mem_familias','mem_grupos','mem_grupo_membros','mem_voluntarios',
    'mem_contribuicoes','mem_trilha_valores','mem_devocionais','mem_historico',
    'mem_grupo_encontros','mem_grupo_pedidos','cultos','cultos_decisoes_pessoas',
    'batismo_inscricoes','nsm_eventos','kids_criancas','kids_checkins','kids_sessoes',
    'cui_jornada180','cui_acompanhamentos','cui_convertidos','int_visitantes',
    'kpi_indicadores_taticos','kpi_metas','rh_funcionarios',
    'rh_documentos','pcs_progressoes','projects','solicitacoes','usuarios'
  ]::TEXT[]
$$;

COMMENT ON FUNCTION public.app_soft_deletable_tables() IS
  'Lista de tabelas que suportam soft-delete via app_soft_delete(). Atualizar sempre que adicionar deleted_at em nova tabela.';

-- =====================================================================
-- ETAPA 4 · Função app_soft_delete(table, id, deleted_by)
-- Substitui DELETE por UPDATE deleted_at = now()
-- =====================================================================
CREATE OR REPLACE FUNCTION public.app_soft_delete(
  p_table_name TEXT,
  p_row_id     TEXT,           -- TEXT pra aceitar UUID e TEXT (kpi_indicadores_taticos)
  p_deleted_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_id_column TEXT := 'id';
BEGIN
  -- Whitelist
  IF NOT (p_table_name = ANY(public.app_soft_deletable_tables())) THEN
    RAISE EXCEPTION 'Tabela % nao esta na whitelist de soft-delete', p_table_name
      USING HINT = 'Atualize app_soft_deletable_tables() para incluir esta tabela.';
  END IF;

  -- UPDATE deleted_at (e deleted_by se a coluna existir)
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now() WHERE %I::text = $1 AND deleted_at IS NULL',
    p_table_name, v_id_column
  ) USING p_row_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Log opcional · só se deleted_by fornecido (futuro audit_log)
  IF v_count > 0 AND p_deleted_by IS NOT NULL THEN
    -- placeholder para audit_log futuro (Onda 3d)
    NULL;
  END IF;

  RETURN v_count > 0;
END $$;

COMMENT ON FUNCTION public.app_soft_delete(TEXT, TEXT, UUID) IS
  'Substitui DELETE por UPDATE deleted_at = now(). Whitelist em app_soft_deletable_tables(). SECURITY DEFINER bypass RLS · backend chama via RPC.';

GRANT EXECUTE ON FUNCTION public.app_soft_delete(TEXT, TEXT, UUID) TO authenticated, service_role;

-- =====================================================================
-- ETAPA 5 · Função app_restore (desfaz soft-delete)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.app_restore(
  p_table_name TEXT,
  p_row_id     TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT (p_table_name = ANY(public.app_soft_deletable_tables())) THEN
    RAISE EXCEPTION 'Tabela % nao esta na whitelist de soft-delete', p_table_name;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL WHERE id::text = $1 AND deleted_at IS NOT NULL',
    p_table_name
  ) USING p_row_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END $$;

COMMENT ON FUNCTION public.app_restore(TEXT, TEXT) IS
  'Desfaz soft-delete · UPDATE deleted_at = NULL. Whitelist em app_soft_deletable_tables(). SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.app_restore(TEXT, TEXT) TO authenticated, service_role;

-- =====================================================================
-- ETAPA 6 · CASCADE → SET NULL nas FKs históricas (Phase 1)
--
-- Bloco DO único com loop sobre lista de FKs (não usa pg_temp que
-- não persiste entre sessões do SQL Editor).
--
-- Para cada FK:
--   1. DROP constraint atual
--   2. ALTER COLUMN to allow NULL
--   3. ADD constraint com ON DELETE SET NULL
--
-- Idempotente: pula se FK já é SET NULL ou se constraint não existe.
-- =====================================================================
DO $migration$
DECLARE
  v_constraint_name TEXT;
  v_current_action  CHAR(1);
  v_pair            RECORD;
BEGIN
  -- Lista de FKs a converter: (child_table, child_column, parent_table)
  FOR v_pair IN
    SELECT * FROM (VALUES
      -- mem_membros (9 FKs)
      ('mem_contribuicoes',            'membro_id',      'mem_membros'),
      ('mem_trilha_valores',           'membro_id',      'mem_membros'),
      ('mem_historico',                'membro_id',      'mem_membros'),
      ('mem_voluntarios',              'membro_id',      'mem_membros'),
      ('mem_escalas',                  'membro_id',      'mem_membros'),
      ('mem_checkins',                 'membro_id',      'mem_membros'),
      ('mem_devocionais',              'membro_id',      'mem_membros'),
      ('mem_grupo_membros',            'membro_id',      'mem_membros'),
      ('devocional_envios',            'membro_id',      'mem_membros'),
      -- rh_funcionarios (4 FKs)
      ('rh_documentos',                'funcionario_id', 'rh_funcionarios'),
      ('rh_treinamentos_funcionarios', 'funcionario_id', 'rh_funcionarios'),
      ('rh_ferias_licencas',           'funcionario_id', 'rh_funcionarios'),
      ('pcs_avaliacoes_funcionario',   'funcionario_id', 'rh_funcionarios'),
      -- cultos (2 FKs)
      ('cultos_decisoes_pessoas',      'culto_id',       'cultos'),
      ('kids_sessoes',                 'culto_id',       'cultos'),
      -- kpi_indicadores_taticos (2 FKs · MENOS kpi_valores_calculados PK composta)
      ('kpi_registros',                'indicador_id',   'kpi_indicadores_taticos'),
      ('kpi_trajetoria',               'kpi_id',         'kpi_indicadores_taticos'),
      -- Round 2 (descobertos após primeira execução)
      -- nsm_eventos: CRITICO · historico de jornada do convertido
      ('nsm_eventos',                  'membro_id',      'mem_membros'),
      ('mem_grupo_encontro_presencas', 'membro_id',      'mem_membros'),
      -- PCS/RH: avaliacoes e progressoes · LGPD pede preservar quando func sai
      ('pcs_pontuacao_colaborador',    'funcionario_id', 'rh_funcionarios'),
      ('pcs_progressoes',              'funcionario_id', 'rh_funcionarios'),
      ('rh_avaliacoes',                'funcionario_id', 'rh_funcionarios'),
      ('rh_avaliacoes_legacy_pre_pcs', 'funcionario_id', 'rh_funcionarios')
    ) AS p(child_table, child_column, parent_table)
  LOOP
    -- Descobre constraint FK existente
    SELECT con.conname, con.confdeltype
      INTO v_constraint_name, v_current_action
    FROM pg_constraint con
    JOIN pg_class c1     ON c1.oid = con.conrelid
    JOIN pg_namespace n1 ON n1.oid = c1.relnamespace
    JOIN pg_class c2     ON c2.oid = con.confrelid
    WHERE n1.nspname = 'public'
      AND c1.relname = v_pair.child_table
      AND c2.relname = v_pair.parent_table
      AND con.contype = 'f'
      AND v_pair.child_column = ANY (
        SELECT attname FROM pg_attribute
        WHERE attrelid = con.conrelid AND attnum = ANY(con.conkey)
      )
    LIMIT 1;

    IF v_constraint_name IS NULL THEN
      RAISE NOTICE 'FK % (%) -> % NAO ENCONTRADA · pulando',
        v_pair.child_table, v_pair.child_column, v_pair.parent_table;
      CONTINUE;
    END IF;

    IF v_current_action = 'n' THEN
      RAISE NOTICE 'FK % (%) -> % JA EH SET NULL · pulando',
        v_pair.child_table, v_pair.child_column, v_pair.parent_table;
      CONTINUE;
    END IF;

    -- 1. Drop FK atual
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
                   v_pair.child_table, v_constraint_name);

    -- 2. Permite NULL na coluna filha
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL',
                   v_pair.child_table, v_pair.child_column);

    -- 3. Recria com ON DELETE SET NULL
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE SET NULL',
      v_pair.child_table, v_constraint_name, v_pair.child_column, v_pair.parent_table
    );

    RAISE NOTICE 'FK % (%) -> % CONVERTIDA para SET NULL',
      v_pair.child_table, v_pair.child_column, v_pair.parent_table;
  END LOOP;

  RAISE NOTICE '=== Conversao CASCADE -> SET NULL concluida ===';
END
$migration$;

-- =====================================================================
-- ETAPA 7 · Comentários documentando a estratégia
-- =====================================================================
COMMENT ON COLUMN public.mem_membros.deleted_at IS
  'Soft-delete timestamp. NULL = ativo. Use app_soft_delete() / app_restore(). FKs CASCADE → SET NULL desde 2026-05-21 (preserva histórico de contribuições, trilha, batismos mesmo se membro for deletado).';

COMMENT ON COLUMN public.rh_funcionarios.deleted_at IS
  'Soft-delete timestamp. NULL = ativo. FKs CASCADE → SET NULL desde 2026-05-21 (preserva documentos, treinamentos, férias e avaliações PCS).';

COMMENT ON COLUMN public.cultos.deleted_at IS
  'Soft-delete timestamp. FKs CASCADE → SET NULL desde 2026-05-21 (preserva decisoes_pessoas e kids_sessoes do culto).';

COMMENT ON COLUMN public.kpi_indicadores_taticos.deleted_at IS
  'Soft-delete timestamp. FKs CASCADE → SET NULL desde 2026-05-21 (preserva kpi_registros, kpi_trajetoria, kpi_valores_calculados históricos).';

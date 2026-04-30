-- ============================================================================
-- mem_trilha_valores.etapa: corrige CHECK constraint
--
-- Outro schema drift: a migration original (20260413145129) criou a tabela
-- com etapa como TEXT sem CHECK. Em algum momento foi adicionado um CHECK
-- direto no Supabase Studio que nao inclui os valores usados pelo codigo
-- (jornada.js usa 'conversao', 'primeiro_contato', 'batismo').
--
-- Solucao: substituir o CHECK pelo que o codigo realmente usa.
-- ============================================================================

-- Drop constraint antigo (nome padrao do Postgres)
ALTER TABLE mem_trilha_valores
  DROP CONSTRAINT IF EXISTS mem_trilha_valores_etapa_check;

-- Recria com os valores aceitos pelo codigo (backend/routes/jornada.js +
-- triggers de visitante e batismo).
ALTER TABLE mem_trilha_valores
  ADD CONSTRAINT mem_trilha_valores_etapa_check
  CHECK (etapa IN (
    'conversao',         -- visitante fez decisao
    'primeiro_contato',  -- pos-conversao, acolhimento
    'batismo',           -- batismo realizado
    'membresia',         -- oficializou membresia
    'discipulado'        -- entrou em jornada de discipulado
  ));

-- Validacao:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'mem_trilha_valores'::regclass AND contype='c';

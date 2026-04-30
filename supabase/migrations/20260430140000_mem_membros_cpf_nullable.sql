-- ============================================================================
-- mem_membros.cpf: drop NOT NULL
--
-- A migration original que adicionou a coluna (20260413210000_add_cpf_membresia)
-- a criou nullable. Em algum momento o NOT NULL foi adicionado direto no Supabase
-- Studio (schema drift, sem migration correspondente).
--
-- Visitantes nao tem CPF no momento do cadastro (int_visitantes nao tem essa
-- coluna), entao o trigger fn_visitante_decisao_to_trilha falhava ao tentar
-- criar mem_membros automatico. Drop NOT NULL alinha o schema com o uso real
-- e com a intencao da migration original.
-- ============================================================================

ALTER TABLE mem_membros ALTER COLUMN cpf DROP NOT NULL;

-- Validacao:
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name='mem_membros' AND column_name='cpf';
-- Esperado: is_nullable = 'YES'

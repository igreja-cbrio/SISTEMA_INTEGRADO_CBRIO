-- ============================================================================
-- mem_trilha_valores.etapa: dropa CHECK constraint
--
-- A migration original (20260413145129) criou etapa como TEXT sem CHECK.
-- O CHECK foi adicionado direto no Supabase Studio em algum momento
-- (schema drift) com uma lista que nao bate nem com (a) os valores ja
-- existentes na tabela nem com (b) os valores que o codigo backend usa
-- ('conversao', 'primeiro_contato', 'batismo').
--
-- Solucao: dropar o constraint. A camada de aplicacao (jornada.js,
-- triggers) controla os valores aceitos. Sem enforcement no banco
-- evita-se conflito com dados historicos.
-- ============================================================================

ALTER TABLE mem_trilha_valores
  DROP CONSTRAINT IF EXISTS mem_trilha_valores_etapa_check;

-- Validacao:
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'mem_trilha_valores'::regclass AND contype='c';
-- Esperado: nao retorna mem_trilha_valores_etapa_check

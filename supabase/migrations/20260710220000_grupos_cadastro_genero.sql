-- Inscrição pública de grupos: data de nascimento e sexo viram obrigatórios
-- (decisão do Marcos 2026-07-10 — filtra inscrições acidentais e alimenta os
-- avisos não-bloqueantes: adulto em grupo de adolescentes, homem em grupo de
-- mulheres etc.). mem_membros já tem a coluna `genero` (vazia · convenção
-- estabelecida agora: 'masculino' | 'feminino'); o cadastro pendente ganha a
-- sua. Aditiva e idempotente.
ALTER TABLE public.mem_cadastros_pendentes
  ADD COLUMN IF NOT EXISTS genero text;

COMMENT ON COLUMN public.mem_cadastros_pendentes.genero IS
  'Sexo declarado na inscrição pública (masculino | feminino). Propagado para mem_membros.genero na aprovação quando o membro ainda não tem.';

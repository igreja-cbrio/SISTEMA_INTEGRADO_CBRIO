-- Renovação de temporada · grupos de conexão (2026-07-09)
--
-- Decisão do Marcos: uma pessoa PODE participar de mais de um grupo ao mesmo
-- tempo (grupos de estudo). Portanto a regra antiga "1 grupo ativo por pessoa"
-- (índice único uniq_mem_grupo_membros_ativo) não vale mais para este modelo.
--
-- Observação: esse índice já NÃO estava valendo em produção (drift migration↔
-- prod) — havia 273 pessoas ativas em >1 grupo. O DROP aqui apenas formaliza
-- a decisão e mantém o histórico do git coerente com a realidade.
--
-- O problema real (duplicidade ENTRE temporadas) passa a ser resolvido pelo
-- mecanismo de "renovação de temporada" (rotas /api/grupos/renovacao/*):
--  1. o líder confirma quem continua no grupo dele na temporada nova
--     (cria vínculo na temporada nova · sem fechar o da anterior);
--  2. ao virar a temporada, "encerrar" fecha em bloco os vínculos da temporada
--     anterior (saiu_em + motivo_saida = 'Encerramento <temporada>'), reversível.
-- Nada disso precisa de tabela nova — deriva de mem_grupo_membros + a coluna
-- temporada de mem_grupos + lider_id.

DROP INDEX IF EXISTS public.uniq_mem_grupo_membros_ativo;

COMMENT ON COLUMN public.mem_grupo_membros.motivo_saida IS
  'Motivo do fim da participação. "Encerramento <temporada>" é gravado em bloco '
  'pela renovação de temporada (reversível via /renovacao/reabrir).';

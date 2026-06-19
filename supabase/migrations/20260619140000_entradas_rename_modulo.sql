-- ============================================================================
-- Renomeia o DISPLAY do módulo "Next - Batismo" → "Entradas" (Marcos · 2026-06-19)
--
-- Decisão travada: SÓ O RÓTULO. O slug `next-batismo` segue decidindo
-- permissões/RLS/override do Kevyn, então NÃO muda (evita drift de matriz +
-- relogin). Esta migration só alinha o nome exibido em /admin/permissoes com o
-- menu/tela, que já dizem "Entradas". Idempotente · não-destrutiva · não toca
-- matriz, RLS nem o slug.
-- ============================================================================
UPDATE public.modulos
   SET nome = 'Entradas',
       descricao = 'Porta de entrada de quem chega na igreja · uma pessoa = um cadastro · liga inscrição (Next/Batismo) ao membro certo e funde duplicados'
 WHERE slug = 'next-batismo';

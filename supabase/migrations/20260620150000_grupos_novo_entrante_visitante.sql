-- ============================================================================
-- Grupos · ótica das próximas temporadas: quem ENTRA num grupo começa como
-- VISITANTE e vira membro automaticamente no 4º check-in (regra
-- fn_grupo_auto_membro · presencas > 3). Pedido do Marcos (2026-06-20).
--
-- Implementação mínima e segura: muda só o DEFAULT da coluna funcao.
--  • NÃO altera quem já está cadastrado — defaults só valem pra inserts NOVOS,
--    então os membros atuais continuam 'frequentador' (Membro). ✔ pedido do Marcos.
--  • Os inserts de mem_grupo_membros (adicionar membro, aprovação de pedido,
--    upload da próxima temporada) não setam funcao → passam a nascer 'visitante'.
--  • Marcar alguém como líder/co-líder/treinamento continua explícito (não usa
--    o default), então não é afetado.
-- ============================================================================

ALTER TABLE public.mem_grupo_membros
  ALTER COLUMN funcao SET DEFAULT 'visitante';

COMMENT ON COLUMN public.mem_grupo_membros.funcao IS
  'Papel no grupo. Novos entrantes nascem visitante (default) e viram frequentador (membro) no 4º check-in (fn_grupo_auto_membro). Líder/co-líder/treinamento/supervisor/coordenador são marcados explicitamente.';

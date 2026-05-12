-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Remove o CHECK constraint notificacoes_tipo_check                     ║
-- ║                                                                       ║
-- ║ Bug: novos módulos (NPS, assistenteIA, etc.) chamam notificar() com   ║
-- ║ valores de "tipo" novos que não estavam no constraint original. O     ║
-- ║ INSERT falhava silenciosamente em notificar.js, e a notificação       ║
-- ║ nunca chegava ao destinatário.                                        ║
-- ║                                                                       ║
-- ║ O campo "tipo" é uma string livre de categoria (ex: 'pesquisa_aberta',║
-- ║ 'auditoria_critica', 'ferias_vencendo'). Não faz sentido travar via   ║
-- ║ CHECK — cada módulo novo teria que mexer no schema.                   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.notificacoes
  DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;

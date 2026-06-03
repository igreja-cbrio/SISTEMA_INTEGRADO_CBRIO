-- ============================================================================
-- Notificacao de NOVA INSCRICAO de voluntario · destinatarios
-- ----------------------------------------------------------------------------
-- O backend ja dispara notificar({ modulo:'voluntariado' }) no POST
-- /api/public/voluntariado/inscrever-form. Sem regra em notificacao_regras,
-- o servico cai no fallback (todos admin/diretor). Esta migration restringe os
-- destinatarios do modulo 'voluntariado' aos alvos certos:
--   - todos os perfis com role = 'dev' (cobre o solicitante, que e dev)
--   - Jessica e Ariel (equipe de voluntariado · match por nome, a prova de acento)
--
-- Idempotente: usa NOT EXISTS pra nao duplicar e reativa regras inativas.
-- Se o nome nao casar (homonimo / grafia diferente), basta cadastrar a pessoa
-- em /admin/notificacao-regras (modulo Voluntariado) ou ajustar aqui por email.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Insere as regras que ainda nao existem
INSERT INTO public.notificacao_regras (modulo, profile_id, ativo)
SELECT 'voluntariado', p.id, true
  FROM public.profiles p
 WHERE p.active = true
   AND (
        p.role = 'dev'
     OR unaccent(lower(coalesce(p.name, ''))) LIKE '%jessica%'
     OR unaccent(lower(coalesce(p.name, ''))) LIKE '%ariel%'
   )
   AND NOT EXISTS (
        SELECT 1 FROM public.notificacao_regras r
         WHERE r.modulo = 'voluntariado' AND r.profile_id = p.id
   );

-- Reativa eventuais regras desativadas para os mesmos alvos
UPDATE public.notificacao_regras r
   SET ativo = true
  FROM public.profiles p
 WHERE r.profile_id = p.id
   AND r.modulo = 'voluntariado'
   AND r.ativo = false
   AND p.active = true
   AND (
        p.role = 'dev'
     OR unaccent(lower(coalesce(p.name, ''))) LIKE '%jessica%'
     OR unaccent(lower(coalesce(p.name, ''))) LIKE '%ariel%'
   );

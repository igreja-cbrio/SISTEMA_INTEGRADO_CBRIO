-- Notificação (sininho) de novas inscrições em Eventos Externos → Ariel e Jessica.
-- Regras por profile (notificacao_regras). Idempotente por (modulo, profile_id).
INSERT INTO public.notificacao_regras (modulo, profile_id, ativo)
SELECT 'eventos-externos', p.id, true
FROM public.profiles p
WHERE p.email IN ('ariel.jardim@cbrio.org','jessica.salviano@cbrio.org')
  AND NOT EXISTS (
    SELECT 1 FROM public.notificacao_regras r
    WHERE r.modulo = 'eventos-externos' AND r.profile_id = p.id
  );

-- ============================================================================
-- Sync rh_funcionarios -> mem_membros + linka profile.membro_id
-- Marcos: "todas as pessoas de RH sejam inseridas como membro para poder
--          acessar as devocionais e coisas pra eles enquanto membros"
--
-- Idempotente · 2 passos:
-- 1. Cria mem_membros pra cada funcionario ativo que NAO tem match por email
-- 2. Atualiza profiles.membro_id pra linkar com mem_membros (via email)
-- ============================================================================

-- Passo 1 · funcionarios ativos viram mem_membros
INSERT INTO public.mem_membros (nome, email, telefone, status, active)
SELECT
  rh.nome,
  LOWER(TRIM(rh.email)),
  rh.telefone,
  'membro_ativo',
  true
  FROM public.rh_funcionarios rh
 WHERE rh.status = 'ativo'
   AND rh.email IS NOT NULL
   AND TRIM(rh.email) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.mem_membros m
      WHERE LOWER(TRIM(m.email)) = LOWER(TRIM(rh.email))
   );

-- Passo 2 · linka profile.membro_id com mem_membros via email (idempotente)
UPDATE public.profiles p
   SET membro_id = m.id
  FROM public.mem_membros m
 WHERE p.membro_id IS NULL
   AND p.email IS NOT NULL
   AND m.active = true
   AND LOWER(TRIM(p.email)) = LOWER(TRIM(m.email));

-- Conferencia (descomente no Studio):
-- SELECT count(*) AS funcionarios_ativos FROM rh_funcionarios WHERE status='ativo' AND email IS NOT NULL;
-- SELECT count(*) AS mem_membros_total FROM mem_membros WHERE active=true;
-- SELECT count(*) AS profiles_com_membro FROM profiles WHERE membro_id IS NOT NULL AND active=true;

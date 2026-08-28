-- Migration: Atribuir permissão de DEV a Diego Assis (diego.assis@cbrio.org)

-- 1. Inserir/Atualizar Diego Assis em app_super_admins
INSERT INTO public.app_super_admins (email, nome, ativo, added_by, notes)
VALUES (
  'diego.assis@cbrio.org',
  'Diego Assis',
  true,
  'matheus-request-dev-perm',
  'Desenvolvedor com acesso total ao sistema (DEV)'
)
ON CONFLICT (email) DO UPDATE
SET ativo = true,
    added_by = EXCLUDED.added_by,
    notes = EXCLUDED.notes;

-- 2. Atribuir o cargo formal 'dev' para Diego Assis em usuarios
UPDATE public.usuarios
SET cargo_id = (SELECT id FROM public.cargos WHERE slug = 'dev'),
    updated_at = now()
WHERE LOWER(email) = 'diego.assis@cbrio.org';

-- 3. Atualizar role em profiles para 'admin'
UPDATE public.profiles
SET role = 'admin',
    updated_at = now()
WHERE LOWER(email) = 'diego.assis@cbrio.org';

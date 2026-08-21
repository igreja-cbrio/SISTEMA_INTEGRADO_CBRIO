-- Acesso do Marcos ao gerenciamento de Batismo no aplicativo.
-- Idempotente: mantém o registro ativo mesmo se a migration for reaplicada.
INSERT INTO public.app_super_admins (email, nome, ativo, added_by, notes)
VALUES (
  'marcospaulo.da@gmail.com',
  'Marcos Paulo',
  true,
  'batismo-app-fix',
  'Acesso de gestão do Batismo no aplicativo'
)
ON CONFLICT (email) DO UPDATE
SET nome = EXCLUDED.nome,
    ativo = true,
    added_by = EXCLUDED.added_by,
    notes = EXCLUDED.notes;

-- Sistema · acesso principal e consolidação das superfícies administrativas
-- Idempotente: preserva os superadmins existentes e ativa o e-mail usado por
-- Marcos no login atual do ERP.

INSERT INTO public.app_super_admins (email, nome, ativo, added_by, notes)
VALUES (
  'marcospaulo.almeida@cbrio.org',
  'Marcos Paulo Domingues de Almeida',
  true,
  'sistema-etapa5-correcao',
  'Conta admin principal · acesso ao command center Sistema'
)
ON CONFLICT (email) DO UPDATE
SET nome = EXCLUDED.nome,
    ativo = true,
    added_by = EXCLUDED.added_by,
    notes = EXCLUDED.notes;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_super_admins
    WHERE lower(email) = 'marcospaulo.almeida@cbrio.org'
      AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Falha ao ativar o superadmin principal do Sistema';
  END IF;
END $$;

COMMENT ON TABLE public.app_super_admins IS
  'Lista estrita de contas autorizadas ao command center Sistema e suas superfícies internas.';

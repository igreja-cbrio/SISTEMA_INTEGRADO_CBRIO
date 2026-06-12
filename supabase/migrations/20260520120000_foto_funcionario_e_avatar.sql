-- Foto de perfil de funcionarios (RH) + bucket avatars pra profiles.
--
-- rh_funcionarios ja eh lido com select('*') no backend e o RH.jsx ja
-- consome data.foto_url e tf.rh_funcionarios?.foto_url · so faltava a coluna.

ALTER TABLE public.rh_funcionarios
  ADD COLUMN IF NOT EXISTS foto_url text;

-- Bucket publico pra avatars de profiles (login geral · admin/colab/membro)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

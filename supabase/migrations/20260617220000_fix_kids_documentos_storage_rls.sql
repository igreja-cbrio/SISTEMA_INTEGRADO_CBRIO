-- ============================================================
-- Fix · RLS de storage do bucket privado kids-documentos (2026-06-17)
-- Sintoma: "new row violates row-level security policy" ao subir documento/foto
-- da criança pelo app (vínculo + foto). Causa: a policy `kids_docs_insert_own`
-- era `TO authenticated`, mas o upload do Storage é avaliado sob o papel `public`
-- (mesmo com JWT válido) — então a policy nunca casava. As policies que
-- funcionam (ex.: avatars_insert_proprio) são `TO public` com o check de
-- auth.uid(). O check `(storage.foldername(name))[1] = auth.uid()` continua
-- restringindo ao dono (anon tem auth.uid() NULL → negado).
-- ============================================================
DROP POLICY IF EXISTS kids_docs_insert_own ON storage.objects;

CREATE POLICY kids_docs_insert_own ON storage.objects
  FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'kids-documentos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- upsert do app (substituir a foto) precisa de UPDATE no próprio prefixo.
DROP POLICY IF EXISTS kids_docs_update_own ON storage.objects;
CREATE POLICY kids_docs_update_own ON storage.objects
  FOR UPDATE TO public
  USING (
    bucket_id = 'kids-documentos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'kids-documentos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

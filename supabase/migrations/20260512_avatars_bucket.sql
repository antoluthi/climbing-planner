-- ─── Avatars bucket ──────────────────────────────────────────────────────────
-- Bucket public en lecture pour héberger les photos de profil.
-- Path convention : {auth.uid()}.jpg ou {auth.uid()}.png
-- Chaque utilisateur peut INSERT / UPDATE / DELETE uniquement son propre
-- fichier ; SELECT public via `public = true` sur le bucket.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lecture publique (le bucket est déjà `public = true` mais on rend
-- explicite via une policy).
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- INSERT : un utilisateur ne peut uploader que son propre fichier
-- (nom = {auth.uid()}.{ext}).
DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
CREATE POLICY "avatars_own_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] IS NULL
    AND name LIKE auth.uid()::text || '.%'
  );

-- UPDATE : idem
DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '.%'
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '.%'
  );

-- DELETE : idem
DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name LIKE auth.uid()::text || '.%'
  );

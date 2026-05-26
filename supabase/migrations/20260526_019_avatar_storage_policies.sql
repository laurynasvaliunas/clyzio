-- Migration 019: Avatar storage bucket — version-controlled policies.
-- Date: 2026-05-26
--
-- Background (audit H3):
--   The avatars bucket was created/configured via the Supabase Dashboard
--   only. There is no version-controlled record of correct state, so the
--   bucket could drift to a misconfigured posture (publicly listable,
--   unrestricted upload paths, unlimited file size, any MIME type).
--
-- Fix: codify the intended configuration here. Bucket is PUBLIC for read
-- (avatars are intentionally world-readable via getPublicUrl) but write
-- access is scoped to `{auth.uid()}/...` so users cannot overwrite or
-- delete each other's files.
--
-- Idempotent: ON CONFLICT on the bucket row, DROP IF EXISTS for each policy.

BEGIN;

-- 1) Bucket configuration. 2 MB file size cap matches the 0.8 quality
--    setting we use in expo-image-picker (a 1:1 cropped photo at quality
--    0.8 lands well under 2 MB). Allowed MIME types match what we accept
--    in `app/settings/edit-profile.tsx` and `app/(tabs)/profile.tsx`
--    upload paths.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types= EXCLUDED.allowed_mime_types;

-- 2) Policies. Path convention: `<user_uuid>/<filename>` — matched by both
--    upload sites in the client (see edit-profile.tsx uploadAvatar() and
--    (tabs)/profile.tsx uploadAvatar()).

-- Read: everyone (even anon, for cached <Image> fetches by URL).
DROP POLICY IF EXISTS "Avatars are readable by everyone" ON storage.objects;
CREATE POLICY "Avatars are readable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Insert: only the owning user, only under their own UUID prefix.
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update (upsert path): same prefix-scoped check on both sides.
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: scoped to own prefix (used by delete-account cleanup if ever wired
-- in via service role; service role bypasses RLS anyway).
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

-- Migration 020: clear the `public_bucket_allows_listing` advisor lint on the
-- company-logos bucket. Same approach as migration 019 for avatars: drop the
-- broad SELECT policy so `.list()` is blocked, while keeping bucket public so
-- getPublicUrl still serves logo URLs over the public CDN.
--
-- The admin INSERT/UPDATE/DELETE policies (gated by `is_company_admin`) stay.

DROP POLICY IF EXISTS "Company logos are public" ON storage.objects;

-- ============================================================
-- STORAGE FIX: Add RLS policies for question-images bucket
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Allow public read (GET) on question-images
CREATE POLICY "storage_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'question-images');

-- Allow anyone to upload to question-images (admin uses anon key)
CREATE POLICY "storage_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'question-images');

-- Allow anyone to update (replace) files
CREATE POLICY "storage_update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'question-images');

-- Allow anyone to delete files
CREATE POLICY "storage_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'question-images');

SELECT 'Storage policies applied! Image uploads should now work.' AS status;

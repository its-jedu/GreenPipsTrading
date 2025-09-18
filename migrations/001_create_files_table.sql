-- Create files table
CREATE TABLE files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  path TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own files
CREATE POLICY "Users can only access own files"
ON files FOR ALL
USING (auth.uid() = owner_id);

-- Create index for better performance
CREATE INDEX idx_files_owner_id ON files(owner_id);
CREATE INDEX idx_files_path ON files(path);

-- Policy 1: Users can only upload to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Users can only read their own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 3: Users can update their own files
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Users can delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'uploads'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

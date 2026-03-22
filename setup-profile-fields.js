const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function setupProfileFields() {
  console.log('🔧 Setting up profile fields...\n');
  
  const sql = `
    -- Add profile fields
    ALTER TABLE public.profiles 
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS car_make TEXT,
      ADD COLUMN IF NOT EXISTS car_model TEXT,
      ADD COLUMN IF NOT EXISTS car_color TEXT,
      ADD COLUMN IF NOT EXISTS car_plate TEXT;
    
    -- Update avatar_url if not exists
    ALTER TABLE public.profiles 
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
  `;
  
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed SQL:', response.status, errorText);
    return;
  }
  
  console.log('✅ Profile fields added!');
  console.log('   - first_name, last_name, phone');
  console.log('   - car_make, car_model, car_color, car_plate');
  console.log('   - avatar_url');

  // Create storage bucket
  console.log('\n🔧 Creating avatars storage bucket...');
  
  const bucketResponse = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('avatars', 'avatars', true)
        ON CONFLICT (id) DO UPDATE SET public = true;
        
        -- Allow authenticated users to upload their own avatars
        DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
        CREATE POLICY "Users can upload own avatar" ON storage.objects
          FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
        
        DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
        CREATE POLICY "Users can update own avatar" ON storage.objects
          FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
        
        DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
        CREATE POLICY "Avatars are publicly accessible" ON storage.objects
          FOR SELECT USING (bucket_id = 'avatars');
      `
    }),
  });
  
  if (!bucketResponse.ok) {
    const errorText = await bucketResponse.text();
    console.log('⚠️ Storage bucket note:', errorText);
    console.log('   (Bucket may already exist or needs manual setup)');
  } else {
    console.log('✅ Avatars bucket created with public access!');
  }
}

setupProfileFields().catch(console.error);


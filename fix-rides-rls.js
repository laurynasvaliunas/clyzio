const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qvevbbqcrizfywqexlkw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2ZXZiYnFjcml6Znl3cWV4bGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA4MDMsImV4cCI6MjA4MDI3NjgwM30.xxUFjg3RGvAcYkVvZzKxbWTG8MuAl0pX72fgTvaLhWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixRidesRLS() {
  console.log('Fixing RLS policies for rides table...');
  console.log('');
  console.log('Please run these SQL commands in Supabase Dashboard (SQL Editor):');
  console.log('');
  console.log(`
-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.rides;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.rides;
DROP POLICY IF EXISTS "Enable update for ride owners" ON public.rides;
DROP POLICY IF EXISTS "Enable insert for ride participants" ON public.rides;
DROP POLICY IF EXISTS "Enable select for ride participants" ON public.rides;

-- Enable RLS
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow INSERT for authenticated users (as driver OR rider)
CREATE POLICY "Enable insert for ride participants"
ON public.rides
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = driver_id OR auth.uid() = rider_id
);

-- Policy 2: Allow SELECT for ride participants (driver OR rider)
CREATE POLICY "Enable select for ride participants"
ON public.rides
FOR SELECT
TO authenticated
USING (
  auth.uid() = driver_id OR auth.uid() = rider_id
);

-- Policy 3: Allow UPDATE for ride participants
CREATE POLICY "Enable update for ride owners"
ON public.rides
FOR UPDATE
TO authenticated
USING (auth.uid() = driver_id OR auth.uid() = rider_id)
WITH CHECK (auth.uid() = driver_id OR auth.uid() = rider_id);

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'rides';
  `);
  
  console.log('');
  console.log('After running the SQL above, the RLS policies should allow:');
  console.log('✅ INSERT: When user is the driver OR rider');
  console.log('✅ SELECT: When user is the driver OR rider');
  console.log('✅ UPDATE: When user is the driver OR rider');
}

fixRidesRLS().catch(console.error);


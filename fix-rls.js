const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

const sql = `
-- Fix RLS policies for rides table
DROP POLICY IF EXISTS "Users can view own rides" ON public.rides;
DROP POLICY IF EXISTS "Users can create rides" ON public.rides;
DROP POLICY IF EXISTS "Users can update own rides" ON public.rides;
DROP POLICY IF EXISTS "Users can insert rides" ON public.rides;
DROP POLICY IF EXISTS "Users can view rides" ON public.rides;
DROP POLICY IF EXISTS "Users can update rides" ON public.rides;

-- Allow authenticated users to insert rides
CREATE POLICY "Users can insert rides" ON public.rides
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = rider_id);

-- Allow users to view rides they are part of
CREATE POLICY "Users can view rides" ON public.rides
  FOR SELECT TO authenticated
  USING (auth.uid() = rider_id OR auth.uid() = driver_id);

-- Allow users to update their own rides
CREATE POLICY "Users can update rides" ON public.rides
  FOR UPDATE TO authenticated
  USING (auth.uid() = rider_id OR auth.uid() = driver_id);

-- Fix RLS policies for messages table
DROP POLICY IF EXISTS "Users can view ride messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Users can select messages" ON public.messages;

-- Allow users to insert messages for rides they're part of
CREATE POLICY "Users can insert messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.rides 
      WHERE rides.id = ride_id 
      AND (rides.rider_id = auth.uid() OR rides.driver_id = auth.uid())
    )
  );

-- Allow users to view messages for rides they're part of
CREATE POLICY "Users can select messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rides 
      WHERE rides.id = ride_id 
      AND (rides.rider_id = auth.uid() OR rides.driver_id = auth.uid())
    )
  );

-- Ensure RLS is enabled
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
`;

async function fixRLS() {
  console.log('🔧 Fixing RLS policies...\n');
  
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
    console.error('❌ Failed:', response.status, errorText);
    return;
  }
  
  console.log('✅ RLS policies fixed!');
  console.log('   - rides: INSERT, SELECT, UPDATE policies created');
  console.log('   - messages: INSERT, SELECT policies created');
}

fixRLS().catch(console.error);

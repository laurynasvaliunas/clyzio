const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function updateProfiles() {
  console.log('🔧 Updating profiles table...\n');
  
  const sql = `
    -- Add commuting_habits column (JSONB for flexible storage)
    ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS commuting_habits JSONB DEFAULT '[]'::jsonb;
    
    -- Add baseline_co2 column (calculated weighted average)
    ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS baseline_co2 DOUBLE PRECISION DEFAULT 0.192;
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
    console.error('❌ Failed:', response.status, errorText);
    return;
  }
  
  console.log('✅ Profiles table updated!');
  console.log('   - commuting_habits (jsonb) added');
  console.log('   - baseline_co2 (float) added');
}

updateProfiles().catch(console.error);


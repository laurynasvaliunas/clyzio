const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function addScheduledColumn() {
  console.log('🔧 Adding scheduled_at column to rides table...\n');
  
  const sql = `
    ALTER TABLE public.rides 
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
    
    -- Update status check to include 'scheduled'
    ALTER TABLE public.rides 
    DROP CONSTRAINT IF EXISTS rides_status_check;
    
    ALTER TABLE public.rides 
    ADD CONSTRAINT rides_status_check 
    CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'scheduled'));
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
  
  console.log('✅ Database updated!');
  console.log('   - scheduled_at column added to rides');
  console.log('   - status now supports: scheduled');
}

addScheduledColumn().catch(console.error);


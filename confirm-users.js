const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function confirmAllUsers() {
  console.log('🔧 Confirming all unconfirmed users...\n');
  
  const sql = `
    UPDATE auth.users 
    SET email_confirmed_at = NOW(),
        updated_at = NOW()
    WHERE email_confirmed_at IS NULL;
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
  
  console.log('✅ All users email confirmed!');
  console.log('   You should now be able to sign in.');
}

confirmAllUsers().catch(console.error);

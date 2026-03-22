const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function fixAuth() {
  console.log('🔧 Updating Supabase Auth settings...\n');
  
  // Disable email confirmation requirement
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mailer_autoconfirm: true,  // Auto-confirm email addresses
      sms_autoconfirm: true,     // Auto-confirm phone numbers
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Failed:', response.status, errorText);
    return;
  }
  
  const result = await response.json();
  console.log('✅ Auth settings updated!');
  console.log('   - Email confirmation: DISABLED (auto-confirm enabled)');
  console.log('   - You can now sign up and sign in immediately');
  console.log('\n📝 Try signing up with a new email or signing in with your existing one.');
}

fixAuth().catch(console.error);


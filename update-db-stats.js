const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function updateDatabase() {
  console.log('🔧 Updating database for Stats feature...\n');
  
  const sql = `
    -- Add department column to profiles
    ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'General';

    -- Create function to get user impact stats
    CREATE OR REPLACE FUNCTION public.get_user_impact(user_uuid UUID)
    RETURNS JSON AS $$
    DECLARE
      result JSON;
      user_domain TEXT;
      user_company TEXT;
    BEGIN
      -- Get user's email domain
      SELECT 
        SPLIT_PART(email, '@', 2),
        company_name
      INTO user_domain, user_company
      FROM public.profiles
      WHERE id = user_uuid;

      -- Build result JSON
      SELECT json_build_object(
        'total_co2_saved', COALESCE(SUM(co2_saved), 0),
        'total_trips', COUNT(*),
        'this_week_co2', COALESCE(SUM(CASE 
          WHEN created_at >= DATE_TRUNC('week', NOW()) THEN co2_saved 
          ELSE 0 
        END), 0),
        'last_week_co2', COALESCE(SUM(CASE 
          WHEN created_at >= DATE_TRUNC('week', NOW()) - INTERVAL '7 days'
            AND created_at < DATE_TRUNC('week', NOW()) THEN co2_saved 
          ELSE 0 
        END), 0)
      ) INTO result
      FROM public.rides
      WHERE (rider_id = user_uuid OR driver_id = user_uuid)
        AND status = 'completed';

      RETURN result;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Create function to get company leaderboard
    CREATE OR REPLACE FUNCTION public.get_company_leaderboard(user_uuid UUID)
    RETURNS JSON AS $$
    DECLARE
      result JSON;
      user_domain TEXT;
    BEGIN
      -- Get user's email domain
      SELECT SPLIT_PART(email, '@', 2)
      INTO user_domain
      FROM public.profiles
      WHERE id = user_uuid;

      -- Get top 5 users from same domain
      SELECT json_agg(leaderboard ORDER BY total_saved DESC)
      INTO result
      FROM (
        SELECT 
          p.id,
          SPLIT_PART(p.email, '@', 1) as name,
          p.department,
          COALESCE(SUM(r.co2_saved), 0) as total_saved,
          CASE WHEN p.id = user_uuid THEN true ELSE false END as is_current_user
        FROM public.profiles p
        LEFT JOIN public.rides r ON (r.rider_id = p.id OR r.driver_id = p.id) AND r.status = 'completed'
        WHERE SPLIT_PART(p.email, '@', 2) = user_domain
        GROUP BY p.id, p.email, p.department
        ORDER BY total_saved DESC
        LIMIT 5
      ) leaderboard;

      RETURN COALESCE(result, '[]'::json);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
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
  console.log('   - department column added to profiles');
  console.log('   - get_user_impact() function created');
  console.log('   - get_company_leaderboard() function created');
}

updateDatabase().catch(console.error);


const SUPABASE_ACCESS_TOKEN = '***REVOKED-SUPABASE-TOKEN***';
const PROJECT_REF = 'qvevbbqcrizfywqexlkw';

async function setupGamification() {
  console.log('🔧 Setting up Gamification system...\n');
  
  const sql = `
    -- Add gamification columns to profiles
    ALTER TABLE public.profiles 
      ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS badges JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS total_trips INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_carpools INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_walks INTEGER DEFAULT 0;

    -- Create function to calculate user level from XP
    CREATE OR REPLACE FUNCTION public.calculate_user_level(xp INTEGER)
    RETURNS INTEGER AS $$
    BEGIN
      -- Level thresholds: 0-100=1, 101-300=2, 301-600=3, 601-1000=4, 1001-1500=5, etc.
      IF xp < 100 THEN RETURN 1;
      ELSIF xp < 300 THEN RETURN 2;
      ELSIF xp < 600 THEN RETURN 3;
      ELSIF xp < 1000 THEN RETURN 4;
      ELSIF xp < 1500 THEN RETURN 5;
      ELSIF xp < 2100 THEN RETURN 6;
      ELSIF xp < 2800 THEN RETURN 7;
      ELSIF xp < 3600 THEN RETURN 8;
      ELSIF xp < 4500 THEN RETURN 9;
      ELSE RETURN 10;
      END IF;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- Create function to get XP thresholds for a level
    CREATE OR REPLACE FUNCTION public.get_level_thresholds(level INTEGER)
    RETURNS TABLE(min_xp INTEGER, max_xp INTEGER) AS $$
    BEGIN
      CASE level
        WHEN 1 THEN RETURN QUERY SELECT 0, 100;
        WHEN 2 THEN RETURN QUERY SELECT 100, 300;
        WHEN 3 THEN RETURN QUERY SELECT 300, 600;
        WHEN 4 THEN RETURN QUERY SELECT 600, 1000;
        WHEN 5 THEN RETURN QUERY SELECT 1000, 1500;
        WHEN 6 THEN RETURN QUERY SELECT 1500, 2100;
        WHEN 7 THEN RETURN QUERY SELECT 2100, 2800;
        WHEN 8 THEN RETURN QUERY SELECT 2800, 3600;
        WHEN 9 THEN RETURN QUERY SELECT 3600, 4500;
        ELSE RETURN QUERY SELECT 4500, 9999;
      END CASE;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    -- Create function to award XP and check for new badges
    CREATE OR REPLACE FUNCTION public.award_xp(user_uuid UUID, xp_amount INTEGER, trip_type TEXT)
    RETURNS JSONB AS $$
    DECLARE
      old_xp INTEGER;
      new_xp INTEGER;
      old_level INTEGER;
      new_level INTEGER;
      current_badges JSONB;
      new_badges JSONB := '[]'::jsonb;
      total_co2 FLOAT;
      trip_count INTEGER;
      carpool_count INTEGER;
      walk_count INTEGER;
    BEGIN
      -- Get current stats
      SELECT xp_points, badges, total_trips, total_carpools, total_walks
      INTO old_xp, current_badges, trip_count, carpool_count, walk_count
      FROM public.profiles WHERE id = user_uuid;
      
      old_xp := COALESCE(old_xp, 0);
      current_badges := COALESCE(current_badges, '[]'::jsonb);
      trip_count := COALESCE(trip_count, 0);
      carpool_count := COALESCE(carpool_count, 0);
      walk_count := COALESCE(walk_count, 0);
      
      -- Calculate new values
      new_xp := old_xp + xp_amount;
      old_level := public.calculate_user_level(old_xp);
      new_level := public.calculate_user_level(new_xp);
      trip_count := trip_count + 1;
      
      -- Update trip type counters
      IF trip_type IN ('drive_share', 'find_ride') THEN
        carpool_count := carpool_count + 1;
      ELSIF trip_type = 'walk' THEN
        walk_count := walk_count + 1;
      END IF;
      
      -- Get total CO2 saved
      SELECT COALESCE(SUM(co2_saved), 0) INTO total_co2
      FROM public.rides
      WHERE (rider_id = user_uuid OR driver_id = user_uuid) AND status = 'completed';
      
      -- Check for new badges
      -- First Trip
      IF trip_count = 1 AND NOT current_badges @> '"first_trip"' THEN
        new_badges := new_badges || '"first_trip"'::jsonb;
      END IF;
      
      -- First Carpool
      IF carpool_count = 1 AND NOT current_badges @> '"first_carpool"' THEN
        new_badges := new_badges || '"first_carpool"'::jsonb;
      END IF;
      
      -- 5 Walk Trips
      IF walk_count >= 5 AND NOT current_badges @> '"walker_5"' THEN
        new_badges := new_badges || '"walker_5"'::jsonb;
      END IF;
      
      -- 10 Trips
      IF trip_count >= 10 AND NOT current_badges @> '"trips_10"' THEN
        new_badges := new_badges || '"trips_10"'::jsonb;
      END IF;
      
      -- 50kg CO2 Saved
      IF total_co2 >= 50 AND NOT current_badges @> '"co2_50"' THEN
        new_badges := new_badges || '"co2_50"'::jsonb;
      END IF;
      
      -- 100kg CO2 Saved
      IF total_co2 >= 100 AND NOT current_badges @> '"co2_100"' THEN
        new_badges := new_badges || '"co2_100"'::jsonb;
      END IF;
      
      -- Update profile
      UPDATE public.profiles SET
        xp_points = new_xp,
        badges = current_badges || new_badges,
        total_trips = trip_count,
        total_carpools = carpool_count,
        total_walks = walk_count
      WHERE id = user_uuid;
      
      -- Return result
      RETURN jsonb_build_object(
        'old_xp', old_xp,
        'new_xp', new_xp,
        'xp_gained', xp_amount,
        'old_level', old_level,
        'new_level', new_level,
        'leveled_up', new_level > old_level,
        'new_badges', new_badges
      );
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
  
  console.log('✅ Gamification system ready!');
  console.log('   - xp_points, badges columns added');
  console.log('   - calculate_user_level() function created');
  console.log('   - get_level_thresholds() function created');
  console.log('   - award_xp() function created');
  console.log('\n📊 Level Thresholds:');
  console.log('   Level 1: 0-100 XP');
  console.log('   Level 2: 100-300 XP');
  console.log('   Level 3: 300-600 XP');
  console.log('   Level 4: 600-1000 XP');
  console.log('   Level 5: 1000-1500 XP');
  console.log('   ...');
}

setupGamification().catch(console.error);


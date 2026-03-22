-- Migration: Add gamification columns to profiles table
-- This ensures the profiles table has all necessary columns for XP, CO2 tracking, and trip counting

-- Add xp_points column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'xp_points'
  ) THEN
    ALTER TABLE profiles ADD COLUMN xp_points INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add total_co2_saved column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'total_co2_saved'
  ) THEN
    ALTER TABLE profiles ADD COLUMN total_co2_saved DECIMAL(10, 3) DEFAULT 0;
  END IF;
END $$;

-- Add trips_completed column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'trips_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN trips_completed INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add badges column if it doesn't exist (for storing unlocked badge IDs)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'badges'
  ) THEN
    ALTER TABLE profiles ADD COLUMN badges TEXT[] DEFAULT '{}';
  END IF;
END $$;

-- Create index on xp_points for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_xp_points ON profiles(xp_points DESC);

-- Create index on total_co2_saved for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_total_co2_saved ON profiles(total_co2_saved DESC);

-- Add comment to document the gamification system
COMMENT ON COLUMN profiles.xp_points IS 'Total experience points earned from completing trips';
COMMENT ON COLUMN profiles.total_co2_saved IS 'Total CO2 saved in kilograms across all completed trips';
COMMENT ON COLUMN profiles.trips_completed IS 'Total number of trips completed by the user';
COMMENT ON COLUMN profiles.badges IS 'Array of unlocked badge IDs';


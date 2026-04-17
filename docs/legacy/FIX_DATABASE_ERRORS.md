# 🔧 Fix Database Errors

## Issue 1: Missing Gamification Columns in `profiles` Table

**Error:**
```
ERROR: column profiles.total_co2_saved does not exist
```

**Solution:** Run this SQL in Supabase SQL Editor:

```sql
-- Add gamification columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(10, 3) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trips_completed INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_xp_points ON profiles(xp_points DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_co2_saved ON profiles(total_co2_saved DESC);

-- Add comments
COMMENT ON COLUMN profiles.xp_points IS 'Total experience points earned from completing trips';
COMMENT ON COLUMN profiles.total_co2_saved IS 'Total CO2 saved in kilograms across all completed trips';
COMMENT ON COLUMN profiles.trips_completed IS 'Total number of trips completed by the user';
COMMENT ON COLUMN profiles.badges IS 'Array of unlocked badge IDs';
```

---

## Issue 2: Foreign Key Relationship Error (Commuter Radar)

**Error:**
```
ERROR: Could not find a relationship between 'rides' and 'profiles' using the hint 'rider_id'
```

**Root Cause:** The Supabase query is trying to join `rides` and `profiles` tables, but the foreign key relationship may not be properly set up, or the query syntax is incorrect.

**Solution:** Fix the query in `app/(tabs)/index.tsx` to use a simpler approach without the nested join syntax.

---

## Quick Fix Script

Copy and paste this entire block into your Supabase SQL Editor:

```sql
-- ============================================
-- CLYZIO DATABASE FIX SCRIPT
-- Run this to fix all database errors
-- ============================================

-- 1. Add gamification columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(10, 3) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trips_completed INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}';

-- 2. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_xp_points ON profiles(xp_points DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_co2_saved ON profiles(total_co2_saved DESC);

-- 3. Ensure foreign key constraints exist
ALTER TABLE rides 
DROP CONSTRAINT IF EXISTS rides_driver_id_fkey,
DROP CONSTRAINT IF EXISTS rides_rider_id_fkey;

ALTER TABLE rides
ADD CONSTRAINT rides_driver_id_fkey 
FOREIGN KEY (driver_id) REFERENCES profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT rides_rider_id_fkey 
FOREIGN KEY (rider_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 4. Verify RLS policies allow profile updates
CREATE POLICY IF NOT EXISTS "Users can update own profile stats"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Success message
DO $$ 
BEGIN 
  RAISE NOTICE 'Database fix completed successfully!'; 
END $$;
```

---

## Verification

After running the SQL, verify the changes:

```sql
-- Check that columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('xp_points', 'total_co2_saved', 'trips_completed', 'badges');

-- Check foreign keys
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'rides';
```

Expected output should show:
- 4 new columns in profiles table
- Foreign key constraints for driver_id and rider_id

---

## After Running SQL

1. **Restart Expo Dev Server** (Ctrl+C and `npx expo start -c`)
2. **Test Complete Trip Button** - Should now work without errors
3. **Test Stats Screen** - Should display XP and CO2 correctly
4. **Check Commuter Radar** - Should fetch nearby users without errors

---

## If Errors Persist

### Error: "permission denied"
- Make sure you're logged in as a Supabase admin
- Check RLS policies on both `profiles` and `rides` tables

### Error: Foreign key still failing
- Verify that all existing rides have valid driver_id/rider_id values
- Clean up any orphaned records:
  ```sql
  -- Find orphaned rides
  SELECT * FROM rides 
  WHERE (driver_id IS NOT NULL AND driver_id NOT IN (SELECT id FROM profiles))
     OR (rider_id IS NOT NULL AND rider_id NOT IN (SELECT id FROM profiles));
  ```

---

**Status after fix:** ✅ All database errors should be resolved!


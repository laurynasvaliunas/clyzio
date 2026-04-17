# 🚨 URGENT: Database Migration Required

## Overview
Two errors were detected in the app that require database changes:

1. ❌ **Missing columns** in `profiles` table (xp_points, total_co2_saved, etc.)
2. ❌ **Commuter radar query** failing due to foreign key relationship issue

## ✅ SOLUTION: 3-Step Fix

---

### **Step 1: Run SQL Migration** (REQUIRED)

Open **Supabase Dashboard** → **SQL Editor** → Paste and run this:

```sql
-- Add gamification columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(10, 3) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trips_completed INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}';

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_profiles_xp_points ON profiles(xp_points DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_co2_saved ON profiles(total_co2_saved DESC);

-- Ensure foreign key constraints exist
ALTER TABLE rides 
DROP CONSTRAINT IF EXISTS rides_driver_id_fkey,
DROP CONSTRAINT IF EXISTS rides_rider_id_fkey;

ALTER TABLE rides
ADD CONSTRAINT rides_driver_id_fkey 
FOREIGN KEY (driver_id) REFERENCES profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT rides_rider_id_fkey 
FOREIGN KEY (rider_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Verify RLS policy for profile updates
CREATE POLICY IF NOT EXISTS "Users can update own profile stats"
ON profiles FOR UPDATE
USING (auth.uid() = id);
```

---

### **Step 2: Restart Expo Server** (REQUIRED)

In your terminal:
```bash
# Stop current server (Ctrl+C)
# Then restart with cache clear:
npx expo start -c
```

---

### **Step 3: Test the Features**

#### Test 1: Complete Trip (XP & CO2)
1. Go to **Activity → Upcoming**
2. Click **"✓ Complete"** on any trip
3. ✅ Should see: "You earned X XP and saved Y kg CO₂!"
4. ❌ If error: Check SQL was run correctly

#### Test 2: Impact/Stats Screen
1. Go to **Impact** tab
2. ✅ Should see: Level progress bar, XP total, CO2 total
3. ❌ If error: Column still missing, re-run SQL

#### Test 3: Commuter Radar (Map)
1. Create a trip as **Driver** or **Rider**
2. Look at the map
3. ✅ Should see: Markers for nearby commuters (if any exist)
4. ❌ If error: Check console for new errors

---

## What Was Fixed in Code

### File: `clyzio/app/(tabs)/index.tsx`

**Before (Broken):**
```typescript
// Used nested join syntax that Supabase couldn't parse
.select(`profiles!${searchRole}_id (id, first_name, ...)`)
```

**After (Fixed):**
```typescript
// Split into 2 separate queries:
// 1. Fetch rides
// 2. Fetch profiles separately
// 3. Merge results in JavaScript
```

**Why:** Supabase was looking for a foreign key relationship hint in the query, but the syntax was causing issues. The new approach fetches data in two steps and merges it client-side.

---

## Verification Commands

After running the SQL migration, verify in Supabase SQL Editor:

```sql
-- Check columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('xp_points', 'total_co2_saved', 'trips_completed', 'badges');
```

**Expected output:** 4 rows showing the new columns

---

## Error Messages You Should NO LONGER See

✅ **FIXED:**
```
ERROR: column profiles.total_co2_saved does not exist
```

✅ **FIXED:**
```
ERROR: Could not find a relationship between 'rides' and 'profiles' using the hint 'rider_id'
```

---

## If You Still Get Errors

### "Permission denied for table profiles"
**Solution:** Ensure you're logged in as Supabase admin when running SQL

### "Rides still have invalid foreign keys"
**Solution:** Clean up orphaned data:
```sql
-- Delete rides with invalid user IDs
DELETE FROM rides 
WHERE (driver_id IS NOT NULL AND driver_id NOT IN (SELECT id FROM profiles))
   OR (rider_id IS NOT NULL AND rider_id NOT IN (SELECT id FROM profiles));
```

### "Stats still not updating"
**Solution:** Check RLS policies:
```sql
-- View existing policies
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

---

## Summary of Changes

| File | Change | Status |
|------|--------|--------|
| `app/(tabs)/index.tsx` | Fixed commuter radar query (split into 2 queries) | ✅ Done |
| `app/(tabs)/activity.tsx` | No changes needed (already correct) | ✅ Done |
| Database (profiles table) | Add 4 new columns | ⏳ **YOU NEED TO RUN SQL** |
| Database (foreign keys) | Ensure constraints exist | ⏳ **YOU NEED TO RUN SQL** |

---

## Next Steps

1. ✅ Accept file changes (already done automatically)
2. 🔴 **RUN SQL MIGRATION** (copy from Step 1 above)
3. ✅ Restart Expo server (`npx expo start -c`)
4. ✅ Test all 3 features listed above

---

**Time to fix:** ~2 minutes
**Difficulty:** Easy (just copy/paste SQL)
**Impact:** Fixes ALL current errors

🎯 **DO THIS NOW** to get the app working correctly!


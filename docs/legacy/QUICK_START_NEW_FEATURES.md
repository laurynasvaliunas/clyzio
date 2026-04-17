# 🚀 Quick Start: New Features

## What's New?

1. **🎉 Trip Completion Modal** - Celebratory XP/CO2 feedback
2. **🗺️ Live Ride Matching** - See drivers/riders on map in real-time
3. **🤝 Request/Offer System** - Send ride requests with approval flow

---

## Setup (5 minutes)

### 1. Run Database Migrations

Open **Supabase Dashboard** → **SQL Editor** → Run these in order:

#### Migration 1: Gamification Columns
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(10, 3) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trips_completed INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_profiles_xp_points ON profiles(xp_points DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_total_co2_saved ON profiles(total_co2_saved DESC);
```

#### Migration 2: Ride Requests Table
```sql
-- Copy entire contents of: migrations/create_ride_requests_table.sql
```

#### Migration 3: Foreign Keys
```sql
ALTER TABLE rides 
DROP CONSTRAINT IF EXISTS rides_driver_id_fkey,
DROP CONSTRAINT IF EXISTS rides_rider_id_fkey;

ALTER TABLE rides
ADD CONSTRAINT rides_driver_id_fkey 
FOREIGN KEY (driver_id) REFERENCES profiles(id) ON DELETE CASCADE,
ADD CONSTRAINT rides_rider_id_fkey 
FOREIGN KEY (rider_id) REFERENCES profiles(id) ON DELETE CASCADE;
```

### 2. Restart Expo
```bash
npx expo start -c
```

---

## Try It Out!

### Feature 1: Trip Completion Modal

1. Go to **Activity** tab → **Upcoming**
2. Find any trip and click **"✓ Complete"**
3. 🎉 **Watch the magic!** 
   - Animated modal appears
   - See your XP earned (+150 XP)
   - See CO2 saved (2.4 kg)
   - Get level-up message if you crossed 1000 XP
4. Click **"Great!"**
5. Trip moves to History
6. Check **Impact** tab → See updated XP and level

### Feature 2: Ride Matching (as Rider)

1. Go to **Map** tab
2. Click **"Where to today?"** search bar
3. Enter origin and destination
4. Click **"Continue"**
5. Select **"I need a ride"** (rider mode)
6. Click **"Submit my trip"**
7. 🗺️ **Map shows cyan car icons** (drivers nearby)
8. **Tap a car marker**
9. Callout shows driver info
10. **Tap the callout**
11. Match Card opens with full details
12. Click **"🚗 Request Ride"**
13. ✅ Request sent!

### Feature 3: Ride Matching (as Driver)

1. Same as above, but select **"I am driving"** in step 5
2. 🗺️ **Map shows yellow user icons** (riders nearby)
3. Tap a rider → See their route
4. Click **"🙋 Offer Pickup"**
5. ✅ Offer sent!

---

## Visual Guide

### Trip Completion Modal
```
┌──────────────────────────────┐
│         🏆 or ⚡             │
│    Trip Completed!           │
│  You reached Level 5!        │
├──────────────────────────────┤
│  +180      │    2.4          │
│  XP Earned │    kg CO₂ Saved │
├──────────────────────────────┤
│  → 8.5 km traveled          │
├──────────────────────────────┤
│     [  Great!  ]            │
└──────────────────────────────┘
```

### Map View (as Rider)
```
       Map
    🚗 ← Driver (Cyan car)
   👤 ← You
    🚗 ← Driver (Cyan car)
    🚗 ← Driver (Cyan car)
```

### Match Card
```
┌──────────────────────────────┐
│ 👤 John Smith           X   │
│    📍 Engineering           │
│    🚗 Available Driver      │
├──────────────────────────────┤
│ Route                       │
│ 🟢 Office Park             │
│  │                          │
│ 🔵 Downtown Station        │
├──────────────────────────────┤
│ [  🚗 Request Ride  ]      │
│ [   View Profile    ]      │
└──────────────────────────────┘
```

---

## Troubleshooting

### "Column does not exist" error
**Solution:** Run database migrations (Step 1 above)

### No drivers/riders showing on map
**Possible causes:**
- No other users have scheduled trips
- Create a test trip with a different account
- Check console for API errors

### Request button does nothing
**Solution:** 
- Verify `ride_requests` table exists
- Check RLS policies are enabled
- Look for errors in terminal

### Modal doesn't appear after completing trip
**Solution:**
- Clear Expo cache: `npx expo start -c`
- Check `TripCompletionModal` component imported correctly

---

## Key Components

### Files Modified:
- ✅ `components/TripCompletionModal.tsx` - **NEW**
- ✅ `app/(tabs)/activity.tsx` - Added modal integration
- ✅ `app/(tabs)/index.tsx` - Enhanced map markers and match card
- ✅ `migrations/create_ride_requests_table.sql` - **NEW**

### Database Tables:
- ✅ `profiles` - Added xp_points, total_co2_saved, trips_completed
- ✅ `ride_requests` - **NEW** - Manages match requests
- ✅ `rides` - Added foreign key constraints

---

## What's Next?

Future features coming soon:
- 🔔 Push notifications for ride requests
- 💬 In-app chat between matched users
- ⭐ Rating system for completed trips
- 🏆 More badges and achievements
- 📊 Enhanced leaderboards
- 📅 Recurring trip schedules

---

## Need Help?

- **Documentation:** See `RIDE_MATCHING_IMPLEMENTATION.md`
- **Database Issues:** See `FIX_DATABASE_ERRORS.md`
- **Gamification:** See `GAMIFICATION_SYSTEM.md`

---

**🎉 You're all set! Enjoy the new features!**


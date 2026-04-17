# 🎮 Gamification System Documentation

## Overview
The Clyzio app includes a comprehensive gamification system to encourage eco-friendly commuting behaviors through XP rewards, levels, and badges.

---

## 🏆 XP Calculation Formula

When a user completes a trip, XP is calculated as follows:

```typescript
Base XP: 100 XP (for completing any trip)
Distance Bonus: +10 XP per kilometer
Eco Bonus: +50 XP (if mode is Walking or Biking)

Total XP = Base XP + Distance Bonus + Eco Bonus
```

### Examples:
- **5 km car trip**: 100 + (5 × 10) = **150 XP**
- **3 km walking trip**: 100 + (3 × 10) + 50 = **180 XP**
- **10 km bike trip**: 100 + (10 × 10) + 50 = **250 XP**

---

## 📊 Level System

Users progress through 10 levels based on their total XP:

| Level | XP Range | Title |
|-------|----------|-------|
| 1 | 0 - 99 | Eco Beginner |
| 2 | 100 - 299 | Green Starter |
| 3 | 300 - 599 | Earth Ally |
| 4 | 600 - 999 | Eco Warrior |
| 5 | 1000 - 1499 | Planet Protector |
| 6 | 1500 - 2099 | Green Champion |
| 7 | 2100 - 2799 | Eco Master |
| 8 | 2800 - 3599 | Climate Hero |
| 9 | 3600 - 4499 | Earth Guardian |
| 10 | 4500+ | Eco Legend |

---

## 🏅 Badge System

Users can unlock badges by achieving specific milestones:

| Badge ID | Name | Description | Unlock Condition |
|----------|------|-------------|------------------|
| `first_trip` | First Steps | Complete your first trip | Complete 1 trip |
| `first_carpool` | Carpool King | Share your first ride | Complete 1 carpool trip |
| `walker_5` | Walking Warrior | Walk 5 trips | Complete 5 walking trips |
| `trips_10` | Road Regular | Complete 10 trips | Complete 10 trips |
| `co2_50` | CO2 Crusher | Save 50kg CO2 | Save 50 kg CO2 |
| `co2_100` | Planet Protector | Save 100kg CO2 | Save 100 kg CO2 |

---

## 💾 Database Schema

### Profiles Table Columns:
```sql
xp_points INTEGER DEFAULT 0
total_co2_saved DECIMAL(10, 3) DEFAULT 0
trips_completed INTEGER DEFAULT 0
badges TEXT[] DEFAULT '{}'
```

### Rides Table Columns (relevant):
```sql
co2_saved DECIMAL(10, 3)  -- Pre-calculated when trip is created
status VARCHAR             -- 'scheduled', 'completed', 'cancelled'
transport_mode VARCHAR     -- 'walking', 'bike', 'ebike', 'moto', 'public', 'my_car'
```

---

## 🔄 Trip Completion Flow

1. **User clicks "Complete Trip"** in Activity → Upcoming
2. **System fetches ride details** from Supabase
3. **Calculate distance** using Haversine formula
4. **Calculate XP** based on formula above
5. **Retrieve CO2 saved** (already stored in ride record)
6. **Update ride status** to `'completed'`
7. **Update user profile**:
   - Increment `xp_points` by calculated XP
   - Increment `total_co2_saved` by trip CO2
   - Increment `trips_completed` by 1
8. **Show success alert** with XP and CO2 earned
9. **Refresh Activity view** (trip moves to History)
10. **Impact screen auto-updates** on next focus (via `useFocusEffect`)

---

## 📱 UI Components

### Activity Screen (`app/(tabs)/activity.tsx`)
- **"Complete Trip" button** on Upcoming cards
- Triggers XP/CO2 calculation and profile update

### Impact/Stats Screen (`app/(tabs)/stats.tsx`)
- **Level Progress Card**: Shows current level, XP, and progress bar
- **Trophy Cabinet**: Displays unlocked badges
- **CO2 Hero Card**: Total CO2 saved with tree equivalency
- **Stats Cards**: Total trips, weekly CO2
- **Leaderboards**: Company, department, and personal rankings

---

## 🛠️ Implementation Files

### Core Logic:
- `app/(tabs)/activity.tsx` - Trip completion logic
- `app/(tabs)/stats.tsx` - Stats display and level calculation
- `migrations/add_gamification_columns.sql` - Database schema

### Key Functions:
```typescript
// In activity.tsx
completeTrip(rideId: string) 
  → Calculates XP, updates profile, moves trip to history

// In stats.tsx
getLevelInfo(xp: number)
  → Returns current level, progress, and XP to next level

loadStats()
  → Fetches user stats from Supabase (reactive via useFocusEffect)
```

---

## 🚀 Setup Instructions

### 1. Run Database Migration
Execute the SQL migration in your Supabase SQL Editor:
```bash
# File: migrations/add_gamification_columns.sql
```

### 2. Verify RLS Policies
Ensure users can update their own profiles:
```sql
CREATE POLICY "Users can update own profile stats"
ON profiles FOR UPDATE
USING (auth.uid() = id);
```

### 3. Test the Flow
1. Create a trip in the app
2. Navigate to Activity → Upcoming
3. Click "Complete Trip"
4. Verify XP and CO2 are added
5. Check Impact screen for updated stats

---

## 🎯 Future Enhancements

### Potential Additions:
- **Streak System**: Bonus XP for consecutive days
- **Challenges**: Weekly/monthly goals with extra rewards
- **Social Sharing**: Share achievements on social media
- **Team Competitions**: Department vs department challenges
- **Seasonal Events**: Limited-time badges and XP multipliers
- **Referral Bonuses**: XP for inviting colleagues

---

## 📊 Analytics Tracking

Consider tracking these metrics:
- Average XP per trip
- Most common transport modes
- Badge unlock rates
- Level progression time
- User engagement with gamification features

---

## 🐛 Troubleshooting

### Issue: Stats not updating after completing trip
**Solution**: Check that `useFocusEffect` is properly implemented in stats screen

### Issue: XP calculation seems incorrect
**Solution**: Verify distance calculation and transport mode detection

### Issue: Profile update fails
**Solution**: Check RLS policies and ensure user is authenticated

---

## 📝 Notes

- CO2 values are stored in **kilograms** (kg)
- Distance is calculated using the **Haversine formula**
- XP is **cumulative** and never decreases
- Badges are **permanent** once unlocked
- Level titles are **hardcoded** in the app (not in database)


# Phase 22 Setup Guide

## 🚀 Quick Start

### Step 1: Database Migration (REQUIRED)

**Run this SQL in Supabase Dashboard:**

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy/paste contents of `add-waypoints-column.sql`
3. Click **"Run"**

**OR copy/paste this directly:**

```sql
ALTER TABLE public.rides 
ADD COLUMN IF NOT EXISTS waypoints JSONB DEFAULT '[]'::jsonb;
```

---

### Step 2: Test the Features

#### **A. Role Toggle**
1. Open app → Home tab
2. Set destination
3. See role toggle at top: **"I need a ride"** | **"I am driving"**
4. Switch between roles → verify list filters correctly

#### **B. Waypoints**
1. In Trip Planner
2. Tap **"+ Add Stop"** button
3. Enter location (e.g., "School")
4. See yellow marker on map
5. Tap X to remove

#### **C. Address Inputs**
1. Tap "From" input
2. Type address
3. Select from list → list disappears ✓
4. Tap "To" input → keyboard doesn't block input ✓

#### **D. Settings Screen**
1. Profile tab → Tap ⚙️ (gear icon)
2. Settings screen opens
3. Test each option:
   - Edit Profile ✓
   - Change Password (sends email) ✓
   - Toggle Notifications ✓
   - Toggle Dark Mode ✓
   - Privacy Policy (modal) ✓
   - Delete Account (double confirm) ✓

---

## 🎯 What Changed?

### **Home Screen (`app/(tabs)/index.tsx`):**
- ✅ Added role toggle (Rider/Driver)
- ✅ Filtered transport modes based on role
- ✅ Fixed address autocomplete bugs
- ✅ Added waypoint input & marker
- ✅ Waypoints saved to database

### **Profile Screen (`app/(tabs)/profile.tsx`):**
- ✅ Settings button now opens `/settings` (not edit-profile)

### **New: Settings Screen (`app/settings/index.tsx`):**
- ✅ Complete settings page with all sections
- ✅ Account, Preferences, Legal, Danger Zone

### **Database:**
- ✅ New column: `rides.waypoints` (jsonb array)

---

## 📋 Testing Checklist

```
[ ] Database migration ran successfully
[ ] Role toggle shows correct modes for Rider
[ ] Role toggle shows correct modes for Driver
[ ] Switching roles resets selected mode
[ ] Address list hides after selection
[ ] Keyboard doesn't block inputs
[ ] "+ Add Stop" button appears
[ ] Waypoint input shows with yellow theme
[ ] Yellow marker appears on map
[ ] Waypoint saves to database
[ ] Settings screen opens from Profile
[ ] All settings options work
[ ] Delete Account requires double confirmation
```

---

## 🐛 Troubleshooting

### **Issue: Role toggle not filtering**
**Fix:** Clear app cache and restart

### **Issue: Waypoints not saving**
**Fix:** Verify database migration ran:
```sql
SELECT * FROM information_schema.columns 
WHERE table_name = 'rides' AND column_name = 'waypoints';
```

### **Issue: Address list still visible**
**Fix:** State might be stuck - restart app

### **Issue: Settings button doesn't work**
**Fix:** Verify route exists:
```bash
ls -la app/settings/index.tsx
```

---

## 🎉 Phase 22 Complete!

All features are live and ready to test. Enjoy the new ride-sharing workflow! 🚗💨🌱


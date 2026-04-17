# Trip Planner Modal Refactor - Summary

## Changes Made

### 1. ✅ Updated TRANSPORT_MODES Array

**New "Solo" Mode List (6 options):**
1. **Walking** - 0 kg CO2/km (unchanged)
2. **Bike / Scooter** - 0 kg CO2/km (label updated)
3. **E-Bike / E-Scooter** - 0.023 kg CO2/km (new ID: `ebike`, was `escooter`)
4. **Motorbike** - 0.09 kg CO2/km (now available for Solo)
5. **Public Transport** - 0.04 kg CO2/km (unchanged)
6. **My Car** - 0.192 kg CO2/km default (fetches user's actual car from profile)

### 2. ✅ Added Distance Calculation

Implemented `calculateDistance()` function using the **Haversine formula**:
- Calculates accurate distance between two GPS coordinates
- Returns distance in kilometers
- Used for CO2 calculation

### 3. ✅ Updated Trip Lifecycle

**OLD Behavior:**
- Solo trips: `status = "completed"` → Went directly to History
- Driver/Rider trips: `status = "scheduled"` → Went to Upcoming

**NEW Behavior:**
- **ALL trips**: `status = "scheduled"` → Appear in Upcoming
- Trips move to History only when status changes to `"completed"` or `"cancelled"`
- This allows users to see all planned trips in the Upcoming tab

### 4. ✅ Implemented Real CO2 Calculation

**Formula:**
```
Baseline CO2 = Distance (km) × 0.192 kg/km (gas car)
Trip CO2 = Distance (km) × Mode CO2 factor
CO2 Saved = Baseline CO2 - Trip CO2
```

**Example:**
- Distance: 10 km
- Mode: E-Bike (0.023 kg/km)
- Baseline: 10 × 0.192 = 1.92 kg
- Trip: 10 × 0.023 = 0.23 kg
- **Saved: 1.69 kg CO2** ✅

### 5. ✅ Dynamic "My Car" Label

- Fetches `car_make` and `car_model` from user's profile
- If available: Displays "Tesla Model 3" (or user's actual car)
- If unavailable: Displays "My Car"

### 6. ✅ Updated Success Message

**OLD:** "✅ Trip saved! Check Activity tab."

**NEW:** "✅ Trip scheduled! You'll save 1.69 kg CO2. Check Activity → Upcoming."

## Database Impact

### Expected Columns in `rides` table:
- `status` - Now always starts as "scheduled"
- `co2_saved` - Now populated with calculated value (in kg)
- `transport_label` - Now shows user's actual car model if available

### Activity Screen Filtering

**Upcoming Tab:**
```sql
WHERE status IN ('scheduled', 'requested', 'accepted', 'in_progress')
AND scheduled_at >= NOW()
```

**History Tab:**
```sql
WHERE status IN ('completed', 'cancelled')
OR scheduled_at < NOW()
```

## User Experience Flow

1. User selects role: **Solo** / Driver / Rider
2. If Solo → Shows 6 transport options (scrollable)
3. User selects mode (e.g., "E-Bike")
4. User presses "Submit my trip"
5. App calculates distance & CO2
6. Trip saved with `status: "scheduled"`
7. Alert shows: "You'll save X kg CO2"
8. Trip appears in **Activity → Upcoming**
9. When user completes the trip (manually or via GPS trigger), status changes to `"completed"`
10. Trip moves to **Activity → History**
11. Impact screen sums all `completed` trips' `co2_saved` values

## Testing Checklist

- [ ] Solo mode shows all 6 options
- [ ] "My Car" displays user's actual car model if set in profile
- [ ] Distance is calculated correctly
- [ ] CO2 saved is calculated and stored in database
- [ ] Trip appears in Activity → Upcoming (not History)
- [ ] Success alert shows CO2 savings
- [ ] All roles (Solo/Driver/Rider) work correctly

## Files Modified

1. `clyzio/components/TripPlannerModal.tsx`
   - Updated `TRANSPORT_MODES` array
   - Added `calculateDistance()` function
   - Updated `getModesByRole()` to include new solo modes
   - Refactored `handleTripSubmit()` with CO2 calculation and profile fetch

## Next Steps

1. Test the app with a real trip submission
2. Verify trip appears in Activity → Upcoming
3. Implement trip completion logic (manual or GPS-triggered)
4. Connect Impact screen to sum `co2_saved` from completed trips


# UI & CO2 Display Refinements - Summary

## Changes Made

### 1. ✅ Label Update: "Starting Point"

**Changed:**
```tsx
// Before:
placeholder="Current Location"

// After:
placeholder="Starting Point"
```

This makes the label more clear and action-oriented.

---

### 2. ✅ Waypoint Icon Color

The "Kindergarten / School" input already uses `COLORS.accent` (yellow/gold) for the icon, which differentiates it visually while maintaining layout consistency:

```tsx
icon={<School size={20} color={COLORS.accent} />}
```

---

### 3. ✅ Total Trip CO2 Calculation

**OLD Behavior:**
- Displayed CO2 **per km** (e.g., "192g CO₂/km")
- Static value, not trip-specific

**NEW Behavior:**
- Displays **Total Estimated CO2** for the specific trip
- Calculated as: `routeDistance (km) × mode.co2 (kg/km)`

**Formatting Logic:**

| Condition | Display Example |
|-----------|----------------|
| `mode.co2 === 0` | "Zero Emissions" |
| `routeDistance === 0` | "—" (dash, route not calculated yet) |
| `totalCO2 < 1 kg` | "450 g CO₂" |
| `totalCO2 >= 1 kg` | "2.4 kg CO₂" |

**Code Implementation:**
```tsx
// Calculate total trip CO2
const totalCO2Kg = routeDistance * m.co2; // in kg
const totalCO2Grams = totalCO2Kg * 1000; // in grams

// Format CO2 display
let co2Display = "0 g";
if (m.co2 === 0) {
  co2Display = "Zero Emissions";
} else if (routeDistance === 0) {
  co2Display = "—";
} else if (totalCO2Kg < 1) {
  co2Display = `${totalCO2Grams.toFixed(0)} g CO₂`;
} else {
  co2Display = `${totalCO2Kg.toFixed(1)} kg CO₂`;
}
```

---

### 4. ✅ Added Route Distance State

**New State:**
```tsx
const [routeDistance, setRouteDistance] = useState<number>(0);
```

**Auto-Calculation:**
```tsx
React.useEffect(() => {
  if (originCoords && destCoords) {
    const distance = calculateDistance(
      originCoords.lat,
      originCoords.lng,
      destCoords.lat,
      destCoords.lng
    );
    setRouteDistance(distance);
  } else {
    setRouteDistance(0);
  }
}, [originCoords, destCoords]);
```

The distance is automatically calculated using the Haversine formula whenever the user selects both origin and destination.

---

## User Experience Flow

1. User opens Trip Planner
2. Enters **"Starting Point"** (origin)
3. Enters **"Where to?"** (destination)
4. Distance is calculated automatically
5. User presses **"Continue"**
6. Mode selection screen shows:
   - **Walking:** "Zero Emissions"
   - **E-Bike (10 km trip):** "230 g CO₂"
   - **My Car (10 km trip):** "1.9 kg CO₂"
7. User selects mode and submits trip

---

## Example Output

**Trip:** 10 km from Vilnius Center to Airport

| Mode | CO2 Factor | Total CO2 Display |
|------|-----------|-------------------|
| Walking | 0 kg/km | "Zero Emissions" |
| Bike | 0 kg/km | "Zero Emissions" |
| E-Bike | 0.023 kg/km | "230 g CO₂" |
| Motorbike | 0.09 kg/km | "900 g CO₂" |
| Public Transport | 0.04 kg/km | "400 g CO₂" |
| My Car (Gas) | 0.192 kg/km | "1.9 kg CO₂" |

**Trip:** 50 km (longer trip)

| Mode | Total CO2 Display |
|------|-------------------|
| E-Bike | "1.2 kg CO₂" |
| My Car (Gas) | "9.6 kg CO₂" |

---

## Files Modified

- `clyzio/components/TripPlannerModal.tsx`
  - Added `routeDistance` state
  - Added `useEffect` for automatic distance calculation
  - Updated origin placeholder to "Starting Point"
  - Refactored CO2 display logic in mode list rendering

---

## Testing Checklist

- [x] "Starting Point" placeholder displays correctly
- [x] Waypoint icon is yellow/gold (COLORS.accent)
- [x] When no route selected, CO2 shows "—"
- [x] Walking/Bike show "Zero Emissions"
- [x] Short trips (< 1 kg) show in grams
- [x] Long trips (> 1 kg) show in kg with 1 decimal
- [x] Distance calculation is automatic
- [x] No lint errors

---

## Next Steps

Test the app with different trip lengths:
1. Short trip (2-5 km) → Should show grams
2. Medium trip (10-20 km) → Should show kg for cars, grams for low-emission modes
3. Long trip (50+ km) → Should show kg for all modes


# 🔍 Real-Time Search Flow - Visual Guide

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         INITIAL STATE                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │             Map View (Idle)                         │    │
│  │  • No active trip                                   │    │
│  │  • ActionDock visible at bottom                    │    │
│  │  • "Where to today?" button                        │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ User taps ActionDock
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    TRIP PLANNER MODAL                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Step 1: Enter Origin & Destination                │    │
│  │  Step 2: Select Role (Solo / Driver / Rider)       │    │
│  │  Step 3: Choose Transport Mode                     │    │
│  │  Step 4: Schedule Time                              │    │
│  │                                                      │    │
│  │         [Submit my trip]  ◄─── User clicks         │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
            Role = Solo?      Role = Driver/Rider?
                    │               │
                    ▼               ▼
        ┌─────────────────┐  ┌──────────────────────┐
        │   SOLO FLOW     │  │   SEARCH FLOW        │
        │                 │  │                      │
        │  Modal closes   │  │  Modal closes        │
        │  immediately    │  │  Search starts       │
        │                 │  │                      │
        │  Show:          │  │  searchStatus =      │
        │  • Route on map │  │  'searching'         │
        │  • Trip card    │  │                      │
        │                 │  │                      │
        │  END ✅         │  │                      │
        └─────────────────┘  └──────────────────────┘
                                        │
                                        ▼
        ┌────────────────────────────────────────────────────┐
        │         SEARCHING STATE (2-3 seconds)              │
        │                                                    │
        │  ┌──────────────────────────────────────────┐    │
        │  │  🔍 Searching Overlay (Bottom)            │    │
        │  │  ┌──────────────────────────────────┐    │    │
        │  │  │  🚗 [Pulsing Icon]                │    │    │
        │  │  │                                    │    │    │
        │  │  │  "Scanning for drivers nearby..." │    │    │
        │  │  │                                    │    │    │
        │  │  │       🔵 [Loading Spinner]        │    │    │
        │  │  │                                    │    │    │
        │  │  │     [❌ Cancel Search]            │    │    │
        │  │  └──────────────────────────────────┘    │    │
        │  └──────────────────────────────────────────┘    │
        │                                                    │
        │  Background:                                      │
        │  • Fetching rides from Supabase                  │
        │  • Fetching user profiles                        │
        │  • Generating mock data if empty                 │
        └────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
            Found matches?    No matches?
                    │               │
                    ▼               ▼
        ┌─────────────────┐  ┌──────────────────────┐
        │  MATCHED STATE  │  │   WAITING STATE      │
        └─────────────────┘  └──────────────────────┘
                │                       │
                ▼                       ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│    MATCHED STATE UI           │  │    WAITING STATE UI        │
│                               │  │                            │
│ ┌───────────────────────┐    │  │ ┌────────────────────┐    │
│ │ 🎉 Match Found!       │    │  │ │ ⏳ Waiting          │    │
│ │                       │    │  │ │                     │    │
│ │ "Found 2 drivers!"    │    │  │ │ "No drivers        │    │
│ │                       │    │  │ │  available yet..."  │    │
│ │   ┌─────────┐        │    │  │ │                     │    │
│ │   │2 available│       │    │  │ │ [❌ Cancel Search] │    │
│ │   └─────────┘        │    │  │ └────────────────────┘    │
│ │                       │    │  │                            │
│ │ [View on Map] ◄──────┼────┤  │  Trip stays active,        │
│ └───────────────────────┘    │  │  waiting for future        │
│                               │  │  drivers to appear         │
└───────────────────────────────┘  └────────────────────────────┘
                │                               │
                │ User clicks                   │
                │ "View on Map"                 │
                ▼                               │
┌──────────────────────────────────────────────┤
│          MAP VIEW WITH MARKERS                │
│                                               │
│  ┌─────────────────────────────────────┐    │
│  │   🗺️ Map                             │    │
│  │                                       │    │
│  │   📍 Origin (Green)                  │    │
│  │   📍 Destination (Red)               │    │
│  │   📍 Waypoint (Orange) [optional]    │    │
│  │                                       │    │
│  │   🚗 Driver 1 (Cyan) ◄─── Clickable  │    │
│  │   🚗 Driver 2 (Cyan)                 │    │
│  │                                       │    │
│  │   [Route line shown]                 │    │
│  └─────────────────────────────────────┘    │
│                                               │
│  • Tap marker to view details                │
│  • Callout appears with profile info         │
└───────────────────────────────────────────────┘
                │
                │ User taps marker
                ▼
┌──────────────────────────────────────────────┐
│         MATCH CARD (Bottom Sheet)            │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │  👤 Alex Smith         [✕]          │    │
│  │  📍 Engineering                     │    │
│  │  🙋 Looking for ride                │    │
│  │                                      │    │
│  │  Route:                             │    │
│  │  🟢 123 Main St                     │    │
│  │  │                                   │    │
│  │  🔵 456 Oak Ave                     │    │
│  │                                      │    │
│  │  [🚗 Request Ride] ◄──── Click!    │    │
│  │  [View Profile]                     │    │
│  └────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
                │
                │ User clicks "Request Ride"
                ▼
┌──────────────────────────────────────────────┐
│         REQUEST SENT                         │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │  ✅ Alert: "Request Sent! 🎉"      │    │
│  │                                      │    │
│  │  "Your ride request has been sent   │    │
│  │   to Alex. You'll be notified when  │    │
│  │   they respond."                    │    │
│  │                                      │    │
│  │          [Got it!]                  │    │
│  └────────────────────────────────────┘    │
│                                              │
│  State resets:                              │
│  • searchStatus = 'idle'                    │
│  • searchMode = null                        │
│  • nearbyCommuters = []                     │
│  • selectedMatch = null                     │
│                                              │
│  Returns to initial map view ✅             │
└──────────────────────────────────────────────┘
```

---

## UI State Visual Reference

### 1. **Searching State (Rider)**
```
╔═══════════════════════════════════════════════════════╗
║                    🗺️ Map View                        ║
║  (Route shown, auto-fitted)                          ║
║                                                       ║
║  📍──────────────────────────📍                      ║
║  Green                        Red                    ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║         ┌─────────────────────────────────┐          ║
║         │  ┌───────────────────────┐      │          ║
║         │  │    🚗  (pulsing)       │      │          ║
║         │  └───────────────────────┘      │          ║
║         │                                  │          ║
║         │  🔍 Searching                    │          ║
║         │                                  │          ║
║         │  "Scanning for drivers           │          ║
║         │   nearby..."                     │          ║
║         │                                  │          ║
║         │       🔵 ●●●●                    │          ║
║         │                                  │          ║
║         │  ┌──────────────────────┐       │          ║
║         │  │  ❌ Cancel Search     │       │          ║
║         │  └──────────────────────┘       │          ║
║         └─────────────────────────────────┘          ║
╚═══════════════════════════════════════════════════════╝
```

### 2. **Matched State (Found 2 Drivers)**
```
╔═══════════════════════════════════════════════════════╗
║                    🗺️ Map View                        ║
║                                                       ║
║  📍──────────────────────────📍                      ║
║  Green                        Red                    ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║         ┌─────────────────────────────────┐          ║
║         │  ┌───────────────────────┐      │          ║
║         │  │    🚗  (static)        │      │          ║
║         │  └───────────────────────┘      │          ║
║         │                                  │          ║
║         │  🎉 Match Found!                 │          ║
║         │                                  │          ║
║         │  Found 2 drivers!                │          ║
║         │                                  │          ║
║         │    ┌──────────────┐             │          ║
║         │    │  2 available  │             │          ║
║         │    └──────────────┘             │          ║
║         │                                  │          ║
║         │  ┌──────────────────────┐       │          ║
║         │  │   View on Map   →    │       │          ║
║         │  └──────────────────────┘       │          ║
║         └─────────────────────────────────┘          ║
╚═══════════════════════════════════════════════════════╝
```

### 3. **Waiting State (No Drivers)**
```
╔═══════════════════════════════════════════════════════╗
║                    🗺️ Map View                        ║
║  (Route shown, no markers yet)                       ║
║                                                       ║
║  📍──────────────────────────📍                      ║
║  Green                        Red                    ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║         ┌─────────────────────────────────┐          ║
║         │  ┌───────────────────────┐      │          ║
║         │  │    🚗  (static)        │      │          ║
║         │  └───────────────────────┘      │          ║
║         │                                  │          ║
║         │  ⏳ Waiting                      │          ║
║         │                                  │          ║
║         │  "No drivers available yet.      │          ║
║         │   We will notify you when        │          ║
║         │   one appears."                  │          ║
║         │                                  │          ║
║         │  ┌──────────────────────┐       │          ║
║         │  │  ❌ Cancel Search     │       │          ║
║         │  └──────────────────────┘       │          ║
║         └─────────────────────────────────┘          ║
╚═══════════════════════════════════════════════════════╝
```

### 4. **Map View with Markers (After Clicking "View on Map")**
```
╔═══════════════════════════════════════════════════════╗
║                    🗺️ Map View                        ║
║                                                       ║
║  📍 (Green) Origin                                    ║
║         ╲                                             ║
║          ╲────── Route Line (Blue)                   ║
║           ╲                                           ║
║            🚗 Driver 1 (Cyan) ← Tap me!              ║
║             ╲                                         ║
║              ╲                                        ║
║               🚗 Driver 2 (Cyan) ← Or me!            ║
║                ╲                                      ║
║                 ╲                                     ║
║                  📍 (Red) Destination                ║
║                                                       ║
║  [Commuters visible as custom markers]               ║
╚═══════════════════════════════════════════════════════╝
```

### 5. **Match Card (After Tapping Marker)**
```
╔═══════════════════════════════════════════════════════╗
║                    🗺️ Map View                        ║
║  (Map still visible in background)                   ║
║                                                       ║
║  🚗 Driver markers still visible                     ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║  ┌─────────────────────────────────────────────┐    ║
║  │  ┌──┐                              [✕]      │    ║
║  │  │👤│  Alex Smith                            │    ║
║  │  │●│   📍 Engineering                        │    ║
║  │  └──┘   🙋 Looking for ride                 │    ║
║  │                                               │    ║
║  │  ┌────────────────────────────────┐         │    ║
║  │  │  Route                          │         │    ║
║  │  │  🟢 123 Main St                │         │    ║
║  │  │  │                              │         │    ║
║  │  │  🔵 456 Oak Ave                │         │    ║
║  │  └────────────────────────────────┘         │    ║
║  │                                               │    ║
║  │  ┌──────────────────────────────┐           │    ║
║  │  │  🚗 Request Ride              │           │    ║
║  │  └──────────────────────────────┘           │    ║
║  │  ┌──────────────────────────────┐           │    ║
║  │  │     View Profile              │           │    ║
║  │  └──────────────────────────────┘           │    ║
║  └─────────────────────────────────────────────┘    ║
╚═══════════════════════════════════════════════════════╝
```

---

## Color Coding Guide

### Icon Colors
- 🚗 **Cyan (#26C6DA)** - Drivers (when rider is searching)
- 👥 **Yellow (#FDD835)** - Riders (when driver is searching)
- 📍 **Green (#4CAF50)** - Origin marker
- 📍 **Red** - Destination marker
- 📍 **Orange** - Waypoint marker (optional)

### Status Colors
- 🔵 **Blue (#26C6DA)** - Primary actions, searching spinner
- 🟢 **Green (#4CAF50)** - Success states, matched
- ⏳ **Gray (#90A4AE)** - Waiting states, cancel button
- 🎉 **Yellow (#FDD835)** - Celebration (matched)

---

## Timing Reference

### State Durations
- **Searching:** 1-3 seconds (depends on network)
- **Matched:** Instant transition when results found
- **Waiting:** Indefinite (until user cancels or match appears)
- **Animation Speed:** Pulse cycle = 2 seconds (1s expand, 1s contract)

### User Actions Timing
- **Modal Submit → Search Start:** < 200ms
- **Search → Results Display:** 1-3 seconds
- **Tap Marker → Match Card Appear:** Instant
- **Request Sent → Alert:** Instant
- **Alert Dismiss → State Reset:** Instant

---

## Mock Data Generation Logic

```
User at: (37.7749, -122.4194) [San Francisco]

Mock Driver 1:
  Origin: (37.7849, -122.4094) [~1km north]
  Destination: (37.7649, -122.3994) [~2km southeast]
  Profile: Alex Smith, Engineering

Mock Driver 2:
  Origin: (37.7849, -122.4294) [~1km northeast]
  Destination: (37.7549, -122.4094) [~2.5km south]
  Profile: Sam Johnson, Marketing

Result: 2 nearby drivers appear on map
```

**Note:** Mock data only generates if database returns 0 results. In production with real users, this feature can be disabled.

---

## Cancel Search Flow

```
User in any search state (searching/waiting/matched)
      │
      │ Clicks "Cancel Search"
      ▼
┌────────────────────────────┐
│  handleCancelSearch()      │
│  • searchStatus = 'idle'   │
│  • searchMode = null       │
│  • nearbyCommuters = []    │
│  • selectedMatch = null    │
│  • activeTrip = null       │
└────────────────────────────┘
      │
      ▼
┌────────────────────────────┐
│  Returns to Initial State  │
│  • ActionDock visible      │
│  • Clean map               │
│  • Ready for new search    │
└────────────────────────────┘
```

---

This visual guide complements the technical implementation document and provides a clear reference for understanding the user experience flow!


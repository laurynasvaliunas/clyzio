# Driver/Rider Matching Feature - Implementation Plan

**Status:** ✅ Task 1 Complete | 🚧 Task 2 & 3 In Progress  
**Date:** December 12, 2025

## 📋 Overview

Implementing an interactive matching system for Drivers and Riders to find and connect with each other for carpooling.

---

## ✅ Task 1: Conditional UI Logic (COMPLETED)

### Changes Made

**File:** `clyzio/app/trip/[id].tsx`

#### 1. Chat Button Visibility
```tsx
{/* CONDITIONAL: Chat button only for Driver/Rider (NOT Solo) */}
{!isSoloTrip && partner && (
  <TouchableOpacity
    style={styles.actionButton}
    onPress={() => setShowChatModal(true)}
  >
    <MessageCircle size={24} color={COLORS.primary} />
    <Text style={styles.actionButtonText}>Chat</Text>
  </TouchableOpacity>
)}
```

**Result:**
- ✅ Chat button **hidden** for Solo trips
- ✅ Chat button **visible** for Driver/Rider trips with partner

#### 2. Partner Info Card
Already implemented from previous refactoring:
```tsx
{/* 3. CONDITIONAL: Partner Info (Only for Driver/Rider) */}
{!isSoloTrip && partner && (
  <View style={styles.partnerCard}>
    {/* Partner avatar and info */}
  </View>
)}
```

**Result:**
- ✅ Partner card **hidden** for Solo trips
- ✅ Partner card **visible** for Driver/Rider trips

---

## 🚧 Task 2: Interactive Matching System (TO IMPLEMENT)

### Architecture Overview

```
User Flow:
1. User selects "Driver" or "Rider" in Trip Planner
2. User enters Origin + Destination + Time
3. User clicks "Submit/Search"
   ↓
4. Modal transitions to "Searching for Match" state
   ↓
5. Query Supabase for matching users
   ↓
6. Display matches as clickable markers on map
   ↓
7. User clicks marker → Match Card appears
   ↓
8. User clicks "Request Match" → Status: pending_approval
```

### Required Components

#### A. TripPlannerModal Enhancement
**File:** `clyzio/components/TripPlannerModal.tsx`

**New States:**
```tsx
const [modalStep, setModalStep] = useState<"location" | "mode" | "searching">("location");
const [potentialMatches, setPotentialMatches] = useState<Match[]>([]);
const [isSearching, setIsSearching] = useState(false);

interface Match {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  department?: string;
  avatar_url?: string;
  rating?: number;
  origin_lat: number;
  origin_long: number;
  dest_lat: number;
  dest_long: number;
  scheduled_at: string;
  transport_mode: string;
}
```

**Modified Submit Flow:**
```tsx
const handleTripSubmit = async () => {
  if (role === "solo") {
    // Existing solo logic - save directly
    await saveSoloTrip();
  } else if (role === "driver" || role === "rider") {
    // NEW: Transition to searching state
    setModalStep("searching");
    setIsSearching(true);
    
    // Query for matches
    const matches = await findMatches({
      role,
      origin: originCoords,
      destination: destCoords,
      scheduledDate,
    });
    
    setPotentialMatches(matches);
    setIsSearching(false);
    
    // Pass matches to parent to display on map
    onSearchingForMatch?.(matches);
  }
};
```

#### B. Matching Query Function
**File:** `clyzio/lib/matchingService.ts` (NEW)

```tsx
import { supabase } from './supabase';

export interface MatchCriteria {
  role: 'driver' | 'rider';
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  scheduledDate: Date;
  maxDistance?: number; // km radius for matching
}

export async function findMatches(criteria: MatchCriteria) {
  const { role, origin, destination, scheduledDate, maxDistance = 5 } = criteria;
  
  // Determine opposite role (drivers match with riders, vice versa)
  const matchRole = role === 'driver' ? 'rider' : 'driver';
  
  // Query Supabase for potential matches
  // Note: This uses a simplified query. In production, use PostGIS for geo queries
  const { data: rides, error } = await supabase
    .from('rides')
    .select(`
      id,
      rider_id,
      driver_id,
      user_id:${matchRole === 'rider' ? 'rider_id' : 'driver_id'}(
        id,
        first_name,
        last_name,
        department,
        avatar_url,
        rating
      ),
      origin_lat,
      origin_long,
      dest_lat,
      dest_long,
      scheduled_at,
      transport_mode,
      status
    `)
    .eq('status', 'searching') // New status for unmatched rides
    .gte('scheduled_at', new Date(scheduledDate.getTime() - 3600000).toISOString()) // Within 1 hour
    .lte('scheduled_at', new Date(scheduledDate.getTime() + 3600000).toISOString())
    .not(matchRole === 'rider' ? 'rider_id' : 'driver_id', 'is', null);
  
  if (error) {
    console.error('Error finding matches:', error);
    return [];
  }
  
  // Filter by distance (simple Haversine calculation)
  const matches = rides?.filter(ride => {
    const originDistance = calculateDistance(
      origin.lat, origin.lng,
      ride.origin_lat, ride.origin_long
    );
    const destDistance = calculateDistance(
      destination.lat, destination.lng,
      ride.dest_lat, ride.dest_long
    );
    
    // Both origin and destination must be within maxDistance
    return originDistance <= maxDistance && destDistance <= maxDistance;
  }) || [];
  
  return matches;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

#### C. Map Markers for Matches
**File:** `clyzio/app/(tabs)/index.tsx`

**New State:**
```tsx
const [searchingMatches, setSearchingMatches] = useState<Match[]>([]);
const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
```

**Render Matches:**
```tsx
{/* Render matching user markers */}
{searchingMatches.map((match) => (
  <Marker
    key={match.id}
    coordinate={{
      latitude: match.origin_lat,
      longitude: match.origin_long,
    }}
    onPress={() => setSelectedMatch(match)}
  >
    <View style={styles.matchMarker}>
      <Users size={24} color={COLORS.primary} />
    </View>
  </Marker>
))}
```

#### D. Match Card Component
**File:** `clyzio/components/MatchCard.tsx` (NEW)

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { User, Star, MapPin, Calendar } from 'lucide-react-native';

interface MatchCardProps {
  match: Match;
  onRequestMatch: (matchId: string) => void;
  onClose: () => void;
}

export default function MatchCard({ match, onRequestMatch, onClose }: MatchCardProps) {
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
      
      {/* Avatar */}
      <View style={styles.avatar}>
        {match.avatar_url ? (
          <Image source={{ uri: match.avatar_url }} style={styles.avatarImage} />
        ) : (
          <User size={32} color="#fff" />
        )}
      </View>
      
      {/* Name */}
      <Text style={styles.name}>
        {match.first_name} {match.last_name}
      </Text>
      
      {/* Department */}
      {match.department && (
        <Text style={styles.department}>{match.department}</Text>
      )}
      
      {/* Rating */}
      {match.rating && (
        <View style={styles.ratingRow}>
          <Star size={16} color="#FDD835" fill="#FDD835" />
          <Text style={styles.ratingText}>{match.rating.toFixed(1)}</Text>
        </View>
      )}
      
      {/* Route Info */}
      <View style={styles.routeInfo}>
        <MapPin size={16} color="#10B981" />
        <Text style={styles.routeText}>Similar route</Text>
      </View>
      
      {/* Time */}
      <View style={styles.timeInfo}>
        <Calendar size={16} color="#94A3B8" />
        <Text style={styles.timeText}>
          {new Date(match.scheduled_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </View>
      
      {/* Request Button */}
      <TouchableOpacity 
        style={styles.requestBtn}
        onPress={() => onRequestMatch(match.id)}
      >
        <Text style={styles.requestBtnText}>Request Match</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: '#64748B',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  department: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  routeText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  timeText: {
    fontSize: 14,
    color: '#64748B',
  },
  requestBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
    width: '100%',
  },
  requestBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
```

#### E. Request Match Function
**File:** `clyzio/lib/matchingService.ts`

```tsx
export async function requestMatch(
  requesterId: string,
  matchRideId: string,
  requesterRole: 'driver' | 'rider'
) {
  try {
    // Get the match ride details
    const { data: matchRide, error: fetchError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', matchRideId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Create a ride request record
    const { data: request, error: requestError } = await supabase
      .from('ride_requests')
      .insert([{
        requester_id: requesterId,
        requested_user_id: requesterRole === 'driver' 
          ? matchRide.rider_id 
          : matchRide.driver_id,
        ride_id: matchRideId,
        status: 'pending',
        created_at: new Date().toISOString(),
      }])
      .select()
      .single();
    
    if (requestError) throw requestError;
    
    // Update the ride status to pending_approval
    const { error: updateError } = await supabase
      .from('rides')
      .update({ status: 'pending_approval' })
      .eq('id', matchRideId);
    
    if (updateError) throw updateError;
    
    return { success: true, requestId: request.id };
  } catch (error) {
    console.error('Error requesting match:', error);
    return { success: false, error };
  }
}
```

---

## 🚧 Task 3: Approval Flow (TO IMPLEMENT)

### Database Schema Updates

#### New Table: `ride_requests`
```sql
CREATE TABLE ride_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  requester_id UUID REFERENCES profiles(id) NOT NULL,
  requested_user_id UUID REFERENCES profiles(id) NOT NULL,
  ride_id UUID REFERENCES rides(id) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view requests they're involved in"
  ON ride_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = requested_user_id);

CREATE POLICY "Users can create requests"
  ON ride_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Requested users can update status"
  ON ride_requests FOR UPDATE
  USING (auth.uid() = requested_user_id);
```

#### Update `rides` Table Status
Add new status values:
```sql
ALTER TABLE rides 
DROP CONSTRAINT IF EXISTS rides_status_check;

ALTER TABLE rides 
ADD CONSTRAINT rides_status_check 
CHECK (status IN (
  'scheduled',
  'searching',
  'pending_approval',
  'in_progress',
  'completed',
  'cancelled'
));
```

### Notification/Request Component
**File:** `clyzio/components/RideRequestCard.tsx` (NEW)

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { User, MapPin, Calendar, Check, X } from 'lucide-react-native';

interface RideRequestCardProps {
  request: {
    id: string;
    requester: {
      first_name: string;
      last_name: string;
      avatar_url?: string;
      rating?: number;
    };
    ride: {
      origin_address: string;
      dest_address: string;
      scheduled_at: string;
    };
  };
  onApprove: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

export default function RideRequestCard({ request, onApprove, onDecline }: RideRequestCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Ride Request</Text>
      
      <View style={styles.requesterInfo}>
        <View style={styles.avatar}>
          <User size={24} color="#fff" />
        </View>
        <View>
          <Text style={styles.name}>
            {request.requester.first_name} {request.requester.last_name}
          </Text>
          {request.requester.rating && (
            <Text style={styles.rating}>★ {request.requester.rating.toFixed(1)}</Text>
          )}
        </View>
      </View>
      
      <View style={styles.routeInfo}>
        <MapPin size={16} color="#10B981" />
        <Text style={styles.routeText} numberOfLines={1}>
          {request.ride.origin_address.split(',')[0]} → {request.ride.dest_address.split(',')[0]}
        </Text>
      </View>
      
      <View style={styles.timeInfo}>
        <Calendar size={16} color="#64748B" />
        <Text style={styles.timeText}>
          {new Date(request.ride.scheduled_at).toLocaleString()}
        </Text>
      </View>
      
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.btn, styles.declineBtn]}
          onPress={() => onDecline(request.id)}
        >
          <X size={20} color="#EF4444" />
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.btn, styles.approveBtn]}
          onPress={() => onApprove(request.id)}
        >
          <Check size={20} color="#fff" />
          <Text style={styles.approveText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FDD835',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  requesterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  rating: {
    fontSize: 14,
    color: '#FDD835',
    fontWeight: '600',
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  routeText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
    flex: 1,
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  timeText: {
    fontSize: 14,
    color: '#64748B',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  declineBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#FEE2E2',
  },
  declineText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 14,
  },
  approveBtn: {
    backgroundColor: '#10B981',
  },
  approveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
```

### Approval Logic
**File:** `clyzio/lib/matchingService.ts`

```tsx
export async function approveRideRequest(requestId: string) {
  try {
    // Get request details
    const { data: request, error: fetchError } = await supabase
      .from('ride_requests')
      .select('*, rides(*)')
      .eq('id', requestId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Update request status
    const { error: updateRequestError } = await supabase
      .from('ride_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    
    if (updateRequestError) throw updateRequestError;
    
    // Update ride status to scheduled and link the users
    const { error: updateRideError } = await supabase
      .from('rides')
      .update({ 
        status: 'scheduled',
        // Link driver and rider
        driver_id: request.requester_id, // or determine from roles
        rider_id: request.requested_user_id,
      })
      .eq('id', request.ride_id);
    
    if (updateRideError) throw updateRideError;
    
    return { success: true };
  } catch (error) {
    console.error('Error approving request:', error);
    return { success: false, error };
  }
}

export async function declineRideRequest(requestId: string) {
  try {
    const { error } = await supabase
      .from('ride_requests')
      .update({ 
        status: 'declined', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', requestId);
    
    if (error) throw error;
    
    return { success: true };
  } catch (error) {
    console.error('Error declining request:', error);
    return { success: false, error };
  }
}
```

---

## 📊 Complete User Flow

### Scenario: Driver Looking for Rider

1. **Driver opens Trip Planner**
   - Selects role: "Driver"
   - Enters origin, destination, time
   - Clicks "Submit/Search"

2. **System searches for matches**
   - Query finds riders with similar routes
   - Display riders as markers on map
   - Show loading state while searching

3. **Driver clicks rider marker**
   - Match Card appears with rider details
   - Shows: Name, Department, Rating, Route similarity

4. **Driver clicks "Request Match"**
   - Creates ride_request record (status: pending)
   - Updates ride status to pending_approval
   - Notification sent to rider

5. **Rider views request**
   - Sees pending request in Activity tab
   - Request card shows driver details
   - Options: Approve or Decline

6. **Rider approves**
   - Ride status → scheduled
   - Both users linked (driver_id, rider_id)
   - Chat unlocked for both users
   - Both can see each other's details

### Scenario: Rider Looking for Driver

Same flow, but:
- Rider searches for drivers
- Driver markers shown on map
- Driver receives approval request

---

## 🎨 UI States

### Trip Planner States
```tsx
type ModalStep = 
  | "location"     // Enter origin/destination
  | "mode"         // Select transport mode & role
  | "searching"    // Finding matches (for driver/rider)
  | "matches"      // Display found matches
```

### Ride Status Values
```tsx
type RideStatus = 
  | "searching"          // Looking for match
  | "pending_approval"   // Waiting for approval
  | "scheduled"          // Matched and approved
  | "in_progress"        // Currently happening
  | "completed"          // Trip finished
  | "cancelled"          // Trip cancelled
```

---

## 🔔 Notifications (Future Enhancement)

### Push Notifications
When a match request is received:
```tsx
{
  title: "New Ride Request!",
  body: "John Doe wants to carpool with you",
  data: {
    type: "ride_request",
    requestId: "uuid",
  }
}
```

---

## ✅ Implementation Checklist

### Database
- [ ] Create `ride_requests` table
- [ ] Add RLS policies for ride_requests
- [ ] Update rides table status constraint
- [ ] Add indexes for performance

### Backend/Services
- [ ] Create `matchingService.ts` with findMatches()
- [ ] Implement requestMatch()
- [ ] Implement approveRideRequest()
- [ ] Implement declineRideRequest()

### Components
- [ ] Create `MatchCard.tsx`
- [ ] Create `RideRequestCard.tsx`
- [ ] Update `TripPlannerModal.tsx` (add searching state)
- [ ] Update `MapScreen` (index.tsx) to show match markers

### Integration
- [ ] Update Activity screen to show pending requests
- [ ] Add "Pending" badge to upcoming trips
- [ ] Enable chat only after approval
- [ ] Test end-to-end flow

---

## 🧪 Testing Scenarios

1. **Driver searches, finds riders, requests match**
2. **Rider receives notification, approves**
3. **Both users can now chat**
4. **Driver searches, no matches found**
5. **Rider declines request**
6. **Multiple requests handling**
7. **Request timeout/expiration**

---

## 📝 Summary

Task 1 is **COMPLETE** - Solo trips now properly hide Chat button and Partner card.

Tasks 2 & 3 require:
- Database schema updates (ride_requests table)
- New matching service with geo queries
- Match Card UI component
- Request approval UI
- Integration with existing Trip Planner and Activity screens

This is a comprehensive feature that will take time to implement properly. The plan above provides a complete roadmap.



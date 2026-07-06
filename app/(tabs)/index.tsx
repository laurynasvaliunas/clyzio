import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Share,
} from "react-native";
import Mapbox, { MapView, Camera, PointAnnotation, ShapeSource, LineLayer, UserLocation } from "@rnmapbox/maps";
import { Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { Car, Users, UserCircle, X, Sparkles } from "lucide-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BrandHeader from "../../components/BrandHeader";
import TripPlannerModal from "../../components/TripPlannerModal";
import AISuggestionChip from "../../components/AISuggestionChip";
import CarpoolMatchModal from "../../components/CarpoolMatchModal";
import CommuteHomeCard, { type PlanDay, type PlannedRideSummary } from "../../components/CommuteHomeCard";
import YesterdayImpactCard, { type YesterdayImpact } from "../../components/YesterdayImpactCard";
import * as SecureStore from "expo-secure-store";
import { supabase } from "../../lib/supabase";
import { buildWebLink } from "../../lib/deepLinks";
import { logger } from "../../lib/logger";
import { useAIStore } from "../../store/useAIStore";
import { useDailyCommuteStore } from "../../store/useDailyCommuteStore";
import { useTheme } from "../../contexts/ThemeContext";
import { getThemeColors } from "../../lib/theme";
import { useToast } from "../../contexts/ToastContext";

import { MAPBOX_TOKEN, IS_MAPBOX_TOKEN_VALID } from "../../lib/config";
if (IS_MAPBOX_TOKEN_VALID) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
}

// Editorial reskin — local palette re-pointed onto the warm "paper" system.
// Keys preserved so every COLORS.* reference in this screen restyles in place.
const COLORS = {
  primary: "#00565A",   // cyan
  accent: "#F59E0B",    // sun (dialed-down ochre)
  white: "#FFFFFF",     // ivory card surface
  gray: "#8B989C",      // ink-4
  dark: "#003D40",      // teal
  green: "#059669",     // leaf
  black: "#0B1A1F",     // ink
  background: "#F7F9FA",// paper
  overlay: "rgba(11,26,31,0.32)",
};

type SearchStatus = 'idle' | 'searching' | 'waiting' | 'matched';

/**
 * CommuterMarker - Displays a nearby driver or rider on the map
 * Shows custom icon (car for drivers, users for riders) with color coding
 */
interface CommuterMarkerProps {
  commuter: any;
  searchMode: 'driver' | 'rider';
  onPress: () => void;
}

function CommuterMarker({ commuter, searchMode, onPress }: CommuterMarkerProps) {
  const profile = commuter.profiles;
  if (!profile) return null;

  const isLookingForDriver = searchMode === 'rider';
  const markerColor = isLookingForDriver ? COLORS.primary : COLORS.accent;

  return (
    <PointAnnotation
      id={`commuter-${commuter.id}`}
      coordinate={[commuter.origin_long, commuter.origin_lat]}
      onSelected={onPress}
    >
      <View style={[styles.customMarker, { backgroundColor: markerColor }]}>
        {isLookingForDriver ? (
          <Car size={20} color={COLORS.white} />
        ) : (
          <Users size={20} color={COLORS.white} />
        )}
      </View>
    </PointAnnotation>
  );
}

/**
 * SearchingOverlay - Displays searching/waiting state UI
 * Shows loading spinner and appropriate messages based on search status
 */
interface SearchingOverlayProps {
  status: SearchStatus;
  searchMode: 'driver' | 'rider' | null;
  matchCount: number;
  onCancel: () => void;
  onViewMap: () => void;
}

function SearchingOverlay({ status, searchMode, matchCount, onCancel, onViewMap }: SearchingOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'searching') {
      // Pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [status, pulseAnim]);

  const getMessage = () => {
    if (status === 'searching') {
      return searchMode === 'rider' 
        ? 'Scanning for drivers nearby...' 
        : 'Looking for passengers...';
    }
    if (status === 'waiting') {
      return searchMode === 'rider'
        ? 'No drivers available yet. We will notify you when one appears.'
        : 'Waiting for riders... Keep your app open.';
    }
    if (status === 'matched') {
      return matchCount > 0
        ? `Found ${matchCount} ${searchMode === 'rider' ? 'driver' : 'rider'}${matchCount > 1 ? 's' : ''}!`
        : 'Searching...';
    }
    return '';
  };

  const getIcon = () => {
    if (searchMode === 'rider') {
      return <Car size={32} color={COLORS.white} />;
    }
    return <Users size={32} color={COLORS.white} />;
  };

  return (
    <View style={styles.searchingOverlay}>
      <View style={styles.searchingCard}>
        {/* Icon with animation */}
        <Animated.View style={[styles.searchingIconContainer, { transform: [{ scale: pulseAnim }] }]}>
          {getIcon()}
        </Animated.View>

        {/* Status text */}
        <Text style={styles.searchingTitle}>
          {status === 'matched' ? '🎉 Match Found!' : status === 'waiting' ? '⏳ Waiting' : '🔍 Searching'}
        </Text>
        <Text style={styles.searchingMessage}>{getMessage()}</Text>

        {/* Loading spinner for searching state */}
        {status === 'searching' && (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 16 }} />
        )}

        {/* Match count indicator */}
        {status === 'matched' && matchCount > 0 && (
          <View style={styles.matchCountBadge}>
            <Text style={styles.matchCountText}>{matchCount} available</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.searchingActions}>
          {status === 'matched' && matchCount > 0 ? (
            <TouchableOpacity style={styles.viewMatchesBtn} onPress={onViewMap}>
              <Text style={styles.viewMatchesBtnText}>View on Map</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.cancelSearchBtn} onPress={onCancel}>
              <X size={18} color={COLORS.white} />
              <Text style={styles.cancelSearchBtnText}>Cancel Search</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * MatchCard - Bottom sheet showing detailed info about a selected commuter
 * Allows requesting a ride or offering a pickup
 */
interface MatchCardProps {
  match: any;
  searchMode: 'driver' | 'rider' | null;
  onClose: () => void;
  onRequestMatch: () => void;
  isLoading?: boolean;
}

function MatchCard({ match, searchMode, onClose, onRequestMatch, isLoading = false }: MatchCardProps) {
  const { showToast } = useToast();
  const router = useRouter();
  const peerId: string | null = match.profiles?.id ?? (searchMode === 'rider' ? match.driver_id : match.rider_id) ?? null;
  return (
    <View style={styles.matchCard}>
      {/* Drag handle */}
      <View style={styles.matchHandle} />
      {/* Card Header */}
      <View style={styles.matchHeader}>
        <View style={styles.matchAvatarContainer}>
          <View style={styles.matchAvatar}>
            <UserCircle size={48} color={COLORS.primary} />
          </View>
          <View style={[styles.matchStatusDot, { backgroundColor: COLORS.green }]} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.matchName}>
            {match.profiles?.first_name} {match.profiles?.last_name}
          </Text>
          {!!match.profiles?.department && (
            <Text style={styles.matchDept}>📍 {match.profiles?.department}</Text>
          )}
          <View style={styles.matchRoleBadge}>
            <Text style={styles.matchRoleText}>
              {searchMode === 'rider' ? '🚗 Driver' : '🙋 Looking for ride'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={styles.matchCloseBtn}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Close match details"
        >
          <Text style={styles.matchClose} accessibilityElementsHidden importantForAccessibility="no">✕</Text>
        </TouchableOpacity>
      </View>

      {/* Route Information */}
      <View style={styles.matchRouteContainer}>
        <Text style={styles.matchRouteLabel}>Route</Text>
        <View style={styles.matchRoute}>
          <View style={styles.routeDotGreen} />
          <Text style={styles.matchRouteText} numberOfLines={1}>
            {match.origin_address?.split(',')[0] || 'Origin'}
          </Text>
        </View>
        <View style={styles.matchRouteLine} />
        <View style={styles.matchRoute}>
          <View style={styles.routeDotBlue} />
          <Text style={styles.matchRouteText} numberOfLines={1}>
            {match.dest_address?.split(',')[0] || 'Destination'}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.matchActions}>
        <TouchableOpacity 
          style={[styles.requestBtn, isLoading && styles.requestBtnDisabled]} 
          onPress={onRequestMatch}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.requestBtnText}>
              {searchMode === 'rider' ? '🚗 Request Ride' : '🙋 Offer Pickup'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewProfileBtn, isLoading && styles.viewProfileBtnDisabled]}
          onPress={() => {
            if (peerId) router.push(`/profile/${peerId}` as any);
            else showToast({ title: 'Profile unavailable', message: 'This commuter has no public profile.', type: 'info' });
          }}
          disabled={isLoading}
        >
          <Text style={styles.viewProfileBtnText}>View Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * MapScreen - Main component for map view
 * Handles trip planning, driver/rider matching, and route display
 */
export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const cameraRef = useRef<Camera>(null);
  const router = useRouter();
  const { preset_mode, preset_origin_lat, preset_origin_lng, preset_origin_desc, preset_dest_lat, preset_dest_lng, preset_dest_desc } = useLocalSearchParams<{
    preset_mode?: string;
    preset_origin_lat?: string;
    preset_origin_lng?: string;
    preset_origin_desc?: string;
    preset_dest_lat?: string;
    preset_dest_lng?: string;
    preset_dest_desc?: string;
  }>();
  const { isDark } = useTheme();
  const TC = getThemeColors(isDark);
  const { showToast } = useToast();
  // Safe-area top inset so floating overlays don't land under the iOS
  // clock / Dynamic Island.
  const insets = useSafeAreaInsets();

  // ✅ PROFILE STATE
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  // ✅ STAGE 2 (customer-journey PDF) — home/work places, day toggle, plan card
  const [places, setPlaces] = useState<{
    homeLat: number | null; homeLng: number | null; homeAddress: string;
    workLat: number | null; workLng: number | null; workAddress: string;
  } | null>(null);
  const [targetDay, setTargetDay] = useState<PlanDay>("tomorrow");
  const [plannedRide, setPlannedRide] = useState<PlannedRideSummary | null>(null);
  // Default home→work route, drawn when the user is idle (no active trip) so
  // the map always shows their commute corridor.
  const [defaultRouteCoords, setDefaultRouteCoords] = useState<number[][] | null>(null);

  // ✅ STAGE 4 — yesterday's completed-commute impact card (shown at most once
  // per day; dismissal persisted in SecureStore keyed by date).
  const [yesterdayImpact, setYesterdayImpact] = useState<YesterdayImpact | null>(null);

  // Measured height of the bottom CommuteHomeCard stack, so the My-Location FAB
  // can be lifted clear of it (the card height differs by plan/no-plan state).
  const [homeCardHeight, setHomeCardHeight] = useState(0);

  // ✅ MINIMAL STATE - Only trip result data
  const [locationGranted, setLocationGranted] = useState(false);
  // Brand-coloured mask covers the empty Mapbox grid + UserLocation pulse
  // until tiles finish loading. Without this, cold-starts flash a gray grid
  // with the location-puck rings — looks like a broken/loading screen.
  const [mapReady, setMapReady] = useState(false);
  const mapMaskOpacity = useRef(new Animated.Value(1)).current;
  const [showPlanner, setShowPlanner] = useState(false);
  const [pendingPresetMode, setPendingPresetMode] = useState<string | null>(null);
  const [pendingPresetOrigin, setPendingPresetOrigin] = useState<{ lat: number; lng: number; description: string } | null>(null);
  const [pendingPresetDest, setPendingPresetDest] = useState<{ lat: number; lng: number; description: string } | null>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  // DB id of the current ride — needed to cancel or update the row when the
  // user taps "Cancel Search" or when the trip is completed/archived.
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [routeCoords, setRouteCoords] = useState<number[][] | null>(null);

  // ✅ COMMUTER RADAR STATE
  const [searchMode, setSearchMode] = useState<'driver' | 'rider' | null>(null);
  const [nearbyCommuters, setNearbyCommuters] = useState<any[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);
  // Origin of the active search, captured so a realtime refresh can re-query.
  const searchOriginRef = useRef<any>(null);

  // ✅ SEARCH STATUS STATE
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [isViewingMap, setIsViewingMap] = useState(false); // Track if overlay is dismissed

  // ✅ REQUEST STATUS STATE
  const [requestStatus, setRequestStatus] = useState<'idle' | 'loading'>('idle');

  // ✅ AI STATE
  const [chipDismissed, setChipDismissed] = useState(false);
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);
  const { commuteResult, isLoadingCommute, fetchCommuteSuggestions, carpoolResult, isLoadingCarpool, carpoolError, fetchCarpoolMatches } = useAIStore();

  // ✅ DAILY COMMUTE INTENT STATE
  const { intent, matches, checkExistingIntent, requestCarpool } = useDailyCommuteStore();

  /**
   * ✅ AUTO-CENTER TO USER LOCATION ON MOUNT
   * Requests permission, sets locationGranted state, and centers map.
   * Also clears the brand mask once Mapbox reports tiles loaded.
   */
  const centerToUserLocation = useCallback(async () => {
    // Fade the brand mask out as soon as the map signals it's ready. Run in
    // parallel with the location request so the user doesn't wait on GPS.
    setMapReady(true);
    Animated.timing(mapMaskOpacity, {
      toValue: 0,
      duration: 380,
      useNativeDriver: true,
    }).start();

    try {
      let granted = false;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        granted = true;
      } else {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        granted = newStatus === 'granted';
      }

      setLocationGranted(granted);

      if (!granted) return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      cameraRef.current?.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 13,
        animationDuration: 1000,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  }, [mapMaskOpacity]);

  // Watchdog — if the map never reports ready (offline, slow tiles, etc.),
  // drop the mask after 4 s anyway so the user isn't staring at a blank cyan
  // wall. They'll see Mapbox's own loading state, which is at least correct
  // brand-context once they're on the map.
  useEffect(() => {
    if (mapReady) return;
    const t = setTimeout(() => {
      setMapReady(true);
      Animated.timing(mapMaskOpacity, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }).start();
    }, 4000);
    return () => clearTimeout(t);
  }, [mapReady, mapMaskOpacity]);

  // centerToUserLocation is called via onDidFinishLoadingMap once the camera ref is ready

  // ✅ Fetch real road route via Mapbox Directions whenever activeTrip changes
  useEffect(() => {
    if (!activeTrip?.origin || !activeTrip?.destination) {
      setRouteCoords(null);
      return;
    }
    const fetchRoute = async () => {
      try {
        const modeId = activeTrip.mode?.id ?? "my_car";
        const profile =
          modeId === "walking" ? "walking"
          : modeId === "bike" || modeId === "ebike" ? "cycling"
          : "driving";

        const waypoints = [
          `${activeTrip.origin.lng},${activeTrip.origin.lat}`,
          ...(activeTrip.waypoint ? [`${activeTrip.waypoint.lng},${activeTrip.waypoint.lat}`] : []),
          `${activeTrip.destination.lng},${activeTrip.destination.lat}`,
        ].join(";");

        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${waypoints}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.routes?.length > 0) {
          setRouteCoords(json.routes[0].geometry.coordinates);
        }
      } catch (e) {
        console.warn("Route fetch failed:", e);
      }
    };
    fetchRoute();
  }, [activeTrip]);

  // ✅ Fetch user profile for avatar + home/work places (Stage 2)
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url, home_lat, home_long, home_address, work_lat, work_long, work_address')
        .eq('id', user.id)
        .single();
      if (data) {
        setUserAvatar(data.avatar_url ?? null);
        const name = [data.first_name, data.last_name].filter(Boolean).join(' ');
        setUserName(name);
        setPlaces({
          homeLat: data.home_lat ?? null,
          homeLng: data.home_long ?? null,
          homeAddress: data.home_address ?? "",
          workLat: data.work_lat ?? null,
          workLng: data.work_long ?? null,
          workAddress: data.work_address ?? "",
        });
      }
    };
    fetchProfile();
  }, []);

  // ✅ Default home→work route corridor — fetched once we know both places and
  // only while idle (no active trip route takes precedence). Drawn subtly so
  // the map always frames the user's commute even before they plan.
  useEffect(() => {
    if (activeTrip) return; // active route wins
    const h = places;
    if (h?.homeLat == null || h?.homeLng == null || h?.workLat == null || h?.workLng == null) {
      setDefaultRouteCoords(null);
      return;
    }
    // Capture as non-null locals so the async closure keeps the narrowing.
    const homeLng: number = h.homeLng;
    const homeLat: number = h.homeLat;
    const workLng: number = h.workLng;
    const workLat: number = h.workLat;
    let cancelled = false;
    (async () => {
      try {
        const coords = `${homeLng},${homeLat};${workLng},${workLat}`;
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled && json.routes?.length > 0) {
          setDefaultRouteCoords(json.routes[0].geometry.coordinates);
          // Frame both endpoints on first load.
          cameraRef.current?.fitBounds(
            [workLng, workLat],
            [homeLng, homeLat],
            80,
            800,
          );
        }
      } catch {
        if (!cancelled) setDefaultRouteCoords(null);
      }
    })();
    return () => { cancelled = true; };
  }, [places, activeTrip]);

  // ✅ Planned-ride lookup for the selected day (Today/Tomorrow). Reads the
  // user's most recent scheduled/requested ride whose scheduled_at falls on
  // the target calendar day, and maps it to the bottom-card summary.
  const refreshPlannedRide = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPlannedRide(null); return; }

      const base = new Date();
      if (targetDay === "tomorrow") base.setDate(base.getDate() + 1);
      const dayStart = new Date(base); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(base); dayEnd.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from('rides')
        .select('transport_mode, transport_label, distance_km, co2_saved, scheduled_at, status')
        .or(`driver_id.eq.${user.id},rider_id.eq.${user.id}`)
        .in('status', ['scheduled', 'requested', 'active'])
        .gte('scheduled_at', dayStart.toISOString())
        .lte('scheduled_at', dayEnd.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(1);

      const ride = data?.[0];
      if (ride) {
        setPlannedRide({
          modeId: ride.transport_mode ?? null,
          modeLabel: ride.transport_label || ride.transport_mode || "Planned trip",
          distanceKm: ride.distance_km ?? null,
          co2SavedKg: ride.co2_saved ?? null,
        });
      } else {
        setPlannedRide(null);
      }
    } catch {
      setPlannedRide(null);
    }
  }, [targetDay]);

  // Refresh the planned ride whenever the target day changes or the screen
  // regains focus (e.g. returning from the planner having saved a trip).
  useEffect(() => { refreshPlannedRide(); }, [refreshPlannedRide]);
  useFocusEffect(
    useCallback(() => { refreshPlannedRide(); }, [refreshPlannedRide])
  );

  // Today's date label for the top bar ("Wednesday, May 28").
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    [],
  );

  // Planner prefill (P1): seed the planner with the profile's home→work and the
  // day chosen on the Today/Tomorrow toggle, so "Plan your ride" lands on the
  // transport cards for the right date. AI-Planner deep-links still take
  // precedence via the pendingPreset* values.
  const plannerOrigin = useMemo(() => {
    if (pendingPresetOrigin) return pendingPresetOrigin;
    if (places?.homeLat != null && places?.homeLng != null) {
      return { lat: places.homeLat, lng: places.homeLng, description: places.homeAddress || "Home" };
    }
    return undefined;
  }, [pendingPresetOrigin, places]);

  const plannerDest = useMemo(() => {
    if (pendingPresetDest) return pendingPresetDest;
    if (places?.workLat != null && places?.workLng != null) {
      return { lat: places.workLat, lng: places.workLng, description: places.workAddress || "Work" };
    }
    return undefined;
  }, [pendingPresetDest, places]);

  // Resolve the toggle's day to a concrete scheduled date: tomorrow → 08:00
  // (a sensible commute slot), today → now + 15 min so it lands in "Upcoming".
  const plannerDate = useMemo(() => {
    const d = new Date();
    if (targetDay === "tomorrow") {
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
    } else {
      d.setMinutes(d.getMinutes() + 15);
    }
    return d;
    // showPlanner in deps so the date is fresh each time the sheet opens.
  }, [targetDay, showPlanner]);

  // ✅ STAGE 4 — load yesterday's completed commute for the re-engagement card.
  // Shows once per calendar day; dismissal persists via a date-keyed SecureStore
  // flag so it never nags after the user has acknowledged it.
  const refreshYesterdayImpact = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setYesterdayImpact(null); return; }

      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yStart = new Date(y); yStart.setHours(0, 0, 0, 0);
      const yEnd = new Date(y); yEnd.setHours(23, 59, 59, 999);
      const dayKey = `clyzio.impactSeen.${yStart.toISOString().slice(0, 10)}`;

      // Already dismissed for this date → don't show.
      const seen = await SecureStore.getItemAsync(dayKey).catch(() => null);
      if (seen === "1") { setYesterdayImpact(null); return; }

      const { data } = await supabase
        .from('rides')
        .select('transport_mode, distance_km, co2_saved, completed_at, status')
        .or(`driver_id.eq.${user.id},rider_id.eq.${user.id}`)
        .eq('status', 'completed')
        .gte('completed_at', yStart.toISOString())
        .lte('completed_at', yEnd.toISOString())
        .order('completed_at', { ascending: false })
        .limit(1);

      const ride = data?.[0];
      if (!ride) { setYesterdayImpact(null); return; }

      const distanceKm = Number(ride.distance_km) || 0;
      const co2SavedKg = Number(ride.co2_saved) || 0;
      // Car-equivalent for the comparison bar. Prefer distance × petrol factor;
      // fall back to the saved amount so the bar never renders broken when
      // distance wasn't recorded.
      const carCo2Kg = Math.max(co2SavedKg, distanceKm * 0.192);

      setYesterdayImpact({
        distanceKm,
        modeId: ride.transport_mode ?? null,
        co2SavedKg,
        carCo2Kg,
      });
    } catch {
      setYesterdayImpact(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { refreshYesterdayImpact(); }, [refreshYesterdayImpact])
  );

  const dismissYesterdayImpact = useCallback(async () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const dayKey = `clyzio.impactSeen.${new Date(y.setHours(0, 0, 0, 0)).toISOString().slice(0, 10)}`;
    await SecureStore.setItemAsync(dayKey, "1").catch(() => undefined);
    setYesterdayImpact(null);
  }, []);

  // ✅ Fetch AI commute suggestions when screen is focused (6h cache, non-blocking)
  useFocusEffect(
    useCallback(() => {
      fetchCommuteSuggestions().catch(() => {});
    }, [fetchCommuteSuggestions])
  );

  // ✅ Refresh daily commute intent status when map tab is focused
  useFocusEffect(
    useCallback(() => {
      checkExistingIntent().catch(() => {});
    }, [])
  );

  // ✅ Auto-open TripPlannerModal with pre-selected mode + locations when navigated from AI Planner
  useEffect(() => {
    const hasParams = preset_mode || preset_origin_lat || preset_dest_lat;
    if (!hasParams) return;

    if (preset_mode && typeof preset_mode === 'string') {
      setPendingPresetMode(preset_mode);
    }
    if (preset_origin_lat && preset_origin_lng && preset_origin_desc) {
      setPendingPresetOrigin({
        lat: parseFloat(preset_origin_lat),
        lng: parseFloat(preset_origin_lng),
        description: preset_origin_desc,
      });
    }
    if (preset_dest_lat && preset_dest_lng && preset_dest_desc) {
      setPendingPresetDest({
        lat: parseFloat(preset_dest_lat),
        lng: parseFloat(preset_dest_lng),
        description: preset_dest_desc,
      });
    }
    setShowPlanner(true);
  }, [preset_mode, preset_origin_lat, preset_origin_lng, preset_origin_desc, preset_dest_lat, preset_dest_lng, preset_dest_desc]);

  /**
   * ✅ POST-TRIP MAP RESET
   * Reset map state when returning from completed trip
   * Only runs when screen is focused and NOT during active booking flow
   */
  useFocusEffect(
    useCallback(() => {
      // Don't reset if user is in the middle of booking or viewing success
      if (requestStatus !== 'idle' || selectedMatch || isViewingMap) {
        if (__DEV__) { console.log('⏸️ Skipping reset - user is interacting'); }
        return;
      }

      // Check if we're returning from a completed trip
      const resetIfNeeded = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Check if user has any scheduled OR active trips
          const { data: trips } = await supabase
            .from('rides')
            .select('id')
            .in('status', ['scheduled', 'active']) // ✅ Include scheduled trips!
            .or(`driver_id.eq.${user.id},rider_id.eq.${user.id}`)
            .limit(1);

          // If no trips and we have state, reset the map
          if (!trips || trips.length === 0) {
            if (activeTrip || searchMode || nearbyCommuters.length > 0) {
              if (__DEV__) { console.log('🔄 Resetting map to initial state'); }
              setActiveTrip(null);
              setRouteCoords(null);
              setSearchMode(null);
              setNearbyCommuters([]);
              setSelectedMatch(null);
              setSearchStatus('idle');
              setIsViewingMap(false);
              setRequestStatus('idle');

              // Re-center map to user location
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              
              cameraRef.current?.setCamera({
                centerCoordinate: [location.coords.longitude, location.coords.latitude],
                zoomLevel: 13,
                animationDuration: 1000,
              });
            }
          }
        } catch (error) {
          console.error('Error in reset check:', error);
        }
      };

      // Small delay to prevent racing with state updates
      const timeoutId = setTimeout(resetIfNeeded, 300);
      return () => clearTimeout(timeoutId);
    }, [activeTrip, searchMode, nearbyCommuters, requestStatus, selectedMatch, isViewingMap])
  );

  /**
   * ✅ FETCH NEARBY COMMUTERS - For Driver/Rider matching
   * Fetches available drivers (if user is rider) or riders (if user is driver)
   * Uses a two-step query: rides first, then profiles, to avoid complex joins.
   */
  const fetchNearbyCommuters = useCallback(async (role: 'driver' | 'rider', origin: any) => {
    try {
      setSearchStatus('searching');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Determine opposite role to search for
      const searchRole = role === 'driver' ? 'rider' : 'driver';
      const searchColumn = `${searchRole}_id`;
      
      // Step 1: Get IDs of peers the caller is allowed to see — applies the
      // canonical predicate is_peer_visible (same-company colleagues always;
      // cross-org only when both sides are opted in AND both is_public).
      // Falls back to the legacy is_public-only filter if the RPC isn't
      // present yet (pre-migration 20260521_015) so review builds aren't
      // blocked.
      let visibleUserIds: string[] = [];
      const { data: visibleRpc, error: visibleErr } = await supabase.rpc(
        'get_visible_peer_ids',
      );
      if (visibleErr) {
        const { data: publicProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('is_public', true)
          .neq('id', user.id);
        visibleUserIds = (publicProfiles ?? []).map((p: any) => p.id);
      } else {
        visibleUserIds = ((visibleRpc as any[]) ?? [])
          .map((r) => (typeof r === 'string' ? r : r?.id))
          .filter(Boolean);
      }
      const publicUserIds = visibleUserIds;

      // Step 2: Query scheduled/active rides only from public users
      // (AI matching uses find_carpool_candidates RPC which bypasses this filter)
      const { data: rides, error: ridesError } = await supabase
        .from('rides')
        .select('id, origin_lat, origin_long, dest_lat, dest_long, origin_address, dest_address, status, scheduled_at, driver_id, rider_id')
        .in('status', ['scheduled', 'active', 'requested'])
        .not(searchColumn, 'is', null)
        .in(searchColumn, publicUserIds.length > 0 ? publicUserIds : ['00000000-0000-0000-0000-000000000000'])
        .limit(20);

      if (ridesError) {
        console.error('Error fetching nearby rides:', ridesError);
        setSearchStatus('waiting');
        return;
      }

      if (!rides || rides.length === 0) {
        setNearbyCommuters([]);
        setSearchStatus('waiting');
        return;
      }

      // Step 2: Fetch profile details for each commuter
      const userIds = rides.map((ride: any) => ride[searchColumn]).filter(Boolean);
      
      // Peer profile fields come via a SECURITY DEFINER RPC (profiles RLS is
      // own-row/managers-only); is_peer_visible gates which peers are returned.
      const { data: profiles, error: profilesError } = await supabase
        .rpc('get_public_profiles', { p_ids: userIds });

      if (profilesError) {
        logger.error('Error fetching commuter profiles:', profilesError);
        setNearbyCommuters(rides); // Show rides even if profile fetch fails
        setSearchStatus(rides.length > 0 ? 'matched' : 'waiting');
        return;
      }

      // Step 3: Merge rides with profile data
      const commutersWithProfiles = rides.map((ride: any) => ({
        ...ride,
        profiles: profiles?.find((p: any) => p.id === ride[searchColumn]) || null,
      }));

      if (__DEV__) { console.log('✅ Found nearby commuters:', commutersWithProfiles.length); }
      setNearbyCommuters(commutersWithProfiles);
      setSearchStatus(commutersWithProfiles.length > 0 ? 'matched' : 'waiting');
    } catch (error) {
      logger.error('Error in fetchNearbyCommuters:', error);
      setSearchStatus('waiting');
    }
  }, []);

  // ✅ LIVE SEARCH — while actively looking for a match, subscribe to `rides` so a
  // counterpart who starts searching flips "waiting" → "matched" the same second
  // (no polling, no manual refresh). RLS on rides (is_peer_visible) governs which
  // inserts are delivered, so visibility rules are honored automatically.
  useEffect(() => {
    if (!searchMode) return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel('home-search-rides')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides' },
        () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            if (searchOriginRef.current) {
              fetchNearbyCommuters(searchMode, searchOriginRef.current);
            }
          }, 300);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [searchMode, fetchNearbyCommuters]);

  /**
   * ✅ SINGLE CALLBACK - Receives completed trip data from modal
   * This is called ONCE when user submits, not on every keystroke
   * Initiates search mode for driver/rider roles
   */
  const handleTripStart = async (tripData: any) => {
    if (__DEV__) { console.log("✅ Trip Started:", tripData); }
    
    // Set active trip and persist the DB ride id so we can cancel it later.
    setActiveTrip(tripData);
    if (tripData.rideId) setActiveRideId(tripData.rideId);

    // Reset viewing state for new search
    setIsViewingMap(false);

    // ✅ ACTIVATE COMMUTER RADAR if Driver or Rider role
    if (tripData.role === 'driver' || tripData.role === 'rider') {
      setSearchMode(tripData.role);
      searchOriginRef.current = tripData.origin;

      // Close modal BEFORE starting search
      setShowPlanner(false);

      // Start searching (this will update searchStatus internally)
      await fetchNearbyCommuters(tripData.role, tripData.origin);
    } else {
      // Solo trip - close modal immediately and show route
      setShowPlanner(false);
      setSearchMode(null);
      setNearbyCommuters([]);
      setSearchStatus('idle');
    }

    // Fit map to route (including waypoint if present)
    if (tripData.origin && tripData.destination) {
      const lats = [tripData.origin.lat, tripData.destination.lat];
      const lngs = [tripData.origin.lng, tripData.destination.lng];
      if (tripData.waypoint) {
        lats.push(tripData.waypoint.lat);
        lngs.push(tripData.waypoint.lng);
      }
      cameraRef.current?.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [100, 50, 350, 50],
        1000,
      );
    }
  };

  /**
   * Cancel search and reset to initial state (full reset).
   * Also marks the ride as 'cancelled' in the DB so it moves to
   * Activity → History and doesn't stay stuck in Upcoming as "scheduled".
   */
  // Make the empty-state "invite a colleague" link reliably actionable. Always
  // opens the share sheet: a personal referral link when the user has a
  // referral_code, otherwise a generic clyzio.app link (so it never silently
  // no-ops if the code isn't populated). Errors surface as a toast.
  const handleInviteShare = useCallback(async () => {
    let url = 'https://clyzio.app';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('referral_code')
          .eq('id', user.id)
          .single();
        if (profile?.referral_code) {
          url = buildWebLink({ type: 'invite', code: profile.referral_code });
        }
      }
    } catch {
      // Keep the generic fallback link.
    }
    try {
      await Share.share({
        message: `Join me on Clyzio. Let's share commutes and cut CO₂ together. ${url}`,
        url,
      });
    } catch (e: any) {
      showToast({
        title: "Couldn't open sharing",
        message: e?.message ?? 'Please try again.',
        type: 'error',
      });
    }
  }, [showToast]);

  const handleCancelSearch = useCallback(async () => {
    if (activeRideId) {
      try {
        await supabase
          .from('rides')
          .update({ status: 'cancelled' })
          .eq('id', activeRideId);
      } catch {
        // Non-fatal — UI resets regardless; the ride will expire naturally.
      }
      setActiveRideId(null);
    }
    setSearchStatus('idle');
    setSearchMode(null);
    setNearbyCommuters([]);
    setSelectedMatch(null);
    setActiveTrip(null);
    setIsViewingMap(false);
  }, [activeRideId]);

  /**
   * View map with matches - dismiss overlay but keep route and markers visible
   */
  const handleViewMap = useCallback(() => {
    // Dismiss the overlay by setting isViewingMap to true
    // This keeps:
    // - activeTrip: route line stays visible
    // - nearbyCommuters: markers stay visible
    // - searchStatus: 'matched' allows clicking markers to show MatchCard
    setIsViewingMap(true);
  }, []);

  /**
   * ✅ REQUEST RIDE MATCH
   * Links the current user to the selected ride and confirms the booking
   * Shows success overlay with navigation options
   */
  const handleRequestMatch = useCallback(async (matchId: string) => {
    try {
      setRequestStatus('loading');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !selectedMatch) {
        setRequestStatus('idle');
        return;
      }

      const targetProfile = selectedMatch.profiles;
      if (!targetProfile?.id) {
        showToast({ title: "User not found", type: "error" });
        setRequestStatus('idle');
        return;
      }

      const partnerName = `${targetProfile.first_name ?? ''} ${targetProfile.last_name || ''}`.trim() || 'your match';

      // Pre-check: carpool needs the current user's home + work set. Surface a
      // clear, actionable message instead of a backend error.
      if (places?.homeLat == null || places?.workLat == null) {
        setRequestStatus('idle');
        showToast({
          title: 'Add your commute first',
          message: 'Set your home and work addresses in Settings to carpool.',
          type: 'warning',
        });
        return;
      }

      // Symmetric mutual approval (migration 021): instead of one-sidedly
      // booking the ride, create a match BOTH must approve. The current user's
      // tap counts as their approval; the target is notified to approve too.
      // `searchMode` is the current user's role: rider → we're the passenger,
      // driver → we're the driver.
      await requestCarpool(targetProfile.id, searchMode === 'rider' ? 'rider' : 'driver');

      // Reset the radar and tell the user we're waiting on the other side.
      setSelectedMatch(null);
      setSearchStatus('idle');
      setSearchMode(null);
      setNearbyCommuters([]);
      setRequestStatus('idle');
      showToast({
        title: 'Request sent',
        message: `Waiting for ${partnerName} to approve. You'll both be set once they do.`,
        type: 'success',
        duration: 5000,
      });
    } catch {
      setRequestStatus('idle');
      // Most common backend cause is the target hasn't set their commute yet.
      const name = selectedMatch?.profiles?.first_name ?? 'This colleague';
      showToast({
        title: "Couldn't send request",
        message: `${name} may not have set their commute yet — try another colleague.`,
        type: "error",
      });
    }
  }, [selectedMatch, searchMode, requestCarpool, showToast, places]);

  /**
   * Navigate to Activity tab and reset map
   */
  const handleGoToUpcoming = useCallback(() => {
    // Reset map state
    setSelectedMatch(null);
    setSearchMode(null);
    setNearbyCommuters([]);
    setActiveTrip(null);
    setSearchStatus('idle');
    setIsViewingMap(false);
    setRequestStatus('idle');

    // Navigate to Activity tab
    router.push('/(tabs)/activity');
  }, [router]);

  // Fallback UI when Mapbox token is missing/malformed at build time —
  // prevents a blank white screen and gives Sentry a clear signal.
  if (!IS_MAPBOX_TOKEN_VALID) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.dark, marginBottom: 8 }}>
          Map unavailable
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.gray, textAlign: 'center' }}>
          We couldn&apos;t load the map. Please reinstall the latest version of Clyzio or contact support at info@clyzio.com.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* MAP */}
      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={isDark ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={true}
        onDidFinishLoadingMap={centerToUserLocation}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [25.2797, 54.6872],
            zoomLevel: 12,
          }}
        />

        <UserLocation visible={locationGranted} />

        {/* Origin Marker */}
        {activeTrip?.origin && (
          <PointAnnotation
            id="origin"
            coordinate={[activeTrip.origin.lng, activeTrip.origin.lat]}
          >
            <View style={[styles.markerDot, { backgroundColor: COLORS.green }]} />
          </PointAnnotation>
        )}

        {/* Waypoint Marker */}
        {activeTrip?.waypoint && (
          <PointAnnotation
            id="waypoint"
            coordinate={[activeTrip.waypoint.lng, activeTrip.waypoint.lat]}
          >
            <View style={[styles.markerDot, { backgroundColor: "#D97706" }]} />
          </PointAnnotation>
        )}

        {/* Destination Marker */}
        {activeTrip?.destination && (
          <PointAnnotation
            id="destination"
            coordinate={[activeTrip.destination.lng, activeTrip.destination.lat]}
          >
            <View style={[styles.markerDot, { backgroundColor: "#DC2626" }]} />
          </PointAnnotation>
        )}

        {/* Default home→work corridor (Stage 2) — drawn dashed + subtle while
            idle, so the map always frames the user's commute. Hidden once an
            active trip's real route is shown. */}
        {!activeTrip && defaultRouteCoords && defaultRouteCoords.length > 1 && (
          <ShapeSource
            id="defaultRoute"
            shape={{
              type: "Feature",
              geometry: { type: "LineString", coordinates: defaultRouteCoords },
              properties: {},
            }}
          >
            <LineLayer
              id="defaultRouteLine"
              style={{
                lineColor: COLORS.primary,
                lineWidth: 4,
                lineJoin: "round",
                lineCap: "round",
                lineOpacity: 0.7,
                lineDasharray: [2, 1.5],
              }}
            />
          </ShapeSource>
        )}

        {/* Home / Work pins (Stage 2) — shown while idle. */}
        {!activeTrip && places?.homeLat != null && places?.homeLng != null && (
          <PointAnnotation id="home-place" coordinate={[places.homeLng, places.homeLat]}>
            <View style={[styles.placePin, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.placePinGlyph}>🏠</Text>
            </View>
          </PointAnnotation>
        )}
        {!activeTrip && places?.workLat != null && places?.workLng != null && (
          <PointAnnotation id="work-place" coordinate={[places.workLng, places.workLat]}>
            <View style={[styles.placePin, { backgroundColor: COLORS.green }]}>
              <Text style={styles.placePinGlyph}>💼</Text>
            </View>
          </PointAnnotation>
        )}

        {/* Route Line — follows real roads via Mapbox Directions */}
        {routeCoords && routeCoords.length > 1 && (
          <ShapeSource
            id="route"
            shape={{
              type: "Feature",
              geometry: { type: "LineString", coordinates: routeCoords },
              properties: {},
            }}
          >
            <LineLayer
              id="routeLineCasing"
              style={{ lineColor: "#FFFFFF", lineWidth: 8, lineJoin: "round", lineCap: "round", lineOpacity: 0.55 }}
            />
            <LineLayer
              id="routeLine"
              style={{ lineColor: COLORS.dark, lineWidth: 4, lineJoin: "round", lineCap: "round" }}
            />
          </ShapeSource>
        )}

        {/* COMMUTER RADAR: Display nearby drivers/riders */}
        {searchMode && nearbyCommuters.map((commuter) => (
          <CommuterMarker
            key={commuter.id}
            commuter={commuter}
            searchMode={searchMode}
            onPress={() => setSelectedMatch(commuter)}
          />
        ))}
      </MapView>

      {/* Brand mask — covers the empty Mapbox tile grid + UserLocation pulse
          while tiles load on cold start. Fades out via onDidFinishLoadingMap
          (or the 4 s watchdog if Mapbox never signals ready). */}
      <Animated.View
        pointerEvents={mapReady ? "none" : "auto"}
        style={[styles.mapMask, { opacity: mapMaskOpacity }]}
      >
        <LinearGradient
          colors={["#00565A", "#003D40"]}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={require("../../assets/icon.png")}
          resizeMode="contain"
          style={styles.mapMaskLogo}
          accessibilityLabel="Clyzio"
        />
        <ActivityIndicator
          size="small"
          color="rgba(255,255,255,0.9)"
          style={{ marginTop: 24 }}
        />
      </Animated.View>

      {/* Header */}
      <BrandHeader userAvatar={userAvatar} userName={userName} dateLabel={dateLabel} />

      {/* ── Top floating stack ──────────────────────────────────────────────
          A single column below the header holding (in order) the daily-commute
          intent pill, then EITHER the yesterday-impact card OR the AI chip.
          Stacked with a gap so they never overlap each other or BrandHeader.
          Anchored at insets.top + 56 to clear the logo/date/avatar band. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + 56,
          left: 16,
          right: 16,
          zIndex: 41,
          gap: 8,
        }}
      >
        {/* Daily Commute Intent Pill */}
        {intent && intent.status !== "expired" && (() => {
          const isDriver = intent.role === "driver";
          const open = matches.filter(m => m.status === "pending" || m.status === "awaiting_other");
          const confirmedMatches = matches.filter(m => m.status === "confirmed");
          const myApproved = (m: typeof matches[number]) => isDriver ? m.driver_approved : m.passenger_approved;
          // Open matches that still need MY approval, vs. ones I've approved and
          // am waiting on the other side for.
          const needsMyApproval = open.filter(m => !myApproved(m));
          const awaitingOther = open.filter(m => myApproved(m));

          let icon;
          let label: string;
          let sublabel: string | null = null;
          let pillColor: string;

          if (confirmedMatches.length > 0) {
            // Ride confirmed — both approved.
            pillColor = "#059669";
            if (isDriver) {
              const names = confirmedMatches.map(m => m.passenger_profile?.first_name ?? "Passenger").join(", ");
              label = `Carpool confirmed`;
              sublabel = names;
            } else {
              const driverName = confirmedMatches[0].driver_profile?.first_name ?? "Driver";
              label = `Riding with ${driverName}`;
              sublabel = `Pickup ${confirmedMatches[0].proposed_pickup_time ?? confirmedMatches[0].proposed_departure ?? "tomorrow"}`;
            }
            icon = <Users size={14} color="#fff" />;
          } else if (needsMyApproval.length > 0) {
            // A match is waiting for THIS user to approve.
            pillColor = "#F59E0B";
            const otherName = isDriver
              ? (needsMyApproval[0].passenger_profile?.first_name ?? "a passenger")
              : (needsMyApproval[0].driver_profile?.first_name ?? "a driver");
            label = `Matched with ${otherName}`;
            sublabel = "Tap to approve & ride together";
            icon = <Car size={14} color="#003D40" />;
          } else if (awaitingOther.length > 0) {
            // This user approved; waiting on the other side.
            pillColor = "#00565A";
            const otherName = isDriver
              ? (awaitingOther[0].passenger_profile?.first_name ?? "passenger")
              : (awaitingOther[0].driver_profile?.first_name ?? "driver");
            label = "You're in — waiting for them";
            sublabel = `Waiting for ${otherName} to approve`;
            icon = <Users size={14} color="#fff" />;
          } else if (intent.status === "pending") {
            // Submitted, matching runs instantly — no fixed wait time.
            pillColor = "#00565A";
            label = isDriver ? "Driver intent submitted" : "Passenger intent submitted";
            sublabel = "Matching now…";
            icon = isDriver ? <Car size={14} color="#fff" /> : <Users size={14} color="#fff" />;
          } else {
            return null;
          }

          const textColor = pillColor === "#F59E0B" ? "#003D40" : "#fff";
          const seatsLabel = isDriver && intent.passenger_capacity != null
            ? ` · ${confirmedMatches.length}/${intent.passenger_capacity} seats`
            : "";

          return (
            <TouchableOpacity
              style={[styles.intentPill, { backgroundColor: pillColor }]}
              onPress={() => router.push("/daily-commute")}
              activeOpacity={0.85}
            >
              {icon}
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={[styles.intentPillLabel, { color: textColor }]} numberOfLines={1}>
                  {label}{seatsLabel}
                </Text>
                {sublabel && (
                  <Text style={[styles.intentPillSub, { color: textColor, opacity: 0.8 }]} numberOfLines={1}>
                    {sublabel}
                  </Text>
                )}
              </View>
              <Text style={{ color: textColor, opacity: 0.7, fontSize: 12, fontWeight: "600" }}>›</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Stage 4 — Yesterday's impact card (takes the slot over the AI chip). */}
        {!activeTrip && searchStatus === 'idle' && yesterdayImpact && (
          <YesterdayImpactCard
            impact={yesterdayImpact}
            onSeeImpact={() => router.push('/(tabs)/stats')}
            onDismiss={dismissYesterdayImpact}
            isDark={isDark}
          />
        )}

        {/* AI Suggestion Chip — suppressed while the impact card shows. */}
        {!activeTrip && searchStatus === 'idle' && !yesterdayImpact && !chipDismissed && commuteResult?.insight && (
          <AISuggestionChip
            insight={commuteResult.insight}
            loading={isLoadingCommute}
            onPress={() => router.push('/(tabs)/ai-planner')}
            onDismiss={() => setChipDismissed(true)}
          />
        )}
      </View>

      {/* Stage 2 bottom card — Today/Tomorrow toggle + Plan your ride / plan
          summary. Replaces the old ActionDock + empty-state card as the
          primary idle-state CTA. Shown only when nothing is in flight. */}
      {!showPlanner && !activeTrip && searchStatus === 'idle' && (
        <CommuteHomeCard
          targetDay={targetDay}
          onChangeDay={setTargetDay}
          plan={plannedRide}
          onPlanRide={() => setShowPlanner(true)}
          onChangePlan={() => setShowPlanner(true)}
          isDark={isDark}
          onHeightChange={setHomeCardHeight}
        />
      )}

      {/* ✅ ISOLATED MODAL - Memoized, never re-renders parent */}
      <TripPlannerModal
        visible={showPlanner}
        onClose={() => {
          setShowPlanner(false);
          setPendingPresetMode(null);
          setPendingPresetOrigin(null);
          setPendingPresetDest(null);
        }}
        onTripStart={handleTripStart}
        initialMode={pendingPresetMode ?? undefined}
        initialOrigin={plannerOrigin}
        initialDest={plannerDest}
        initialDate={plannerDate}
      />

      {/* ✅ SEARCHING OVERLAY: Shows during driver/rider search, hidden when viewing map */}
      {searchStatus !== 'idle' && !selectedMatch && !isViewingMap && (
        <SearchingOverlay
          status={searchStatus}
          searchMode={searchMode}
          matchCount={nearbyCommuters.length}
          onCancel={handleCancelSearch}
          onViewMap={handleViewMap}
        />
      )}

      {/* Active Trip Summary Card - Only show for solo trips or when not searching */}
      {activeTrip && searchStatus === 'idle' && (
        <View style={[styles.activeCard, { backgroundColor: TC.surface }]}>
          <View>
            <Text style={[styles.activeTripTitle, { color: TC.text }]}>
              Trip to {activeTrip.destination.description.split(',')[0]}
            </Text>
            <Text style={[styles.activeTripSubtitle, { color: TC.textSecondary }]}>
              {activeTrip.mode?.label || 'Rider'} · {activeTrip.role}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => {
              setActiveTrip(null);
              setShowPlanner(true);
            }} 
            style={styles.changeBtn}
          >
            <Text style={styles.changeBtnText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ✅ MATCH CARD: Shows when user clicks a nearby commuter marker */}
      {selectedMatch && searchStatus === 'matched' && (
        <MatchCard
          match={selectedMatch}
          searchMode={searchMode}
          onClose={() => setSelectedMatch(null)}
          onRequestMatch={() => handleRequestMatch(selectedMatch.id)}
          isLoading={requestStatus === 'loading'}
        />
      )}

      {/* AI Match button — shown when matched and viewing map, as AI-powered alternative */}
      {searchStatus === 'matched' && searchMode && !selectedMatch && isViewingMap && (
        <TouchableOpacity
          style={styles.aiMatchBtn}
          accessibilityRole="button"
          accessibilityLabel="Find AI carpool matches"
          onPress={() => {
            if (activeTrip?.origin && activeTrip?.destination) {
              fetchCarpoolMatches({
                origin_lat: activeTrip.origin.lat,
                origin_long: activeTrip.origin.lng,
                dest_lat: activeTrip.destination.lat,
                dest_long: activeTrip.destination.lng,
                departure_time: activeTrip.scheduledAt ?? new Date().toISOString(),
                role: searchMode,
              }).catch(() => {});
            }
            setShowCarpoolModal(true);
          }}
        >
          <Text style={styles.aiMatchBtnText}>✨ AI Match</Text>
        </TouchableOpacity>
      )}

      {/* Carpool Match Modal */}
      <CarpoolMatchModal
        visible={showCarpoolModal}
        result={carpoolResult}
        loading={isLoadingCarpool}
        error={carpoolError}
        rideId={activeTrip?.rideId ?? null}
        onClose={() => setShowCarpoolModal(false)}
        onMatchAccepted={(matchRideId) => {
          setShowCarpoolModal(false);
          handleGoToUpcoming();
        }}
        onRetry={() => {
          if (activeTrip?.origin && activeTrip?.destination) {
            fetchCarpoolMatches({
              origin_lat: activeTrip.origin.lat,
              origin_long: activeTrip.origin.lng,
              dest_lat: activeTrip.destination.lat,
              dest_long: activeTrip.destination.lng,
              departure_time: activeTrip.scheduledAt ?? new Date().toISOString(),
              role: searchMode ?? 'rider',
            }).catch(() => {});
          }
        }}
      />

      {/* My Location FAB — lifted above the bottom CommuteHomeCard while idle
          (its measured height varies by plan/no-plan state); otherwise the
          default offset that clears active-trip / search overlays. */}
      {(() => {
        const idleCardShown = !showPlanner && !activeTrip && searchStatus === 'idle';
        const fabBottom = idleCardShown && homeCardHeight > 0
          ? 100 + homeCardHeight + 12
          : 172;
        return (
          <TouchableOpacity
            style={[styles.myLocationBtn, isDark && styles.myLocationBtnDark, { bottom: fabBottom }]}
            onPress={centerToUserLocation}
            accessibilityRole="button"
            accessibilityLabel="Center map on my location"
          >
            <Text style={styles.myLocationBtnText} accessibilityElementsHidden importantForAccessibility="no">⊙</Text>
          </TouchableOpacity>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  // ===== CONTAINER & MAP =====
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  // ===== MAP-LOAD BRAND MASK =====
  mapMask: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  mapMaskLogo: {
    width: 120,
    height: 120,
    borderRadius: 28,
    shadowColor: "#003040",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },

  // ===== HOME / WORK PLACE PINS (Stage 2) =====
  placePin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#0B1A1F",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  placePinGlyph: {
    fontSize: 16,
    lineHeight: 20,
  },

  // ===== ACTIVE TRIP CARD =====
  activeCard: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: COLORS.black,
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  activeTripTitle: {
    fontWeight: "700",
    fontSize: 21,
    color: COLORS.black,
  },
  activeTripSubtitle: {
    color: COLORS.gray,
    marginTop: 4,
    fontSize: 13,
  },
  changeBtn: {
    backgroundColor: COLORS.black,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
  },
  changeBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  // ===== DAILY COMMUTE INTENT PILL =====
  // Positioned by the top-floating-stack container (not absolute itself).
  intentPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    shadowColor: "#0B1A1F",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    gap: 6,
  },
  intentPillLabel: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  intentPillSub: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },

  // ===== EMPTY STATE HINT (1.3) =====
  // Floats above the ActionDock when the user has nothing in flight.
  emptyStateCard: {
    position: "absolute",
    bottom: 180,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    shadowColor: "#0B1A1F",
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  emptyStateIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(38,198,218,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyStateSub: {
    fontSize: 12,
    fontWeight: "400",
    marginTop: 2,
    lineHeight: 16,
  },
  emptyStateInvite: {
    fontWeight: "600",
    fontSize: 10.5,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 8,
  },

  // ===== MY LOCATION FAB =====
  myLocationBtn: {
    position: "absolute",
    bottom: 172,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  myLocationBtnDark: {
    backgroundColor: "#1C1C1E",
  },
  myLocationBtnText: {
    fontSize: 22,
    color: COLORS.primary,
  },
  // ===== MAPBOX MARKER DOTS =====
  markerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  // ===== CUSTOM MARKER STYLES =====
  customMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  
  // ===== MATCH CARD STYLES (Bottom sheet) =====
  matchCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
    maxHeight: "72%",
    shadowColor: COLORS.black,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  matchHandle: {
    width: 40,
    height: 5,
    backgroundColor: "#E0E0E0",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 16,
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  matchAvatarContainer: {
    position: "relative",
  },
  matchAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  matchStatusDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  matchName: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.dark,
  },
  matchDept: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 4,
  },
  matchRoleBadge: {
    backgroundColor: COLORS.accent + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  matchRoleText: {
    fontSize: 11,
    color: COLORS.dark,
    fontWeight: "600",
  },
  matchCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  matchClose: {
    fontSize: 20,
    color: COLORS.gray,
    fontWeight: "400",
  },
  matchRouteContainer: {
    backgroundColor: COLORS.gray + "08",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  matchRouteLabel: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  matchRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  matchRouteLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.gray + "30",
    marginLeft: 16,
    marginVertical: 2,
  },
  routeDotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.green,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  routeDotBlue: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  matchRouteText: {
    fontSize: 14,
    color: COLORS.dark,
    flex: 1,
    fontWeight: "500",
  },
  matchActions: {
    gap: 12,
  },
  requestBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  requestBtnDisabled: {
    opacity: 0.6,
  },
  requestBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  viewProfileBtn: {
    backgroundColor: COLORS.white,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  viewProfileBtnDisabled: {
    opacity: 0.5,
  },
  viewProfileBtnText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  
  // ===== SEARCHING OVERLAY STYLES =====
  searchingOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  searchingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 32,
    alignItems: "center",
    width: "100%",
    shadowColor: COLORS.black,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  searchingIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  searchingTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.dark,
    marginBottom: 12,
    textAlign: "center",
  },
  searchingMessage: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  matchCountBadge: {
    backgroundColor: COLORS.green + "20",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
  },
  matchCountText: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.green,
  },
  searchingActions: {
    width: "100%",
    marginTop: 24,
  },
  cancelSearchBtn: {
    backgroundColor: COLORS.gray,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  cancelSearchBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  viewMatchesBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  viewMatchesBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "bold",
  },

  // ===== AI MATCH BUTTON =====
  aiMatchBtn: {
    position: "absolute",
    bottom: 170,
    alignSelf: "center",
    backgroundColor: COLORS.dark,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: COLORS.black,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  aiMatchBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
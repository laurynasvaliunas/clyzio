import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Vibration,
  Linking,
  Platform,
  ScrollView,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
// Gamification math (XP per trip, level math, badge thresholds) lives
// server-side in the `complete-trip` edge function. See audit C2.
import Mapbox, { MapView, Camera, PointAnnotation, ShapeSource, LineLayer, UserLocation, StyleImport } from "@rnmapbox/maps";
import { MAP_STYLE_3D, standardConfig } from "../../lib/map3d";
import { useTheme } from "../../contexts/ThemeContext";
import * as Location from "expo-location";
import { MessageCircle, Shield, X, Phone, AlertTriangle, Circle, MapPin, ChevronLeft, Leaf, Star } from "lucide-react-native";
import { modeIconFor } from "../../components/ModeIcon";
import { PartnerMarker } from "../../components/PartnerMarkers";
import {
  ageLabel,
  liveOpensAt,
  LIVE_RIDE_STATUSES,
  LIVE_STALE_MS,
  useLiveWindowOpen,
  useMatchPoints,
  usePartnerPosition,
} from "../../lib/liveLocation";
import { useLiveShareStore } from "../../store/useLiveShareStore";
import ChatModal from "../../components/ChatModal";
import SOSSheet from "../../components/SOSSheet";
import RatingSheet from "../../components/RatingSheet";
import { useToast } from "../../contexts/ToastContext";
import { completeTrip, co2Share } from "../../lib/completeTrip";
import { cancelRide } from "../../lib/cancelRide";

interface Ride {
  id: string;
  rider_id: string;
  driver_id: string | null;
  status: string;
  origin_lat: number;
  origin_long: number;
  origin_address?: string;
  share_origin_address?: boolean | null;
  dest_lat: number;
  dest_long: number;
  dest_address?: string;
  waypoints?: string; // JSON string of waypoint array
  transport_mode?: string;
  transport_label?: string;
  co2_saved: number;
  created_at: string;
  scheduled_at?: string | null;
}

interface Profile {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  car_make?: string;
  car_model?: string;
  car_color?: string;
  car_plate?: string;
}

import { MAPBOX_TOKEN, IS_MAPBOX_TOKEN_VALID } from "../../lib/config";
import { elevation as ELEVATION, depth } from "../../lib/theme/tokens";
if (IS_MAPBOX_TOKEN_VALID) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
  // Mapbox usage telemetry is off (privacy policy §5); maps work without it.
  Mapbox.setTelemetryEnabled(false);
}

// Editorial reskin — active ride uses the brand + paper-ink system.
// `white` kept true-white so glass overlays stay legible over the night map.
/** Solo modes with their own pictogram; anything else (carpool…) shows the car. */
const SOLO_MODES = new Set(["public", "my_car", "bike", "ebike", "walking", "taxi", "moto", "nomotor"]);

const COLORS = {
  primary: "#00565A",   // cyan
  accent: "#F59E0B",    // sun
  dark: "#0B1A1F",      // ink
  white: "#FFFFFF",
  gray50: "#F7F9FA",    // paper
  gray200: "#EDF1F2",   // paper-2
  gray400: "#8B989C",   // ink-4
  gray700: "#5A6A6F",   // ink-3
  red: "#DC2626",       // clay
  blue: "#00565A",
  green: "#059669",     // leaf
};

export default function TripScreen() {
  const { id, openChat, openRating } = useLocalSearchParams<{
    id: string;
    openChat?: string;
    openRating?: string;
  }>();
  const router = useRouter();
  const { showToast } = useToast();
  const mapRef = useRef<MapView>(null);
  const cameraRef = useRef<Camera>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const insets = useSafeAreaInsets(); // Safe area for notch/home bar

  const [ride, setRide] = useState<Ride | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null); // The other person (driver or rider)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isDark } = useTheme();
  // Standard (3D) style failed to load → fall back to the flat Dark style.
  const [flatMap, setFlatMap] = useState(false);
  // 1.4 — Loading watchdog. If the spinner is up for >5 s (slow auth resolve,
  // bad network, RLS hiccup) we flip to an explicit failure state with a
  // retry button instead of hanging silently. `retryNonce` is bumped on
  // retry so the fetch effect re-runs.
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  
  // GPS & Navigation states
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [distanceToDestination, setDistanceToDestination] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState(true); // Auto-start navigation
  
  // Modal states
  const [showChatModal, setShowChatModal] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [showSOSSheet, setShowSOSSheet] = useState(false);
  const [showRatingSheet, setShowRatingSheet] = useState(false);

  // Fetch current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getUser();
  }, []);

  // Fetch ride details and partner info
  useEffect(() => {
    // Wait until we know who the user is — the early-return used to skip
    // setIsLoading(false), leaving the screen stuck on a spinner forever when
    // the auth session was slow to resolve.
    if (!id || !currentUserId) return;

    let cancelled = false;
    const fetchRideData = async () => {
      try {
        const { data: rideData, error: rideError } = await supabase
          .from("rides")
          .select("*")
          .eq("id", id)
          .single();

        if (cancelled) return;

        if (rideError) {
          console.error("Error fetching ride:", rideError);
          showToast({ title: 'Error', message: 'Could not load ride details', type: 'error' });
          return;
        }

        setRide(rideData);

        const partnerId = rideData.driver_id === currentUserId
          ? rideData.rider_id
          : rideData.driver_id;

        if (partnerId) {
          // The peer's profile row is RLS-blocked for non-same-company users, so
          // resolve safe display fields (name/avatar) via the is_peer_visible-
          // gated get_public_profiles RPC instead of a direct select.
          const { data: pub } = await supabase.rpc("get_public_profiles", { p_ids: [partnerId] });
          const peer = Array.isArray(pub) ? pub[0] : null;
          if (!cancelled && peer) setPartner(peer as any);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchRideData();
    return () => { cancelled = true; };
  }, [id, currentUserId, retryNonce]);

  // 1.4 — 5-second watchdog. While `isLoading` is true and we haven't
  // already failed once, arm a timer; if it fires the user sees a retry UI.
  useEffect(() => {
    if (!isLoading || loadFailed) return;
    const t = setTimeout(() => setLoadFailed(true), 5000);
    return () => clearTimeout(t);
  }, [isLoading, loadFailed]);

  // Notification deep links (/trip/<id>?openChat=1 | openRating=1): open the
  // requested sheet once, after the ride has loaded.
  const openedFromParamsRef = useRef(false);
  useEffect(() => {
    if (openedFromParamsRef.current || isLoading || !ride) return;
    openedFromParamsRef.current = true;
    if (openChat === "1") setShowChatModal(true);
    else if (openRating === "1") setShowRatingSheet(true);
  }, [isLoading, ride, openChat, openRating]);

  const handleRetryLoad = () => {
    setLoadFailed(false);
    setIsLoading(true);
    setRetryNonce((n) => n + 1);
  };

  // GPS Auto-Arrival Logic
  useEffect(() => {
    // CRITICAL: Disable GPS tracking for completed/cancelled trips (History items)
    if (!ride || !isNavigating || ride.status === "completed" || ride.status === "cancelled") {
      setIsNavigating(false);
      return;
    }

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast({ title: 'Permission Denied', message: 'Location access is required for navigation.', type: 'warning' });
        return;
      }

      // Watch position
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10, // Update every 10 meters
        },
        (location) => {
          setCurrentLocation(location);

          // Calculate distance to destination using Haversine
          const distance = haversineDistance(
            location.coords.latitude,
            location.coords.longitude,
            ride.dest_lat,
            ride.dest_long
          );

          setDistanceToDestination(distance);

          // Trigger arrival modal if < 200m
          if (distance < 0.2 && !showArrivalModal) {
            Vibration.vibrate([0, 200, 100, 200]); // Double vibrate
            setShowArrivalModal(true);
          }
        }
      );

      locationSubscription.current = subscription;
    };

    startTracking();

    // Cleanup
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, [ride, isNavigating, showArrivalModal]);

  // H5: explicitly drop the Mapbox MapView ref on unmount so the native
  // instance can be released by RN's view recycler. Prevents memory creep
  // when navigating in/out of trip details repeatedly.
  useEffect(() => {
    return () => {
      mapRef.current = null;
    };
  }, []);

  // Haversine distance formula (returns km)
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // 1.5 — Award current user's XP / CO₂ / badges via the `complete-trip` edge
  // function. Audit C2: profile counters are protected against direct client
  // writes by migration 018; this server path is the only legitimate writer.
  //
  // `endTripStatus=true` (driver / solo) tells the server to mark the ride
  // completed. Passengers pass `false` so the driver still controls the ride
  // lifecycle while the passenger collects their own credit.
  //
  // Returns the credited deltas, or null when nothing was credited (an error
  // toast has already been shown) so callers never celebrate a failure.
  const awardCurrentUserStats = async (
    endTripStatus: boolean,
  ): Promise<{ xp: number; co2: number } | null> => {
    if (!ride || !currentUserId || !id) return null;

    const outcome = await completeTrip(id, endTripStatus);
    if (!outcome.ok) {
      showToast({ title: "Couldn't complete trip", message: outcome.message, type: "error" });
      return null;
    }
    if (outcome.data.already_completed) {
      showToast({ title: "Already counted", message: "This trip is already in your history.", type: "info" });
      return null;
    }
    // co2_saved is the amount actually credited to THIS user (carpool = half).
    return { xp: outcome.data.xp_earned ?? 0, co2: outcome.data.co2_saved ?? 0 };
  };

  // Driver / solo path — ends the ride and awards the current user's stats.
  const handleCompleteTr = async () => {
    if (!ride || !currentUserId) return;

    // Close modal IMMEDIATELY before async operations
    setShowArrivalModal(false);
    setIsNavigating(false);

    const credited = await awardCurrentUserStats(true);
    if (!credited) return;
    const { xp: xpEarned, co2: co2Saved } = credited;

    showToast({ title: 'Trip Complete!', message: `You earned ${xpEarned} XP and saved ${co2Saved.toFixed(2)} kg CO₂!`, type: 'success' });

    // Only prompt for a rating on shared carpool trips (where there's an
    // actual partner to rate). Solo walking / cycling trips skip this.
    const isCarpool = !!(ride.driver_id && ride.rider_id);
    if (isCarpool) {
      setShowRatingSheet(true);
    } else {
      router.push("/(tabs)/activity");
    }
  };

  // 1.5 — Passenger arrival path. Awards the passenger's own XP/CO₂ but
  // does NOT update `rides.status` — only the driver should end the ride.
  // Goes straight into the rating sheet to keep the social loop tight.
  const handlePassengerArrival = async () => {
    if (!ride || !currentUserId) return;

    setShowArrivalModal(false);
    setIsNavigating(false);

    const credited = await awardCurrentUserStats(false);
    if (!credited) return;
    const { xp: xpEarned, co2: co2Saved } = credited;

    showToast({
      title: "You've arrived!",
      message: `${xpEarned} XP and ${co2Saved.toFixed(2)} kg CO₂ saved. Don't forget to rate your driver.`,
      type: 'success',
    });

    setShowRatingSheet(true);
  };

  // Cancel ride
  const handleCancelRide = async () => {
    Alert.alert("Cancel Ride", "Are you sure you want to cancel this ride?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          if (!id) return;
          // cancel-ride also releases a confirmed carpool and tells the partner.
          const outcome = await cancelRide(id);
          if (!outcome.ok) {
            showToast({ title: "Couldn't cancel", message: outcome.message, type: "error" });
            return;
          }
          router.back();
        },
      },
    ]);
  };

  // Safety actions — upgraded SOS sheet is rendered separately; this is
  // only the trigger used by the legacy button inside the safety modal.
  const handleEmergencyCall = () => {
    setShowSafetyModal(false);
    setShowSOSSheet(true);
  };

  // Opens the system share sheet with the ride details so the user can send
  // them to someone they trust (there's no in-app contact list).
  const handleShareRide = async () => {
    if (!ride) return;
    setShowSafetyModal(false);

    const lines: string[] = ["I'm on a Clyzio commute."];
    // A driver must not forward a passenger's private pickup address.
    const mayShareOrigin = currentUserId === ride.rider_id || ride.share_origin_address !== false;
    const from = mayShareOrigin ? ride.origin_address : undefined;
    if (from || ride.dest_address) {
      lines.push(`Route: ${from || "pickup"} → ${ride.dest_address || "destination"}`);
    }
    if (ride.scheduled_at) {
      const when = new Date(ride.scheduled_at).toLocaleString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      lines.push(`Departure: ${when}`);
    }
    if (partner) {
      const name = [partner.first_name, partner.last_name].filter(Boolean).join(" ");
      const partnerDrives = ride.driver_id === partner.id;
      if (name) lines.push(`${partnerDrives ? "Driver" : "Passenger"}: ${name}`);
      const car = [partner.car_color, partner.car_make, partner.car_model].filter(Boolean).join(" ");
      if (partnerDrives && (car || partner.car_plate)) {
        lines.push(`Car: ${car}${partner.car_plate ? ` (${partner.car_plate})` : ""}`.trim());
      }
    }
    if (currentLocation) {
      const { latitude, longitude } = currentLocation.coords;
      lines.push(`My location: https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`);
    }

    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      showToast({ title: "Couldn't open sharing", message: "Please try again.", type: "error" });
    }
  };

  // ── Partner on the map (052) ─────────────────────────────────────────────
  // Before the trip: their approximate start area. From 15 min before pickup:
  // their live position, while their Clyzio is open.
  const isCarpool = !!ride?.driver_id && !!ride?.rider_id;
  const partnerUserId =
    ride && currentUserId ? (ride.driver_id === currentUserId ? ride.rider_id : ride.driver_id) : null;
  const meetingPoints = useMatchPoints(isCarpool && ride ? { rideId: ride.id } : null);
  const liveOpen = useLiveWindowOpen(isCarpool ? ride?.scheduled_at : null, ride?.status);
  const partnerLive = usePartnerPosition(ride?.id, partnerUserId, liveOpen);
  const sharingHere = useLiveShareStore((s) => !!ride && s.sharingRideIds.includes(ride.id));
  const needsLocation = useLiveShareStore((s) => s.needsPermission);
  const pokeSharer = useLiveShareStore((s) => s.poke);

  const handleShareLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") pokeSharer();
    else showToast({ title: "Location is off", message: "Allow location for Clyzio in Settings to share it.", type: "warning" });
  };

  if (isLoading) {
    if (loadFailed) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { fontWeight: '600', color: COLORS.dark }]}>
            Couldn&apos;t load trip details
          </Text>
          <Text style={[styles.loadingText, { marginTop: 4, fontSize: 13 }]}>
            Check your connection and try again.
          </Text>
          <TouchableOpacity
            onPress={handleRetryLoad}
            style={styles.backButtonAlt}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.backButtonAltText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={{ color: COLORS.gray700, fontSize: 13 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading ride details...</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Ride not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButtonAlt}>
          <Text style={styles.backButtonAltText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Parse waypoints from JSON string
  let waypoints: any[] = [];
  if (ride.waypoints) {
    try {
      waypoints = JSON.parse(ride.waypoints);
    } catch (error) {
      console.error('Error parsing waypoints:', error);
    }
  }

  const partnerName = partner?.first_name 
    ? `${partner.first_name} ${partner.last_name || ""}`.trim()
    : "Your Partner";

  const isDriver = ride.driver_id === currentUserId;

  // Passenger pickup privacy: hide the exact origin from the DRIVER until the
  // driver has confirmed (status ≥ accepted). Rider always sees own address.
  const driverConfirmed = ["accepted", "in_progress", "completed"].includes(ride.status);
  const hideOrigin =
    isDriver && ride.share_origin_address === false && !driverConfirmed;
  const coarsen = (n: number) => Math.round(n * 300) / 300; // ~300 m grid
  const originLat = hideOrigin ? coarsen(ride.origin_lat) : ride.origin_lat;
  const originLng = hideOrigin ? coarsen(ride.origin_long) : ride.origin_long;

  // A carpool has BOTH a driver and a rider; a solo trip has only one. Decide
  // this from the ride itself — NOT from `partner`, whose profile can be
  // RLS-limited for cross-company peers (that mislabeled carpools as solo).
  const isSoloTrip = !ride.driver_id || !ride.rider_id;
  
  // Transport mode icon; carpools and unknown modes show the car, as before.
  const TransportIcon = SOLO_MODES.has(ride.transport_mode ?? "")
    ? modeIconFor(ride.transport_mode)
    : modeIconFor("my_car");
  
  // Calculate trip distance using Haversine
  const tripDistance = haversineDistance(
    ride.origin_lat,
    ride.origin_long,
    ride.dest_lat,
    ride.dest_long
  );

  // C2 fallback: render placeholder if Mapbox token is missing/malformed.
  if (!IS_MAPBOX_TOKEN_VALID) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.dark, marginBottom: 8 }}>
          Map unavailable
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.gray700, textAlign: 'center' }}>
          We couldn&apos;t load the trip map. Please reinstall the latest version of Clyzio.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Full-screen Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          // 3D city at dusk (night in dark mode); flat Dark if Standard fails.
          styleURL={flatMap ? Mapbox.StyleURL.Dark : MAP_STYLE_3D}
          onMapLoadingError={() => setFlatMap(true)}
          logoEnabled
          attributionEnabled
          scaleBarEnabled={false} // sat beside the back button
        >
          {!flatMap && <StyleImport id="basemap" existing config={standardConfig(isDark ? "night" : "dusk")} />}
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [
                (ride.origin_long + ride.dest_long) / 2,
                (ride.origin_lat + ride.dest_lat) / 2,
              ],
              zoomLevel: 12,
              pitch: 55,
              heading: -20,
            }}
          />

          <UserLocation visible />

          {/* Route Line */}
          <ShapeSource
            id="route"
            shape={{
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [originLng, originLat],
                  ...waypoints.map((wp: any) => [wp.lng, wp.lat]),
                  [ride.dest_long, ride.dest_lat],
                ],
              },
              properties: {},
            }}
          >
            <LineLayer
              id="routeGlow"
              slot="middle"
              style={{ lineColor: "#34D399", lineWidth: 16, lineBlur: 10, lineOpacity: 0.4, lineJoin: "round", lineCap: "round", lineEmissiveStrength: 1 }}
            />
            <LineLayer
              id="routeLine"
              slot="middle"
              style={{ lineColor: "#7FD3D6", lineWidth: 4.5, lineJoin: "round", lineCap: "round", lineEmissiveStrength: 1 }}
            />
          </ShapeSource>

          {/* Origin Marker */}
          <PointAnnotation id="origin" coordinate={[originLng, originLat]}>
            <View collapsable={false} style={[styles.markerDot, { backgroundColor: "#059669" }]} />
          </PointAnnotation>

          {/* Waypoint Markers */}
          {waypoints.map((waypoint: any, index: number) => (
            <PointAnnotation
              key={`waypoint-${index}`}
              id={`waypoint-${index}`}
              coordinate={[waypoint.lng, waypoint.lat]}
            >
              <View collapsable={false} style={[styles.markerDot, { backgroundColor: COLORS.accent }]} />
            </PointAnnotation>
          ))}

          {/* Destination Marker */}
          <PointAnnotation id="destination" coordinate={[ride.dest_long, ride.dest_lat]}>
            <View collapsable={false} style={[styles.markerDot, { backgroundColor: COLORS.red }]} />
          </PointAnnotation>

          {/* Partner: approximate start area, live from 15 min before pickup. */}
          {isCarpool && partnerUserId && (
            <PartnerMarker
              id={partnerUserId}
              name={partner?.first_name ?? (isDriver ? "Passenger" : "Driver")}
              start={meetingPoints?.partnerStart ?? null}
              live={partnerLive}
            />
          )}
        </MapView>

        {/* Back Button Overlay */}
        <TouchableOpacity hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          style={[styles.backButtonOverlay, { top: insets.top + 10 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={COLORS.dark} />
        </TouchableOpacity>

        {/* Distance Badge */}
        {isNavigating && distanceToDestination > 0 && (
          <View style={[styles.distanceBadge, { top: insets.top + 10 }]}>
            <Text style={styles.distanceBadgeText}>
              {distanceToDestination < 1
                ? `${(distanceToDestination * 1000).toFixed(0)} m`
                : `${distanceToDestination.toFixed(1)} km`}
            </Text>
            <Text style={styles.distanceBadgeLabel}>to destination</Text>
          </View>
        )}
      </View>

      {/* Bottom Sheet: Ride Dashboard (overlays map) */}
      <View style={styles.dashboard}>
        {/* Drag Handle */}
        <View style={styles.dragHandle} />

        {/* SCROLLABLE CONTENT */}
        <ScrollView 
          style={styles.scrollContent}
          contentContainerStyle={{
            paddingBottom: ride.status === "completed" || ride.status === "cancelled" ? 20 : 120,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. HEADER: Icon + Mode + Distance — horizontal row */}
          <View style={styles.headerSection}>
            <View style={styles.modeIconCircle}>
              <TransportIcon size={26} color={COLORS.white} strokeWidth={1.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modeLabel}>
                {ride.transport_label || "Commuting"} • {isSoloTrip ? "Solo" : isDriver ? "Driving" : "Riding"}
              </Text>
              <Text style={styles.distanceLabelHeader}>
                {tripDistance.toFixed(1)} km trip
              </Text>
            </View>
          </View>

          {/* 2. ROUTE INFORMATION: Timeline Style */}
          <View style={styles.routeCard}>
            {/* Origin */}
            <View style={styles.routeRow}>
              <View style={styles.routeIconContainer}>
                <Circle size={16} color={COLORS.primary} strokeWidth={2} />
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeLabel}>Starting Point</Text>
                <Text style={styles.routeAddress} numberOfLines={3}>
                  {hideOrigin ? "Pickup area" : (ride.origin_address || "Origin")}
                </Text>
              </View>
            </View>

            {/* Connector Line - Flexible Height */}
            <View style={styles.routeConnector}>
              <View style={styles.dottedLine} />
            </View>

            {/* Destination */}
            <View style={styles.routeRow}>
              <View style={styles.routeIconContainer}>
                <MapPin size={16} color={COLORS.red} fill={COLORS.red} />
              </View>
              <View style={styles.routeContent}>
                <Text style={styles.routeLabel}>Destination</Text>
                <Text style={styles.routeAddress} numberOfLines={3}>
                  {ride.dest_address || "Destination"}
                </Text>
              </View>
            </View>

            {/* CO₂ Savings Badge — carpool splits the saving 50/50, so show each
                person's share here (matches what completion credits). */}
            <View style={[styles.co2Badge, { flexDirection: "row", justifyContent: "center", gap: 6 }]}>
              <Leaf size={16} color={COLORS.primary} />
              <Text style={styles.co2BadgeText}>
                Saving {co2Share(ride).toFixed(2)} kg CO₂{isSoloTrip ? "" : " (your share)"}
              </Text>
            </View>
          </View>

          {/* Manual completion — the arrival modal is GPS-gated (fires within
              200 m); this lets either party end the trip when needed. The modal
              routes to the correct action by role (driver/solo complete, rider rate). */}
          {ride.status !== "completed" && ride.status !== "cancelled" && (
            <TouchableOpacity
              style={styles.endTripBtn}
              onPress={() => setShowArrivalModal(true)}
              accessibilityRole="button"
              accessibilityLabel="End trip now"
            >
              <Text style={styles.endTripBtnText}>
                {isSoloTrip || isDriver ? "End trip & save CO₂" : "I've arrived"}
              </Text>
            </TouchableOpacity>
          )}

          {/* 3. CONDITIONAL: Partner Info (Only for Driver/Rider) */}
          {!isSoloTrip && partner && (
            <View style={styles.partnerCard}>
              <View style={styles.partnerAvatar}>
                <Text style={styles.partnerAvatarText}>
                  {partner?.first_name?.charAt(0) || "?"}
                </Text>
              </View>
              <View style={styles.partnerInfo}>
                <Text style={styles.partnerName}>{partnerName}</Text>
                <Text style={styles.partnerRole}>
                  {isDriver ? "Passenger" : "Driver"}
                  {partner?.car_model && ` • ${partner.car_model}`}
                </Text>
              </View>
            </View>
          )}

          {/* Live locations (052) */}
          {isCarpool && LIVE_RIDE_STATUSES.includes(ride.status) && !!ride.scheduled_at && (
            <View style={styles.liveCard}>
              {liveOpen ? (
                <>
                  <View style={styles.liveRow}>
                    <View
                      style={[
                        styles.liveDot,
                        {
                          backgroundColor:
                            partnerLive && Date.now() - new Date(partnerLive.updatedAt).getTime() < LIVE_STALE_MS
                              ? COLORS.green
                              : COLORS.gray400,
                        },
                      ]}
                    />
                    <Text style={styles.liveText}>
                      {partnerLive
                        ? `${partnerName} · location updated ${ageLabel(partnerLive.updatedAt)}`
                        : `${partnerName}'s location appears when they open Clyzio`}
                    </Text>
                  </View>
                  {sharingHere ? (
                    <Text style={styles.liveSub}>You're sharing your live location until the ride ends.</Text>
                  ) : needsLocation ? (
                    <TouchableOpacity
                      style={styles.liveShareBtn}
                      onPress={handleShareLocation}
                      accessibilityRole="button"
                      accessibilityLabel="Share my location"
                    >
                      <MapPin size={16} color={COLORS.primary} />
                      <Text style={styles.liveShareText}>Share my location</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <View style={styles.liveRow}>
                  <MapPin size={16} color={COLORS.gray700} />
                  <Text style={styles.liveText}>
                    {`Live locations turn on at ${liveOpensAt(ride.scheduled_at)}, 15 min before pickup.`}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Read-Only Summary for Completed/Cancelled */}
          {(ride.status === "completed" || ride.status === "cancelled") && (
            <View style={styles.completedSummary}>
              <Text style={styles.completedTitle}>
                {ride.status === "completed" ? "Trip completed" : "Trip Cancelled"}
              </Text>
              {ride.status === "completed" && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{isSoloTrip ? "CO₂ Saved:" : "Your CO₂ share:"}</Text>
                  <Text style={styles.summaryValue}>{co2Share(ride).toFixed(2)} kg</Text>
                </View>
              )}
              <TouchableOpacity style={styles.backToActivityBtn} onPress={() => router.push("/(tabs)/activity")}>
                <Text style={styles.backToActivityText}>← Back to Activity</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* 4. STICKY ACTION BUTTONS (Outside ScrollView) - Only for Active Trips */}
        {ride.status !== "completed" && ride.status !== "cancelled" && (
          <View style={[styles.stickyActionFooter, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.actionGrid}>
              {/* Chat for carpools (driver + rider). Not gated on `partner`: the
                  name lookup can come back empty, and the chat works without it. */}
              {!isSoloTrip && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => setShowChatModal(true)}
                >
                  <MessageCircle size={24} color={COLORS.primary} />
                  <Text style={styles.actionButtonText}>Chat</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowSafetyModal(true)}
              >
                <Shield size={24} color={COLORS.blue} />
                <Text style={styles.actionButtonText}>Safety</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={handleCancelRide}
              >
                <X size={24} color={COLORS.red} />
                <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Chat Modal */}
      {currentUserId && (
        <ChatModal
          visible={showChatModal}
          onClose={() => setShowChatModal(false)}
          thread={{ rideId: id as string }}
          currentUserId={currentUserId}
          partnerName={partnerName}
        />
      )}

      {/* SOS sheet — locale-aware emergency number + live-location share */}
      <SOSSheet
        visible={showSOSSheet}
        onClose={() => setShowSOSSheet(false)}
        rideId={id as string}
      />

      {/* Post-trip rating (only shown for carpool rides, see handleCompleteTr) */}
      {currentUserId && partner && (
        <RatingSheet
          visible={showRatingSheet}
          rideId={id as string}
          ratedId={partner.id}
          partnerName={partnerName}
          ratedRole={isDriver ? "passenger" : "driver"}
          onClose={() => {
            setShowRatingSheet(false);
            router.push("/(tabs)/activity");
          }}
        />
      )}

      {/* Safety Modal */}
      <Modal
        visible={showSafetyModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSafetyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.safetyModal}>
            <Text style={styles.safetyModalTitle}>Safety toolkit</Text>
            
            <TouchableOpacity style={styles.safetyOption} onPress={handleShareRide}>
              <AlertTriangle size={20} color={COLORS.blue} />
              <Text style={styles.safetyOptionText}>Share Ride Details</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.safetyOption} onPress={handleEmergencyCall}>
              <Phone size={20} color={COLORS.red} />
              <Text style={styles.safetyOptionText}>Emergency Call (SOS)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.safetyCloseBtn}
              onPress={() => setShowSafetyModal(false)}
            >
              <Text style={styles.safetyCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Arrival Modal — 1.5: branched by role.
          • Driver / solo: ends the ride lifecycle (status → completed).
          • Passenger: awards own stats and routes to rating; the driver
            still owns the actual ride completion. */}
      <Modal
        visible={showArrivalModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowArrivalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.arrivalModal}>
            <Text style={styles.arrivalTitle}>You&apos;ve arrived</Text>
            <Text style={styles.arrivalSubtitle}>
              {isSoloTrip || isDriver
                ? `CO₂ Saved: ${co2Share(ride).toFixed(2)} kg${isSoloTrip ? "" : " (your share)"}`
                : `Don't forget to rate ${partnerName.split(' ')[0] || 'your driver'}.`}
            </Text>
            <View style={styles.arrivalIcon}>
              {isSoloTrip || isDriver ? (
                <Leaf size={36} color={COLORS.primary} />
              ) : (
                <Star size={36} color={COLORS.accent} />
              )}
            </View>

            {isSoloTrip || isDriver ? (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleCompleteTr}
                accessibilityRole="button"
                accessibilityLabel="Confirm arrival and collect XP"
              >
                <Text style={styles.confirmButtonText}>Confirm & Collect XP</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handlePassengerArrival}
                accessibilityRole="button"
                accessibilityLabel="Rate your driver"
              >
                <Text style={styles.confirmButtonText}>Rate your driver</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setShowArrivalModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss arrival prompt"
            >
              <Text style={styles.notYetText}>Not yet...</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.gray50,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.gray700,
  },
  backButtonAlt: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
  },
  backButtonAltText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "600",
  },
  
  // Map Section — fills the whole screen; dashboard overlays on top
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  map: {
    flex: 1,
  },
  markerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  backButtonOverlay: {
    position: "absolute",
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    backgroundColor: COLORS.white,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(11,26,31,0.08)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: ELEVATION.light.e2,
  },
  distanceBadge: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    boxShadow: ELEVATION.light.e2,
  },
  distanceBadgeText: {
    fontWeight: "700",
    fontSize: 24,
    color: COLORS.primary,
  },
  distanceBadgeLabel: {
    fontWeight: "600",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.gray700,
    textAlign: "center",
    marginTop: 3,
  },

  // Dashboard — absolute overlay from bottom (Google Maps / Uber style)
  dashboard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "62%",
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.9)",
    boxShadow: ELEVATION.light.up,
  },
  dragHandle: {
    width: 44,
    height: 5,
    backgroundColor: COLORS.gray200,
    borderRadius: 3,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },

  // 1. Header Section — compact horizontal row to save space
  headerSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 12,
  },
  modeIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.emboss,
  },
  modeLabel: {
    fontWeight: "700",
    fontSize: 21,
    color: COLORS.dark,
    marginBottom: 2,
  },
  distanceLabelHeader: {
    fontSize: 13,
    color: COLORS.gray700,
    fontWeight: "500",
  },

  // 2. Route Card (Timeline Style)
  routeCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    boxShadow: "inset 0px 1px 2px rgba(255,255,255,0.9), 0px 6px 16px rgba(11,26,31,0.05)",
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  routeIconContainer: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  routeContent: {
    flex: 1,
  },
  routeLabel: {
    fontWeight: "600",
    fontSize: 11,
    letterSpacing: 0.8,
    color: COLORS.gray700,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  routeAddress: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.dark,
    lineHeight: 20,
    flexWrap: "wrap",
  },
  routeConnector: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    minHeight: 24,
    marginVertical: 8,
  },
  dottedLine: {
    width: 2,
    minHeight: 24,
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gray400,
    borderStyle: "dotted",
  },
  co2Badge: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    alignItems: "center",
  },
  co2BadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.primary,
  },
  endTripBtn: {
    marginTop: 16,
    marginBottom: 16, // was flush against the partner card below
    minHeight: 48,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  endTripBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },

  // 3. Partner Card (Conditional)
  liveCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    gap: 8,
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  liveText: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.dark },
  liveSub: { fontSize: 13, color: COLORS.gray700 },
  liveShareBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  liveShareText: { fontSize: 14, fontWeight: "600", color: COLORS.primary },
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gray50,
    padding: 16,
    borderRadius: 22,
    boxShadow: "inset 0px 1px 2px rgba(255,255,255,0.9), 0px 6px 16px rgba(11,26,31,0.05)",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  partnerAvatar: {
    width: 56,
    height: 56,
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.emboss,
  },
  partnerAvatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.white,
  },
  partnerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  partnerName: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.dark,
  },
  partnerRole: {
    fontSize: 14,
    color: COLORS.gray700,
    marginTop: 4,
    fontWeight: "500",
  },

  // 4. Sticky Action Footer (Outside ScrollView)
  stickyActionFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingTop: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    boxShadow: ELEVATION.light.up,
  },
  actionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.embossLight,
  },
  actionButtonDanger: {
    borderColor: COLORS.red + "30",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.dark,
    marginTop: 6,
  },
  actionButtonTextDanger: {
    color: COLORS.red,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  safetyModal: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
  },
  safetyModalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.dark,
    marginBottom: 20,
    textAlign: "center",
  },
  safetyOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gray50,
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  safetyOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.dark,
    marginLeft: 12,
  },
  safetyCloseBtn: {
    backgroundColor: COLORS.gray200,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
  },
  safetyCloseBtnText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.gray700,
  },

  // Arrival Modal
  arrivalModal: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
    alignItems: "center",
  },
  arrivalTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.dark,
    marginBottom: 8,
  },
  arrivalSubtitle: {
    fontSize: 16,
    color: COLORS.gray700,
    marginBottom: 20,
  },
  arrivalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0,86,90,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  confirmButton: {
    minHeight: 56,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
    width: "100%",
    marginBottom: 12,
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  notYetText: {
    fontSize: 15,
    color: COLORS.gray700,
    marginTop: 8,
  },

  // Completed Trip Summary (Read-Only)
  completedSummary: {
    backgroundColor: COLORS.gray50,
    padding: 20,
    borderRadius: 20,
    alignItems: "center",
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: COLORS.gray700,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 15,
    color: COLORS.dark,
    fontWeight: "700",
  },
  backToActivityBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.gray200,
  },
  backToActivityText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.dark,
  },
});

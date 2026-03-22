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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import { MessageCircle, Shield, X, Phone, AlertTriangle, Car, Footprints, Bike, Zap, Bus, Navigation as NavIcon, Circle, MapPin } from "lucide-react-native";
import ChatModal from "../../components/ChatModal";

interface Ride {
  id: string;
  rider_id: string;
  driver_id: string | null;
  status: string;
  origin_lat: number;
  origin_long: number;
  origin_address?: string;
  dest_lat: number;
  dest_long: number;
  dest_address?: string;
  waypoints?: string; // JSON string of waypoint array
  transport_mode?: string;
  transport_label?: string;
  co2_saved: number;
  created_at: string;
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

const GOOGLE_MAPS_API_KEY_IOS = "AIzaSyAaQG2TsYZO_Ibp9sohoNS1XS-1DZ7UPwg";
const GOOGLE_MAPS_API_KEY_ANDROID = "AIzaSyCRyIfMk8bJeoeLIGkRUqmdTpSc8dnTXbY";
const GOOGLE_MAPS_API_KEY = Platform.OS === "ios" ? GOOGLE_MAPS_API_KEY_IOS : GOOGLE_MAPS_API_KEY_ANDROID;

const COLORS = {
  primary: "#10B981",
  accent: "#FDE047",
  dark: "#0F172A",
  white: "#FFFFFF",
  gray50: "#F8FAFC",
  gray200: "#E2E8F0",
  gray400: "#94A3B8",
  gray700: "#334155",
  red: "#EF4444",
  blue: "#3B82F6",
};

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const insets = useSafeAreaInsets(); // Safe area for notch/home bar

  const [ride, setRide] = useState<Ride | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null); // The other person (driver or rider)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // GPS & Navigation states
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [distanceToDestination, setDistanceToDestination] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState(true); // Auto-start navigation
  
  // Modal states
  const [showChatModal, setShowChatModal] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);

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
    const fetchRideData = async () => {
      if (!id || !currentUserId) return;

      // Fetch ride
      const { data: rideData, error: rideError } = await supabase
        .from("rides")
        .select("*")
        .eq("id", id)
        .single();

      if (rideError) {
        console.error("Error fetching ride:", rideError);
        Alert.alert("Error", "Could not load ride details");
        setIsLoading(false);
        return;
      }

      setRide(rideData);

      // Determine who the partner is (the other person)
      const partnerId = rideData.driver_id === currentUserId 
        ? rideData.rider_id 
        : rideData.driver_id;

      if (partnerId) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", partnerId)
          .single();

        setPartner(profileData);
      }

      setIsLoading(false);
    };

    fetchRideData();
  }, [id, currentUserId]);

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
        Alert.alert("Permission Denied", "Location access is required for navigation.");
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

  // Complete trip and award XP
  const handleCompleteTr = async () => {
    if (!ride || !currentUserId) return;

    // CRITICAL: Close modal IMMEDIATELY before async operations
    setShowArrivalModal(false);
    setIsNavigating(false); // Stop GPS tracking

    // Update ride status
    await supabase
      .from("rides")
      .update({ status: "completed" })
      .eq("id", id);

    // Award XP (10 XP per km saved)
    const xpEarned = Math.round(ride.co2_saved * 10);
    const { data: profile } = await supabase
      .from("profiles")
      .select("xp_points")
      .eq("id", currentUserId)
      .single();

    if (profile) {
      await supabase
        .from("profiles")
        .update({ xp_points: (profile.xp_points || 0) + xpEarned })
        .eq("id", currentUserId);
    }

    Alert.alert(
      "Trip Complete! 🎉",
      `You earned ${xpEarned} XP and saved ${ride.co2_saved.toFixed(2)} kg CO₂!`,
      [{ text: "Awesome!", onPress: () => router.push("/(tabs)/activity") }]
    );
  };

  // Cancel ride
  const handleCancelRide = async () => {
    Alert.alert("Cancel Ride", "Are you sure you want to cancel this ride?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          if (id) {
            await supabase
              .from("rides")
              .update({ status: "cancelled" })
              .eq("id", id);
          }
          router.back();
        },
      },
    ]);
  };

  // Safety actions
  const handleEmergencyCall = () => {
    Alert.alert("Emergency Call", "Call emergency services?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Call 112",
        style: "destructive",
        onPress: () => Linking.openURL("tel:112"),
      },
    ]);
  };

  const handleShareRide = () => {
    Alert.alert("Share Ride", "Ride details shared with your emergency contacts.");
  };

  if (isLoading) {
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
  
  // Determine if this is a solo trip (both driver_id and rider_id point to the same user, or one is null for solo)
  const isSoloTrip = !ride.driver_id || !partner;
  
  // Get transport mode icon
  const getTransportIcon = () => {
    switch (ride.transport_mode) {
      case "walking": return Footprints;
      case "bike": return Bike;
      case "ebike": return Zap;
      case "moto": return NavIcon;
      case "public": return Bus;
      case "my_car": return Car;
      default: return Car;
    }
  };
  
  const TransportIcon = getTransportIcon();
  
  // Calculate trip distance using Haversine
  const tripDistance = haversineDistance(
    ride.origin_lat,
    ride.origin_long,
    ride.dest_lat,
    ride.dest_long
  );

  return (
    <View style={styles.container}>
      {/* Top 60%: Map View */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: (ride.origin_lat + ride.dest_lat) / 2,
            longitude: (ride.origin_long + ride.dest_long) / 2,
            latitudeDelta: Math.abs(ride.dest_lat - ride.origin_lat) * 2 || 0.05,
            longitudeDelta: Math.abs(ride.dest_long - ride.origin_long) * 2 || 0.05,
          }}
        >
          {/* Route Polyline with Waypoints */}
          <MapViewDirections
            origin={{ latitude: ride.origin_lat, longitude: ride.origin_long }}
            destination={{ latitude: ride.dest_lat, longitude: ride.dest_long }}
            waypoints={waypoints.length > 0 ? waypoints.map((wp: any) => ({
              latitude: wp.lat,
              longitude: wp.lng,
            })) : undefined}
            apikey={GOOGLE_MAPS_API_KEY}
            strokeWidth={4}
            strokeColor={COLORS.primary}
          />

          {/* Origin Marker (Green) */}
          <Marker
            coordinate={{ latitude: ride.origin_lat, longitude: ride.origin_long }}
            title="Start"
            pinColor="#10B981" // Green
          />

          {/* Waypoint Markers (Yellow/Gold - Kindergarten/School) */}
          {waypoints.map((waypoint: any, index: number) => (
            <Marker
              key={`waypoint-${index}`}
              coordinate={{ latitude: waypoint.lat, longitude: waypoint.lng }}
              title={waypoint.description || `Stop ${index + 1}`}
              pinColor={COLORS.accent} // Yellow/Gold
            />
          ))}

          {/* Destination Marker (Red) */}
          <Marker
            coordinate={{ latitude: ride.dest_lat, longitude: ride.dest_long }}
            title="Destination"
            pinColor={COLORS.red}
          />

          {/* Current Location Marker (if tracking) */}
          {currentLocation && (
            <Marker
              coordinate={{
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
              }}
              title="You"
              pinColor={COLORS.primary}
            />
          )}
        </MapView>

        {/* Back Button Overlay */}
        <TouchableOpacity style={styles.backButtonOverlay} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>

        {/* Distance Badge */}
        {isNavigating && distanceToDestination > 0 && (
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceBadgeText}>
              {distanceToDestination < 1
                ? `${(distanceToDestination * 1000).toFixed(0)} m`
                : `${distanceToDestination.toFixed(1)} km`}
            </Text>
            <Text style={styles.distanceBadgeLabel}>to destination</Text>
          </View>
        )}
      </View>

      {/* Bottom 40%: Ride Dashboard */}
      <View style={styles.dashboard}>
        {/* SCROLLABLE CONTENT */}
        <ScrollView 
          style={styles.scrollContent}
          contentContainerStyle={{
            paddingBottom: ride.status === "completed" || ride.status === "cancelled" ? 20 : 120,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. HEADER: Large Circular Icon */}
          <View style={styles.headerSection}>
            <View style={styles.modeIconCircle}>
              <TransportIcon size={40} color={COLORS.white} />
            </View>
            <Text style={styles.modeLabel}>
              {ride.transport_label || "Commuting"} • {isSoloTrip ? "Solo" : isDriver ? "Driving" : "Riding"}
            </Text>
            <Text style={styles.distanceLabelHeader}>
              {tripDistance.toFixed(1)} km trip
            </Text>
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
                  {ride.origin_address || "Origin"}
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

            {/* CO2 Savings Badge */}
            <View style={styles.co2Badge}>
              <Text style={styles.co2BadgeText}>
                🌱 Saving {ride.co2_saved.toFixed(2)} kg CO₂
              </Text>
            </View>
          </View>

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

          {/* Read-Only Summary for Completed/Cancelled */}
          {(ride.status === "completed" || ride.status === "cancelled") && (
            <View style={styles.completedSummary}>
              <Text style={styles.completedTitle}>
                {ride.status === "completed" ? "Trip Completed ✅" : "Trip Cancelled"}
              </Text>
              {ride.status === "completed" && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>CO₂ Saved:</Text>
                  <Text style={styles.summaryValue}>{ride.co2_saved.toFixed(2)} kg</Text>
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
          rideId={id as string}
          currentUserId={currentUserId}
          partnerName={partnerName}
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
            <Text style={styles.safetyModalTitle}>Safety Toolkit 🛡️</Text>
            
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

      {/* Arrival Modal */}
      <Modal
        visible={showArrivalModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowArrivalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.arrivalModal}>
            <Text style={styles.arrivalTitle}>You Arrived! 🎉</Text>
            <Text style={styles.arrivalSubtitle}>
              CO₂ Saved: {ride.co2_saved.toFixed(2)} kg
            </Text>
            <Text style={styles.arrivalEmoji}>🌱</Text>
            
            <TouchableOpacity style={styles.confirmButton} onPress={handleCompleteTr}>
              <Text style={styles.confirmButtonText}>Confirm & Collect XP</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowArrivalModal(false)}>
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
    color: COLORS.gray400,
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
  
  // Map Section (Top 60%)
  mapContainer: {
    height: "60%",
    position: "relative",
  },
  map: {
    flex: 1,
  },
  backButtonOverlay: {
    position: "absolute",
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.dark,
  },
  distanceBadge: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  distanceBadgeText: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
  },
  distanceBadgeLabel: {
    fontSize: 11,
    color: COLORS.gray400,
    textAlign: "center",
    marginTop: 2,
  },

  // Dashboard (Bottom 85%) - Expanded for better visibility
  dashboard: {
    height: "85%",
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 10,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // 1. Header Section (Large Circular Icon) - Centered with Safe Spacing
  headerSection: {
    alignItems: "center",
    marginBottom: 20,
    paddingTop: 8,
  },
  modeIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.gray700,
    marginBottom: 4,
  },
  distanceLabelHeader: {
    fontSize: 14,
    color: COLORS.gray400,
    fontWeight: "500",
  },

  // 2. Route Card (Timeline Style)
  routeCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
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
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.gray400,
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

  // 3. Partner Card (Conditional)
  partnerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gray50,
    padding: 16,
    borderRadius: 20,
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
    color: COLORS.gray400,
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
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 8,
    elevation: 8,
  },
  actionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: COLORS.gray200,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    color: COLORS.gray400,
    marginBottom: 20,
  },
  arrivalEmoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 24,
    width: "100%",
    marginBottom: 12,
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  notYetText: {
    fontSize: 15,
    color: COLORS.gray400,
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
    color: COLORS.gray400,
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

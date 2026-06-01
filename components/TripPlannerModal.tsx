import React, { useState, useRef, useEffect, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  Dimensions,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  ActivityIndicator,
  Switch,
} from "react-native";
import {
  Car,
  Users,
  Footprints,
  Bike,
  Zap,
  Bus,
  Navigation as NavIcon,
  X,
  MapPin,
  Navigation2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Plus,
  School,
  TrendingDown,
  Car as TaxiIcon,
  Home as HomeIcon,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import { computeLocalModes, getFuelBaseCO2, getVehicleCO2, getPrimaryVehicle } from "../lib/commuteUtils";
import { Vehicle, parseVehicles } from "../lib/vehicles";

import { MAPBOX_TOKEN } from "../lib/config";
const { height } = Dimensions.get("window");

// Editorial reskin — local palette re-pointed onto the warm "paper" system.
const COLORS = {
  primary: "#26C6DA",   // cyan
  white: "#FAF7EF",     // ivory
  gray: "#8B989C",      // ink-4
  lightGray: "#E8E3D7", // paper-2
  dark: "#003D40",      // teal
  accent: "#F2C744",    // sun
  green: "#5B8F5B",     // leaf
  red: "#C4623F",       // clay
};

// Base transport modes — "my_car" co2 is patched at runtime from user's fuel type
const BASE_TRANSPORT_MODES = [
  { id: "walking", label: "Walking",           icon: Footprints, co2: 0,     color: "#4CAF50" },
  { id: "bike",    label: "Bike / Scooter",    icon: Bike,       co2: 0,     color: "#FF9800" },
  { id: "ebike",   label: "E-Bike / E-Scooter",icon: Zap,        co2: 0.023, color: "#E91E63" },
  { id: "moto",    label: "Motorbike",          icon: NavIcon,    co2: 0.090, color: "#9C27B0" },
  { id: "public",  label: "Public Transport",   icon: Bus,        co2: 0.040, color: "#7C3AED" },
  // Taxi — CO₂ estimated as an average hybrid car (Prius is the most common
  // EU taxi). A disclaimer is shown when this mode is selected. (PDF Branch C)
  { id: "taxi",    label: "Taxi",               icon: TaxiIcon,   co2: 0.120, color: "#F2C744" },
  { id: "my_car",  label: "My Car",             icon: Car,        co2: 0.192, color: COLORS.primary },
  // Working from home — a zero-commute day. No route required. (PDF Stage 3)
  { id: "wfh",     label: "Working from home",  icon: HomeIcon,   co2: 0,     color: "#5B8F5B" },
];

/**
 * CO₂ intensity → dot colour (PDF Stage 3: "each card shows a small CO₂
 * indicator — a colored dot green/yellow/orange — so the user associates
 * transport with impact before choosing"). Thresholds in kg/km.
 */
function co2DotColor(co2PerKm: number): string {
  if (co2PerKm <= 0.001) return "#5B8F5B";   // leaf — zero/near-zero
  if (co2PerKm < 0.05) return "#7FB069";      // soft green — low (e-bike, transit)
  if (co2PerKm < 0.13) return "#F2C744";      // sun — medium (hybrid/taxi)
  return "#C4623F";                            // clay — high (car/moto)
}

// --- ISOLATED INPUT COMPONENT ---
interface CustomAddressInputProps {
  placeholder: string;
  icon: React.ReactNode;
  onSelect: (data: { description: string; location: { lat: number; lng: number } }) => void;
  inputRef?: React.RefObject<TextInput | null>;
  initialValue?: string;
}
const CustomAddressInput = ({ placeholder, icon, onSelect, inputRef, initialValue }: CustomAddressInputProps) => {
  const [text, setText] = useState(initialValue ?? "");
  const [results, setResults] = useState<any[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPlaces = (searchText: string) => {
    setText(searchText);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (searchText.length < 3) {
      setResults([]);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchText)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=address,place,locality,neighborhood`;
        const response = await fetch(url);
        const json = await response.json();
        setResults(json.features ?? []);
      } catch (error) {
        console.error(error);
      }
    }, 350);
  };

  const handleSelect = (feature: any) => {
    Keyboard.dismiss();
    setText(feature.place_name);
    setResults([]);
    setIsFocused(false);
    const [lng, lat] = feature.geometry.coordinates;
    onSelect({ description: feature.place_name, location: { lat, lng } });
  };

  return (
    <View style={styles.inputContainer}>
      <View style={styles.inputRow}>
        {icon}
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          value={text}
          onChangeText={searchPlaces}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholderTextColor={COLORS.gray}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isFocused && results.length > 0 && (
        <View style={styles.resultsList}>
          {results.map((item, index) => (
            <TouchableOpacity
              key={`${item.id}-${index}`}
              style={styles.resultItem}
              onPress={() => handleSelect(item)}
            >
              <MapPin size={16} color={COLORS.gray} />
              <Text style={styles.resultText}>{item.place_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

interface TripPlannerModalProps {
  visible: boolean;
  onClose: () => void;
  onTripStart: (data: {
    rideId?: string | null;
    origin: { lat: number; lng: number; description: string };
    destination: { lat: number; lng: number; description: string };
    waypoint?: { lat: number; lng: number; description: string } | null;
    mode: any;
    role: string;
    scheduledTime?: Date;
  }) => void;
  onDailyCommute?: () => void;
  initialMode?: string; // Pre-select a transport mode when opened from AI Planner
  initialOrigin?: { lat: number; lng: number; description: string }; // Pre-fill origin (AI Planner / Map home)
  initialDest?: { lat: number; lng: number; description: string };   // Pre-fill destination (AI Planner / Map work)
  initialDate?: Date; // Seed the scheduled date (e.g. from the Today/Tomorrow toggle)
}

const TripPlannerModal: React.FC<TripPlannerModalProps> = ({ visible, onClose, onTripStart, onDailyCommute, initialMode, initialOrigin, initialDest, initialDate }) => {
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  // Tab bar height = standard 49px + device bottom safe area (home indicator)
  const TAB_BAR_HEIGHT = 49 + insets.bottom;
  const [step, setStep] = useState<"location" | "mode">("location");
  const [role, setRole] = useState<"solo" | "driver" | "rider">("solo");
  
  // Location state (isolated from parent)
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [waypointCoords, setWaypointCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [originDescription, setOriginDescription] = useState("");
  const [destDescription, setDestDescription] = useState("");
  const [waypointDescription, setWaypointDescription] = useState("");
  const [showWaypointInput, setShowWaypointInput] = useState(false);
  const [routeDistance, setRouteDistance] = useState<number>(0); // Distance in km
  
  // Mode state
  const [selectedMode, setSelectedMode] = useState<any>(null);
  
  // User's actual car CO₂ factor — fetched from profile on first open
  const [userCarCO2, setUserCarCO2] = useState<number>(0.192);
  // Garage: pick which vehicle this trip uses for the CO₂ comparison.
  const [garage, setGarage] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  // Rider privacy: share exact pickup address with the driver? (default from profile)
  const [sharePickup, setSharePickup] = useState<boolean>(true);

  // Build transport modes with the user's real car CO₂ factor applied to "my_car"
  const TRANSPORT_MODES = BASE_TRANSPORT_MODES.map(m =>
    m.id === "my_car" ? { ...m, co2: userCarCO2 } : m
  );

  // Per-trip carpool candidate state
  const [carpoolCandidates, setCarpoolCandidates] = useState<any[]>([]);
  const [isLoadingCarpool, setIsLoadingCarpool] = useState(false);
  const [carpoolFetched, setCarpoolFetched] = useState(false);

  // Branch B — public-transit options (Google Directions via transit-routes fn)
  type TransitOption = {
    summary: string; submode: string; duration_min: number;
    departure_text: string | null; arrival_text: string | null;
    distance_km: number; co2_per_km: number; co2_kg: number;
  };
  const [transitOptions, setTransitOptions] = useState<TransitOption[]>([]);
  const [isLoadingTransit, setIsLoadingTransit] = useState(false);
  const [transitFetched, setTransitFetched] = useState(false);
  const [selectedTransitIdx, setSelectedTransitIdx] = useState<number | null>(null);

  // Key used to force re-mount address inputs (so they reset when modal closes/pre-fills)
  const [addressMountKey, setAddressMountKey] = useState(0);

  // Scheduling state - default to 15 minutes from now so trips appear in "Upcoming"
  const [scheduledDate, setScheduledDate] = useState(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + 15);
    return date;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── Minimize state ──────────────────────────────────────────────────────────
  const [isMinimized, setIsMinimized] = useState(false);
  const minimizeTranslate = useRef(new Animated.Value(0)).current;
  const backdropOpacityAnim = useRef(new Animated.Value(0.35)).current;
  const sheetHeightRef = useRef(0);
  const MINI_BAR_H = 82; // handle(25) + header row(57)

  const toggleMinimize = () => {
    const nextMinimized = !isMinimized;
    // Translate down by (sheetHeight - miniBar - tabBar) so the mini bar floats
    // just above the tab bar rather than sliding behind it.
    const tabBarOffset = TAB_BAR_HEIGHT + 8; // 8px breathing room above tab bar
    const offset = nextMinimized
      ? (sheetHeightRef.current > 0
          ? sheetHeightRef.current - MINI_BAR_H - tabBarOffset
          : height * 0.55)
      : 0;
    Animated.parallel([
      Animated.spring(minimizeTranslate, {
        toValue: offset,
        friction: 9,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacityAnim, {
        toValue: nextMinimized ? 0 : 0.35,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    setIsMinimized(nextMinimized);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Fetch user's fuel type once on first open to set accurate "My Car" CO₂
  React.useEffect(() => {
    if (!visible) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Try the full select; if the new columns aren't present yet (prod
      // schema lagging migration 20260520_014), fall back to the legacy
      // single-column read so "My Car" CO₂ is still accurate for review.
      let resp = await supabase
        .from("profiles")
        .select("car_fuel_type, vehicles, primary_vehicle_id, share_pickup_address")
        .eq("id", user.id)
        .single();
      if (resp.error) {
        resp = await supabase
          .from("profiles")
          .select("car_fuel_type")
          .eq("id", user.id)
          .single();
      }
      const data = resp.data;
      if (!data) return;
      const vehicles = parseVehicles((data as any).vehicles);
      setGarage(vehicles);
      setSharePickup((data as any).share_pickup_address ?? true);
      const primary = getPrimaryVehicle(vehicles, (data as any).primary_vehicle_id);
      if (primary) {
        setSelectedVehicleId(primary.id);
        setUserCarCO2(getVehicleCO2(primary));
      } else if (data.car_fuel_type) {
        // Legacy single-car users with no garage yet
        setUserCarCO2(getFuelBaseCO2(data.car_fuel_type));
      }
    })();
  }, [visible]);

  // Recompute the "My Car" baseline whenever the chosen garage vehicle changes.
  React.useEffect(() => {
    if (!selectedVehicleId) return;
    const v = garage.find((x) => x.id === selectedVehicleId);
    if (v) setUserCarCO2(getVehicleCO2(v));
  }, [selectedVehicleId, garage]);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    } else {
      // Reset minimize state when modal hides
      minimizeTranslate.setValue(0);
      backdropOpacityAnim.setValue(0.35);
      setIsMinimized(false);
    }
  }, [visible]);

  // Pre-select mode (and role) when opened from AI Planner with a suggested mode
  React.useEffect(() => {
    if (!visible || !initialMode) return;
    if (initialMode === 'carpool') {
      // Carpool suggestion → set role to rider
      setRole('rider');
      setSelectedMode(null);
    } else {
      const found = TRANSPORT_MODES.find(m => m.id === initialMode);
      if (found) {
        setSelectedMode(found);
        setRole('solo');
      }
    }
  }, [visible, initialMode]);

  // Pre-fill origin & destination when opened from AI Planner with pre-set locations
  React.useEffect(() => {
    if (!visible) return;
    if (initialOrigin) {
      setOriginDescription(initialOrigin.description);
      setOriginCoords({ lat: initialOrigin.lat, lng: initialOrigin.lng });
    }
    if (initialDest) {
      setDestDescription(initialDest.description);
      setDestCoords({ lat: initialDest.lat, lng: initialDest.lng });
    }
    if (initialOrigin || initialDest) {
      setAddressMountKey(k => k + 1); // Re-mount inputs so they show the pre-filled values
    }
    // Cards-first: when BOTH endpoints are known (e.g. opened from the Map with
    // the user's home→work prefilled), skip the location step and land directly
    // on the transport cards. Restores the PDF's 4-tap planning flow.
    if (initialOrigin && initialDest) {
      setStep("mode");
    }
  }, [visible, initialOrigin, initialDest]);

  // Seed the scheduled date from the caller (Today/Tomorrow toggle). Keeps the
  // planner's own date picker for fine-tuning, but defaults to the chosen day.
  React.useEffect(() => {
    if (visible && initialDate) {
      setScheduledDate(new Date(initialDate));
    }
  }, [visible, initialDate]);

  // Calculate route distance when origin and destination are set
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

  // Auto-fetch carpool candidates when both locations are set (or when role changes)
  useEffect(() => {
    if (!originCoords || !destCoords) return;
    fetchTripCarpoolCandidates();
  }, [originCoords, destCoords, role]);

  // Branch B — fetch real transit options when Public Transport is selected.
  useEffect(() => {
    if (selectedMode?.id !== "public" || !originCoords || !destCoords) {
      setTransitOptions([]);
      setTransitFetched(false);
      setSelectedTransitIdx(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setIsLoadingTransit(true);
      setTransitFetched(false);
      try {
        const { data, error } = await supabase.functions.invoke<{ options: TransitOption[] }>(
          "transit-routes",
          {
            body: {
              origin_lat: originCoords.lat,
              origin_long: originCoords.lng,
              dest_lat: destCoords.lat,
              dest_long: destCoords.lng,
              departure_time: scheduledDate.toISOString(),
            },
          },
        );
        if (cancelled) return;
        if (error) { setTransitOptions([]); }
        else { setTransitOptions(data?.options ?? []); }
      } catch {
        if (!cancelled) setTransitOptions([]);
      } finally {
        if (!cancelled) { setIsLoadingTransit(false); setTransitFetched(true); }
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selectedMode?.id, originCoords, destCoords, scheduledDate]);

  const fetchTripCarpoolCandidates = async () => {
    if (!originCoords || !destCoords) return;
    setIsLoadingCarpool(true);
    setCarpoolFetched(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Pass p_caller_id so the visibility predicate (is_peer_visible) on
      // the server filters by same-company / mutual-opt-in cross-org rules.
      // If the pre-migration RPC signature (no p_caller_id) is still
      // deployed, retry without it so review builds aren't blocked.
      let resp = await supabase.rpc("find_carpool_candidates", {
        p_origin_lat:      originCoords.lat,
        p_origin_long:     originCoords.lng,
        p_dest_lat:        destCoords.lat,
        p_dest_long:       destCoords.lng,
        p_departure_time:  scheduledDate.toISOString(),
        p_role:            role === "solo" ? "rider" : role,
        p_radius_km:       5,
        p_caller_id:       user?.id ?? null,
      });
      if (resp.error) {
        resp = await supabase.rpc("find_carpool_candidates", {
          p_origin_lat:      originCoords.lat,
          p_origin_long:     originCoords.lng,
          p_dest_lat:        destCoords.lat,
          p_dest_long:       destCoords.lng,
          p_departure_time:  scheduledDate.toISOString(),
          p_role:            role === "solo" ? "rider" : role,
          p_radius_km:       5,
        });
      }
      setCarpoolCandidates(resp.data ?? []);
    } catch {
      setCarpoolCandidates([]);
    } finally {
      setIsLoadingCarpool(false);
      setCarpoolFetched(true);
    }
  };

  // Helper: Calculate distance using Haversine formula (returns km)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const getModesByRole = () => {
    if (role === "solo") {
      // Solo: Walking, Bike, E-Bike/E-Scooter, Motorbike, Public Transport,
      // Taxi, My Car, Working from home. (PDF Stage 3 option cards)
      return TRANSPORT_MODES.filter((m) =>
        ["walking", "bike", "ebike", "moto", "public", "taxi", "my_car", "wfh"].includes(m.id)
      );
    } else if (role === "driver") {
      // Driver: Only Motorbike and My Car (for carpooling)
      return TRANSPORT_MODES.filter((m) => ["moto", "my_car"].includes(m.id));
    } else {
      // Rider: No modes (will show message instead)
      return [];
    }
  };

  const handleTripSubmit = async () => {
    // Validation: For riders, no mode selection needed
    const requiresMode = role !== "rider";
    if (!originCoords || !destCoords || (requiresMode && !selectedMode)) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Save to Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast({ title: "Not signed in", message: "Please sign in to save a trip.", type: "error" });
        return;
      }

      // Fetch user's profile for car details
      const { data: profile } = await supabase
        .from("profiles")
        .select("car_make, car_model")
        .eq("id", user.id)
        .single();

      // Update "My Car" label if user has car details
      let transportLabel = selectedMode?.label || (role === "rider" ? "Looking for driver" : "N/A");
      if (selectedMode?.id === "my_car" && profile?.car_make && profile?.car_model) {
        transportLabel = `${profile.car_make} ${profile.car_model}`;
      }

      // Calculate distance (in km)
      const distance = calculateDistance(
        originCoords.lat,
        originCoords.lng,
        destCoords.lat,
        destCoords.lng
      );

      // Calculate CO2 saved vs user's actual car fuel type (not a fixed petrol assumption)
      const baselineCO2 = distance * userCarCO2;
      const tripCO2 = distance * (selectedMode?.co2 || 0);
      const co2SavedKg = Math.max(0, baselineCO2 - tripCO2);

      const rideData: any = {
        // For solo rides, set rider_id to track ownership
        driver_id: role === "driver" ? user.id : null,
        rider_id: (role === "rider" || role === "solo") ? user.id : null,
        origin_lat: originCoords.lat,
        origin_long: originCoords.lng,
        origin_address: originDescription,
        dest_lat: destCoords.lat,
        dest_long: destCoords.lng,
        dest_address: destDescription,
        status: "scheduled", // ALL trips start as scheduled
        // Passenger pickup privacy: only riders gate this; solo/driver always true.
        share_origin_address: role === "rider" ? sharePickup : true,
        scheduled_at: scheduledDate.toISOString(),
        transport_mode: selectedMode?.id || null,
        transport_label: transportLabel,
        co2_saved: parseFloat(co2SavedKg.toFixed(3)), // Store in kg with 3 decimal precision
        waypoints: waypointCoords ? JSON.stringify([{
          lat: waypointCoords.lat,
          lng: waypointCoords.lng,
          description: waypointDescription,
        }]) : null,
      };
      
      if (__DEV__) {
        console.log(
          `Saving ride | distance=${distance.toFixed(2)}km co2=${co2SavedKg.toFixed(3)}kg`,
        );
      }
      
      const { data, error } = await supabase.from("rides").insert([rideData]).select();
      if (error) {
        console.error("❌ Error saving ride:", error);
        showToast({ title: "Could not save trip", message: error.message, type: "error" });
        return;
      }

      if (__DEV__) { console.log("Ride saved successfully"); }
      showToast({
        title: "Trip scheduled!",
        message: `You'll save ${co2SavedKg.toFixed(2)} kg CO₂. Check Activity → Upcoming.`,
        type: "success",
        duration: 5000,
      });
      
      // Call parent callback — include the DB ride id so the home screen can
      // cancel or update the row if the user taps "Cancel Search".
      onTripStart({
        rideId: data?.[0]?.id ?? null,
        origin: { ...originCoords, description: originDescription },
        destination: { ...destCoords, description: destDescription },
        waypoint: waypointCoords ? { ...waypointCoords, description: waypointDescription } : null,
        mode: selectedMode,
        role,
        scheduledTime: scheduledDate,
      });
      
      // Reset state
      setStep("location");
      setOriginCoords(null);
      setDestCoords(null);
      setWaypointCoords(null);
      setOriginDescription("");
      setDestDescription("");
      setWaypointDescription("");
      setShowWaypointInput(false);
      setSelectedMode(null);
      setCarpoolCandidates([]);
      setCarpoolFetched(false);
      // Reset to 15 minutes in the future
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 15);
      setScheduledDate(futureDate);
      onClose();
    } catch (error) {
      console.error("❌ Error in handleTripSubmit:", error);
      showToast({ title: "Something went wrong", message: String(error), type: "error" });
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    // Reset minimize state
    minimizeTranslate.setValue(0);
    backdropOpacityAnim.setValue(0.35);
    setIsMinimized(false);
    // Reset all form state so the modal opens fresh next time
    setOriginDescription("");
    setDestDescription("");
    setOriginCoords(null);
    setDestCoords(null);
    setSelectedMode(null);
    setRole("solo");
    setCarpoolCandidates([]);
    setCarpoolFetched(false);
    setAddressMountKey(k => k + 1); // Re-mount address inputs fresh
    onClose();
  };

  const modeReady = originCoords && destCoords;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.sheetWrapper}
        pointerEvents="box-none"
      >
        {/* Backdrop — dims map when expanded, transparent when minimized */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacityAnim }]}
          pointerEvents={isMinimized ? "none" : "auto"}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: minimizeTranslate }] }]}
          onLayout={(e) => { sheetHeightRef.current = e.nativeEvent.layout.height; }}
        >
          {/* ── Handle — tap to minimize/expand ── */}
          <TouchableOpacity onPress={toggleMinimize} activeOpacity={0.7} style={styles.handleContainer}>
            <View style={styles.handle} />
          </TouchableOpacity>

          {/* ── Header — changes when minimized ── */}
          {isMinimized ? (
            <View style={[styles.header, styles.miniHeader]}>
              <TouchableOpacity onPress={toggleMinimize} style={styles.miniExpandArea} activeOpacity={0.7}>
                <ChevronUp size={18} color={COLORS.primary} />
                <Text style={styles.miniRouteText} numberOfLines={1}>
                  {originDescription
                    ? `${originDescription.split(",")[0]}${destDescription ? ` → ${destDescription.split(",")[0]}` : ""}`
                    : "Tap to expand"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} hitSlop={8}>
                <X size={20} color="#999" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.header}>
              <TouchableOpacity onPress={toggleMinimize} hitSlop={8}>
                <ChevronDown size={20} color={COLORS.gray} />
              </TouchableOpacity>
              <Text style={styles.title}>Plan your route</Text>
              <TouchableOpacity onPress={handleClose}>
                <X size={24} color="#999" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Scrollable body — hidden while minimized (state is preserved) ── */}
          {!isMinimized && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 100 }}
          >
            {/* ── Location Inputs ── */}
            <CustomAddressInput
              key={`origin-${addressMountKey}`}
              placeholder="Origin"
              icon={<Navigation2 size={20} color={COLORS.green} />}
              initialValue={originDescription}
              onSelect={(data) => {
                setOriginDescription(data.description);
                setOriginCoords({ lat: data.location.lat, lng: data.location.lng });
              }}
            />

            {/* Waypoint */}
            {showWaypointInput ? (
              <View style={{ marginBottom: 12 }}>
                <CustomAddressInput
                  placeholder="School / Kindergarten stop"
                  icon={<School size={20} color={COLORS.accent} />}
                  onSelect={(data) => {
                    setWaypointDescription(data.description);
                    setWaypointCoords({ lat: data.location.lat, lng: data.location.lng });
                  }}
                />
                <TouchableOpacity
                  onPress={() => {
                    setShowWaypointInput(false);
                    setWaypointCoords(null);
                    setWaypointDescription("");
                  }}
                  style={styles.removeWaypointBtn}
                >
                  <X size={16} color={COLORS.red} />
                  <Text style={styles.removeWaypointText}>Remove Stop</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowWaypointInput(true)}
                style={styles.addWaypointBtn}
              >
                <Plus size={18} color={COLORS.primary} />
                <Text style={styles.addWaypointText}>Add Kindergarten / School Stop</Text>
              </TouchableOpacity>
            )}

            <CustomAddressInput
              key={`dest-${addressMountKey}`}
              placeholder="Destination"
              icon={<MapPin size={20} color={COLORS.red} />}
              initialValue={destDescription}
              onSelect={(data) => {
                setDestDescription(data.description);
                setDestCoords({ lat: data.location.lat, lng: data.location.lng });
              }}
            />

            {/* ── Daily Commute shortcut ── */}
            {!!onDailyCommute && (
              <TouchableOpacity
                style={styles.dailyCommuteRow}
                onPress={() => { onClose(); onDailyCommute(); }}
                activeOpacity={0.8}
              >
                <View style={styles.dailyCommuteIcon}>
                  <Users size={18} color="#26C6DA" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dailyCommuteTitle}>Plan Tomorrow's Commute</Text>
                  <Text style={styles.dailyCommuteSub}>Find a carpool match before 17:00</Text>
                </View>
                <ChevronDown size={16} color="#90A4AE" style={{ transform: [{ rotate: "-90deg" }] }} />
              </TouchableOpacity>
            )}

            {/* ── Mode Section — appears once both addresses are filled ── */}
            {modeReady && (
              <>
                {/* Divider */}
                <View style={styles.modeSectionDivider} />

                {/* AI Insight Banner */}
                {routeDistance > 0 && (() => {
                  const best = computeLocalModes(routeDistance, 1, userCarCO2)[0];
                  if (!best) return null;
                  return (
                    <View style={styles.tripInsightBanner}>
                      <TrendingDown size={16} color={COLORS.primary} />
                      <Text style={styles.tripInsightText}>
                        <Text style={{ fontWeight: "700" }}>{routeDistance.toFixed(1)} km trip. </Text>
                        Best green option: {best.label} (saves ~{best.reductionPct}% CO₂, ~{best.timeMin} min)
                      </Text>
                    </View>
                  );
                })()}

                {/* Role Toggle */}
                <View style={styles.roleRow}>
                  {(['solo', 'driver', 'rider'] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleChip, role === r && styles.roleChipActive]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setRole(r);
                        setSelectedMode(null);
                      }}
                    >
                      {r === 'solo' && <Footprints size={16} color={role === r ? COLORS.primary : COLORS.gray} />}
                      {r === 'driver' && <Car size={16} color={role === r ? COLORS.primary : COLORS.gray} />}
                      {r === 'rider' && <Users size={16} color={role === r ? COLORS.primary : COLORS.gray} />}
                      <Text style={[styles.roleText, role === r && { color: COLORS.primary, fontWeight: "700" }]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Mode tiles or Rider message */}
                {role === "rider" ? (
                  <View style={styles.riderMessageContainer}>
                    <Users size={40} color={COLORS.primary} />
                    <Text style={styles.riderMessageTitle}>Looking for a ride?</Text>
                    <Text style={styles.riderMessageText}>
                      We will match you with a driver heading your way.
                    </Text>
                    <View style={styles.sharePickupRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sharePickupLabel}>
                          Share my pickup address with the driver
                        </Text>
                        <Text style={styles.sharePickupSub}>
                          {sharePickup
                            ? "The driver sees your exact pickup point."
                            : "The driver sees only a pickup area until they accept."}
                        </Text>
                      </View>
                      <Switch
                        value={sharePickup}
                        onValueChange={setSharePickup}
                        trackColor={{ false: COLORS.gray + "55", true: COLORS.primary + "80" }}
                        thumbColor={sharePickup ? COLORS.primary : COLORS.gray}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.modeListContainer}>
                    {getModesByRole().map((m) => {
                      const IconComponent = m.icon;
                      const isSelected = selectedMode?.id === m.id;
                      const totalCO2Kg = routeDistance * m.co2;
                      const totalCO2Grams = totalCO2Kg * 1000;
                      const isWfh = m.id === "wfh";
                      let co2Display = "0 g";
                      if (isWfh) {
                        co2Display = "No commute";
                      } else if (m.co2 === 0) {
                        co2Display = "Zero Emissions";
                      } else if (routeDistance === 0) {
                        co2Display = "—";
                      } else if (totalCO2Kg < 1) {
                        co2Display = `${totalCO2Grams.toFixed(0)} g CO₂`;
                      } else {
                        co2Display = `${totalCO2Kg.toFixed(1)} kg CO₂`;
                      }
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.modeItem, isSelected && styles.modeItemActive]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedMode(m);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`${m.label}, ${co2Display}`}
                        >
                          <View style={[styles.iconBox, { backgroundColor: m.color + '20' }]}>
                            <IconComponent size={24} color={m.color} />
                            {/* CO₂ intensity dot (PDF Stage 3) */}
                            <View style={[styles.co2Dot, { backgroundColor: co2DotColor(m.co2) }]} />
                          </View>
                          <Text style={[styles.modeLabel, isSelected && { color: COLORS.primary, fontWeight: "700" }]}>
                            {m.label}
                          </Text>
                          <Text style={styles.modeCo2}>{co2Display}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Taxi disclaimer (PDF Branch C) */}
                {selectedMode?.id === "taxi" && (
                  <View style={styles.disclaimerRow}>
                    <Text style={styles.disclaimerText}>
                      Taxi CO₂ is estimated based on an average hybrid car.
                    </Text>
                  </View>
                )}

                {/* Branch B — public-transit options (Google Directions) */}
                {selectedMode?.id === "public" && (
                  <View style={styles.transitWrap}>
                    {isLoadingTransit ? (
                      <View style={styles.transitLoading}>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                        <Text style={styles.transitLoadingText}>Finding transit routes…</Text>
                      </View>
                    ) : transitOptions.length > 0 ? (
                      transitOptions.map((opt, idx) => {
                        const active = selectedTransitIdx === idx;
                        return (
                          <TouchableOpacity
                            key={`${opt.summary}-${idx}`}
                            style={[styles.transitRow, active && styles.transitRowActive]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSelectedTransitIdx(idx);
                              // Refine the selected mode so the saved trip records
                              // this sub-mode's CO₂ + label (handleTripSubmit reuses it).
                              setSelectedMode((prev: any) => ({
                                ...prev,
                                co2: opt.co2_per_km,
                                label: opt.summary,
                              }));
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${opt.summary}, ${opt.duration_min} minutes, ${opt.co2_kg} kg CO2, leaves ${opt.departure_text ?? "soon"}`}
                          >
                            <View style={[styles.co2Dot, styles.transitDot, { backgroundColor: co2DotColor(opt.co2_per_km) }]} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.transitSummary, active && { color: COLORS.primary }]} numberOfLines={1}>
                                {opt.summary}
                              </Text>
                              <Text style={styles.transitMeta} numberOfLines={1}>
                                {opt.duration_min} min · {opt.co2_kg} kg CO₂{opt.departure_text ? ` · leaves ${opt.departure_text}` : ""}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    ) : transitFetched ? (
                      <Text style={styles.disclaimerText}>
                        No transit routes found — we'll estimate with an average.
                      </Text>
                    ) : null}
                  </View>
                )}

                {/* Which garage vehicle for this trip? (drives the CO₂ comparison) */}
                {selectedMode?.id === "my_car" && garage.length > 0 && (
                  <View style={styles.vehiclePickerWrap}>
                    <Text style={styles.vehiclePickerLabel}>Which vehicle?</Text>
                    <View style={styles.vehicleChipRow}>
                      {garage.map((v) => {
                        const active = v.id === selectedVehicleId;
                        const name =
                          [v.make, v.model].filter(Boolean).join(" ") ||
                          v.type.charAt(0).toUpperCase() + v.type.slice(1);
                        return (
                          <TouchableOpacity
                            key={v.id}
                            style={[styles.vehicleChip, active && styles.vehicleChipActive]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSelectedVehicleId(v.id);
                            }}
                          >
                            <Text
                              style={[
                                styles.vehicleChipText,
                                active && { color: COLORS.primary, fontWeight: "700" },
                              ]}
                              numberOfLines={1}
                            >
                              {name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Carpool match badge */}
                {(role === "driver" || role === "rider") && carpoolFetched && (
                  <View style={styles.carpoolMatchBanner}>
                    <Users size={18} color={carpoolCandidates.length > 0 ? COLORS.primary : COLORS.gray} />
                    {isLoadingCarpool ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text style={styles.carpoolMatchText}>
                        {carpoolCandidates.length > 0
                          ? `${carpoolCandidates.length} potential match${carpoolCandidates.length > 1 ? "es" : ""} found near your route 🎉`
                          : "No matches yet. You'll be added to the pool."}
                      </Text>
                    )}
                  </View>
                )}

                {/* Date/time scheduler (driver/rider only) */}
                {(role === "driver" || role === "rider") && (
                  <View style={styles.schedulerContainer}>
                    <TouchableOpacity
                      style={styles.schedulerBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowDatePicker(!showDatePicker);
                      }}
                    >
                      <Calendar size={20} color={COLORS.primary} />
                      <Text style={styles.schedulerText}>
                        {scheduledDate.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </Text>
                    </TouchableOpacity>

                    {showDatePicker && (
                      <View>
                        {Platform.OS === "ios" && (
                          <TouchableOpacity
                            onPress={() => setShowDatePicker(false)}
                            style={{ alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 4 }}
                          >
                            <Text style={{ color: COLORS.primary, fontWeight: "700", fontSize: 15 }}>Done</Text>
                          </TouchableOpacity>
                        )}
                        <DateTimePicker
                          value={scheduledDate}
                          mode="datetime"
                          display={Platform.OS === "ios" ? "spinner" : "default"}
                          onChange={(event, date) => {
                            if (Platform.OS !== "ios") setShowDatePicker(false);
                            if (date) setScheduledDate(date);
                          }}
                        />
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>
          )}

          {/* Submit button — pinned to bottom, hidden while minimized */}
          {!isMinimized && modeReady && (
            <View style={styles.submitBtn}>
              <TouchableOpacity
                style={[styles.btn, !(role === "rider" || selectedMode) && styles.btnDisabled]}
                onPress={handleTripSubmit}
                disabled={!(role === "rider" || selectedMode)}
              >
                <Text style={styles.btnText}>
                  {role === "rider"
                    ? "Find a Driver"
                    : selectedMode
                    ? `Go with ${selectedMode.label}`
                    : "Select a mode above"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheetWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingBottom: 32,
    maxHeight: height * 0.92,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: "#E0E0E0",
    borderRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  miniHeader: {
    marginBottom: 0,
    paddingVertical: 6,
  },
  miniExpandArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 12,
  },
  miniRouteText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.dark,
  },
  title: {
    fontWeight: "700",
    fontSize: 26,
    lineHeight: 32,
    flex: 1,
    textAlign: 'center',
  },

  // Input Styles
  inputContainer: { 
    marginBottom: 16,
    zIndex: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.lightGray,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.dark,
  },
  resultsList: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    maxHeight: 200,
    zIndex: 1000,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  resultText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.dark,
  },

  // Role Toggle
  roleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    backgroundColor: COLORS.lightGray,
    borderRadius: 12,
    padding: 4,
  },
  roleChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  roleChipActive: {
    backgroundColor: COLORS.white,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  roleText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.gray,
  },

  // Garage vehicle picker
  vehiclePickerWrap: { marginTop: 14 },
  vehiclePickerLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.gray,
    marginBottom: 8,
  },
  vehicleChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  vehicleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.gray + "55",
    maxWidth: 200,
  },
  vehicleChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "14",
  },
  vehicleChipText: { fontSize: 13, color: COLORS.gray },

  // Rider pickup-address privacy
  sharePickupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray + "33",
    alignSelf: "stretch",
  },
  sharePickupLabel: { fontSize: 14, fontWeight: "600", color: COLORS.dark },
  sharePickupSub: { fontSize: 12, color: COLORS.gray, marginTop: 3, lineHeight: 16 },

  // Mode List
  modeItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: COLORS.lightGray,
  },
  modeItemActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "10",
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    position: "relative",
  },
  // CO₂ intensity dot, top-right of the mode icon (PDF Stage 3).
  co2Dot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  modeLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.dark,
  },
  modeCo2: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: "600",
  },
  disclaimerRow: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: COLORS.gray,
    fontStyle: "italic",
    lineHeight: 16,
  },

  // Branch B — transit options
  transitWrap: {
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  transitLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  transitLoadingText: {
    fontSize: 13,
    color: COLORS.gray,
  },
  transitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.lightGray,
  },
  transitRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "10",
  },
  transitDot: {
    position: "relative",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 0,
  },
  transitSummary: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.dark,
  },
  transitMeta: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },

  // Mode List Container
  modeListContainer: {
    paddingVertical: 8,
  },

  // Submit button pinned to bottom of sheet
  submitBtn: {
    position: "absolute",
    bottom: 32,
    left: 24,
    right: 24,
  },

  // Button
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  btnDisabled: {
    backgroundColor: COLORS.gray,
    shadowOpacity: 0,
    opacity: 0.5,
  },
  btnText: {
    color: "white",
    fontSize: 17,
    fontWeight: "bold",
  },

  // Waypoint buttons
  addWaypointBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.lightGray,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: COLORS.primary,
    marginBottom: 12,
    gap: 8,
  },
  addWaypointText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  removeWaypointBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
    marginTop: 4,
  },
  removeWaypointText: {
    fontSize: 13,
    color: COLORS.red,
    fontWeight: "600",
  },

  // Rider message
  riderMessageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  riderMessageTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  riderMessageText: {
    fontSize: 16,
    color: COLORS.gray,
    textAlign: "center",
    lineHeight: 24,
  },

  // Divider between location section and mode section
  modeSectionDivider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 16,
  },

  // Trip AI insight banner (top of Step 2)
  tripInsightBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E0F7FA",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  tripInsightText: {
    flex: 1,
    fontSize: 13,
    color: "#006064",
    lineHeight: 18,
  },

  // Daily commute shortcut row
  dailyCommuteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#E0F7FA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B2EBF2",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  dailyCommuteIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  dailyCommuteTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#006064",
  },
  dailyCommuteSub: {
    fontSize: 12,
    color: "#546E7A",
    marginTop: 1,
  },

  // Carpool match count badge (below mode tiles)
  carpoolMatchBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F5FAFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B2EBF2",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  carpoolMatchText: {
    flex: 1,
    fontSize: 14,
    color: "#006064",
    fontWeight: "600",
  },

  // Scheduler
  schedulerContainer: {
    marginTop: 12,
    marginBottom: 12,
  },
  schedulerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.lightGray,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 10,
  },
  schedulerText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.dark,
  },
});

export default memo(TripPlannerModal);


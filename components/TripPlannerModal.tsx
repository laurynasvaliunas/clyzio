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
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";
import { computeLocalModes } from "../lib/commuteUtils";

import { MAPBOX_TOKEN } from "../lib/config";
const { height } = Dimensions.get("window");

const COLORS = {
  primary: "#26C6DA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  lightGray: "#F5F7FA",
  dark: "#006064",
  accent: "#FDD835",
  green: "#4CAF50",
  red: "#EF4444",
};

const TRANSPORT_MODES = [
  { id: "walking", label: "Walking", icon: Footprints, co2: 0, color: "#4CAF50" },
  { id: "bike", label: "Bike / Scooter", icon: Bike, co2: 0, color: "#FF9800" },
  { id: "ebike", label: "E-Bike / E-Scooter", icon: Zap, co2: 0.023, color: "#E91E63" },
  { id: "moto", label: "Motorbike", icon: NavIcon, co2: 0.09, color: "#9C27B0" },
  { id: "public", label: "Public Transport", icon: Bus, co2: 0.04, color: "#7C3AED" },
  { id: "my_car", label: "My Car", icon: Car, co2: 0.192, color: COLORS.primary }, // Default gas car, will be updated with user's actual car
];

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
    origin: { lat: number; lng: number; description: string };
    destination: { lat: number; lng: number; description: string };
    waypoint?: { lat: number; lng: number; description: string } | null;
    mode: any;
    role: string;
    scheduledTime?: Date;
  }) => void;
  initialMode?: string; // Pre-select a transport mode when opened from AI Planner
  initialOrigin?: { lat: number; lng: number; description: string }; // Pre-fill origin from AI Planner
  initialDest?: { lat: number; lng: number; description: string };   // Pre-fill destination from AI Planner
}

const TripPlannerModal: React.FC<TripPlannerModalProps> = ({ visible, onClose, onTripStart, initialMode, initialOrigin, initialDest }) => {
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
  
  // Per-trip carpool candidate state
  const [carpoolCandidates, setCarpoolCandidates] = useState<any[]>([]);
  const [isLoadingCarpool, setIsLoadingCarpool] = useState(false);
  const [carpoolFetched, setCarpoolFetched] = useState(false);

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
  }, [visible, initialOrigin, initialDest]);

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

  const fetchTripCarpoolCandidates = async () => {
    if (!originCoords || !destCoords) return;
    setIsLoadingCarpool(true);
    setCarpoolFetched(false);
    try {
      const { data } = await supabase.rpc("find_carpool_candidates", {
        p_origin_lat:      originCoords.lat,
        p_origin_long:     originCoords.lng,
        p_dest_lat:        destCoords.lat,
        p_dest_long:       destCoords.lng,
        p_departure_time:  scheduledDate.toISOString(),
        p_role:            role === "solo" ? "rider" : role,
        p_radius_km:       5,
      });
      setCarpoolCandidates(data ?? []);
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
      // Solo: Walking, Bike, E-Bike/E-Scooter, Motorbike, Public Transport, My Car
      return TRANSPORT_MODES.filter((m) => 
        ["walking", "bike", "ebike", "moto", "public", "my_car"].includes(m.id)
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

      // Calculate CO2 saved (in kg)
      // Formula: distance * mode.co2 per km
      // For baseline comparison, assume user would have driven a gas car (0.192 kg/km)
      const baselineCO2 = distance * 0.192; // Gas car baseline
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
      
      console.log("💾 Saving ride to database:", rideData);
      console.log(`📊 Distance: ${distance.toFixed(2)} km | CO2 Saved: ${co2SavedKg.toFixed(3)} kg`);
      
      const { data, error } = await supabase.from("rides").insert([rideData]).select();
      if (error) {
        console.error("❌ Error saving ride:", error);
        showToast({ title: "Could not save trip", message: error.message, type: "error" });
        return;
      }

      console.log("✅ Ride saved successfully:", data);
      showToast({
        title: "Trip scheduled!",
        message: `You'll save ${co2SavedKg.toFixed(2)} kg CO₂. Check Activity → Upcoming.`,
        type: "success",
        duration: 5000,
      });
      
      // Call parent callback
      onTripStart({
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
              <Text style={styles.title}>Plan Trip</Text>
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

            {/* ── Mode Section — appears once both addresses are filled ── */}
            {modeReady && (
              <>
                {/* Divider */}
                <View style={styles.modeSectionDivider} />

                {/* AI Insight Banner */}
                {routeDistance > 0 && (() => {
                  const best = computeLocalModes(routeDistance, 1)[0];
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
                  </View>
                ) : (
                  <View style={styles.modeListContainer}>
                    {getModesByRole().map((m) => {
                      const IconComponent = m.icon;
                      const isSelected = selectedMode?.id === m.id;
                      const totalCO2Kg = routeDistance * m.co2;
                      const totalCO2Grams = totalCO2Kg * 1000;
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
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.modeItem, isSelected && styles.modeItemActive]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedMode(m);
                          }}
                        >
                          <View style={[styles.iconBox, { backgroundColor: m.color + '20' }]}>
                            <IconComponent size={24} color={m.color} />
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
                          : "No matches yet — you'll be added to the pool"}
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
    fontSize: 20,
    fontWeight: "bold",
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


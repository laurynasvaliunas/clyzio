import React, { useState, useRef, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  Dimensions,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
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
  Calendar,
  Clock,
  Plus,
  School,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "../lib/supabase";

const GOOGLE_API_KEY = "AIzaSyAaQG2TsYZO_Ibp9sohoNS1XS-1DZ7UPwg";
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
const CustomAddressInput = ({ placeholder, icon, onSelect, inputRef }) => {
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const searchPlaces = async (searchText) => {
    setText(searchText);
    if (searchText.length < 3) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?key=${GOOGLE_API_KEY}&input=${searchText}&language=en`
      );
      const json = await response.json();
      if (json.predictions) {
        setResults(json.predictions);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (placeId, description) => {
    Keyboard.dismiss();
    setText(description);
    setResults([]);
    setIsFocused(false);
    
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?key=${GOOGLE_API_KEY}&place_id=${placeId}&fields=geometry`
      );
      const json = await response.json();
      if (json.result?.geometry) {
        onSelect({
          description,
          location: json.result.geometry.location,
        });
      }
    } catch (error) {
      console.error(error);
    }
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
          {results.map((item) => (
            <TouchableOpacity
              key={item.place_id}
              style={styles.resultItem}
              onPress={() => handleSelect(item.place_id, item.description)}
            >
              <MapPin size={16} color={COLORS.gray} />
              <Text style={styles.resultText}>{item.description}</Text>
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
    mode: any;
    role: string;
  }) => void;
}

const TripPlannerModal: React.FC<TripPlannerModalProps> = ({ visible, onClose, onTripStart }) => {
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
  
  // Scheduling state - default to 15 minutes from now so trips appear in "Upcoming"
  const [scheduledDate, setScheduledDate] = useState(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + 15);
    return date;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const slideAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    }
  }, [visible]);

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
        console.error("❌ No user found");
        alert("Error: No user logged in");
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
        alert(`Error saving ride: ${error.message}`);
        return;
      }
      
      console.log("✅ Ride saved successfully:", data);
      alert(`✅ Trip scheduled! You'll save ${co2SavedKg.toFixed(2)} kg CO2. Check Activity → Upcoming.`);
      
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
      // Reset to 15 minutes in the future
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 15);
      setScheduledDate(futureDate);
      onClose();
    } catch (error) {
      console.error("❌ Error in handleTripSubmit:", error);
      alert(`Error: ${error}`);
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  if (!visible) return null;

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.sheetWrapper}
    >
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handle} />
        
        <View style={styles.header}>
          {step === 'mode' && (
            <TouchableOpacity onPress={() => setStep('location')}>
              <ChevronDown size={24} color="#333" style={{transform: [{rotate: '90deg'}]}} />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>{step === "location" ? "Plan Trip" : "Select Mode"}</Text>
          <TouchableOpacity onPress={handleClose}>
            <X size={24} color="#999" />
          </TouchableOpacity>
        </View>

        {/* STEP 1: LOCATION INPUTS */}
        {step === "location" && (
          <View style={{ flex: 1 }}>
            <CustomAddressInput
              placeholder=""
              icon={<Navigation2 size={20} color={COLORS.green} />}
              onSelect={(data) => {
                setOriginDescription(data.description);
                setOriginCoords({ lat: data.location.lat, lng: data.location.lng });
              }}
            />
            
            {/* Waypoint Input (Optional) */}
            {showWaypointInput ? (
              <View style={{ marginBottom: 12 }}>
                <CustomAddressInput
                  placeholder=""
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
              placeholder=""
              icon={<MapPin size={20} color={COLORS.red} />}
              onSelect={(data) => {
                setDestDescription(data.description);
                setDestCoords({ lat: data.location.lat, lng: data.location.lng });
              }}
            />
            
            <TouchableOpacity 
              style={[styles.btn, (!originCoords || !destCoords) && {opacity: 0.5}]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStep("mode");
              }}
              disabled={!originCoords || !destCoords}
            >
              <Text style={styles.btnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2: MODE SELECTION */}
        {step === "mode" && (
          <View style={{ flex: 1 }}>
            {/* Role Toggle (Fixed at top) */}
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
                  <Text style={[styles.roleText, role === r && {color: COLORS.primary, fontWeight: "700"}]}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* SCROLLABLE CONTENT - Modes + Scheduler */}
            <ScrollView 
              style={{ flex: 1 }} 
              contentContainerStyle={{ paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Transport Mode List OR Rider Message */}
              {role === "rider" ? (
                <View style={styles.riderMessageContainer}>
                  <Users size={48} color={COLORS.primary} />
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
                    
                    // Calculate total trip CO2
                    const totalCO2Kg = routeDistance * m.co2; // in kg
                    const totalCO2Grams = totalCO2Kg * 1000; // in grams
                    
                    // Format CO2 display
                    let co2Display = "0 g";
                    if (m.co2 === 0) {
                      co2Display = "Zero Emissions";
                    } else if (routeDistance === 0) {
                      co2Display = "—"; // Show dash if no route yet
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
                        <View style={[styles.iconBox, {backgroundColor: m.color + '20'}]}>
                          <IconComponent size={24} color={m.color} />
                        </View>
                        <Text style={[styles.modeLabel, isSelected && {color: COLORS.primary, fontWeight: "700"}]}>
                          {m.label}
                        </Text>
                        <Text style={styles.modeCo2}>{co2Display}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Date/Time Picker - Only for Driver/Rider */}
              {(role === "driver" || role === "rider") && (
                <View style={styles.schedulerContainer}>
                  <TouchableOpacity 
                    style={styles.schedulerBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowDatePicker(true);
                    }}
                  >
                    <Calendar size={20} color={COLORS.primary} />
                    <Text style={styles.schedulerText}>
                      {scheduledDate.toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                    </Text>
                  </TouchableOpacity>
                  
                  {showDatePicker && (
                    <DateTimePicker
                      value={scheduledDate}
                      mode="datetime"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(event, date) => {
                        setShowDatePicker(Platform.OS === "ios");
                        if (date) setScheduledDate(date);
                      }}
                    />
                  )}
                </View>
              )}
            </ScrollView>

            {/* STICKY FOOTER - Submit Button (Always visible at bottom) */}
            {((role === "solo" || role === "driver") && selectedMode) || role === "rider" ? (
              <View style={styles.stickyFooter}>
                <TouchableOpacity 
                  style={styles.btn}
                  onPress={handleTripSubmit}
                >
                  <Text style={styles.btnText}>Submit my trip</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  sheetWrapper: { 
    position: "absolute", 
    bottom: 0, 
    width: "100%", 
    zIndex: 100 
  },
  sheet: {
    backgroundColor: "white",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    height: height * 0.7,
    shadowColor: "#000", 
    shadowOpacity: 0.2, 
    shadowRadius: 10, 
    elevation: 10,
  },
  handle: { 
    width: 40, 
    height: 5, 
    backgroundColor: "#E0E0E0", 
    borderRadius: 10, 
    alignSelf: "center", 
    marginBottom: 20 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 20 
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
  modeListContainer: {
    flex: 1,
    marginBottom: 16,
  },
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

  // Sticky Footer for Submit Button
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGray,
    // Add shadow to separate from content
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },

  // Button
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 0,
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


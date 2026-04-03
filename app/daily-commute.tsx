import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import {
  Car,
  Users,
  Clock,
  ChevronLeft,
  CheckCircle,
  X,
  Minus,
  Plus,
  MapPin,
  AlertCircle,
} from "lucide-react-native";
import { useDailyCommuteStore, TripIntentMatch } from "../store/useDailyCommuteStore";
import { useTheme } from "../contexts/ThemeContext";
import { getThemeColors } from "../lib/theme";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  accent: "#FDD835",
  green: "#4CAF50",
  red: "#EF4444",
  gray: "#90A4AE",
  white: "#FFFFFF",
  light: "#E0F7FA",
  background: "#F5FAFA",
  textSecondary: "#546E7A",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" });
}

function CountdownTimer({ targetHour = 17 }: { targetHour?: number }) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const target = new Date(now);
      target.setHours(targetHour, 30, 0, 0);
      if (now >= target) { setTimeLeft("Matching now…"); return; }
      const diff = target.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetHour]);
  return <Text style={styles.countdown}>{timeLeft}</Text>;
}

// ─── Step: Role Select ────────────────────────────────────────────────────────

function RoleSelectStep({ onSelect }: { onSelect: (role: "driver" | "passenger") => void }) {
  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Tomorrow's Commute</Text>
      <Text style={styles.stepSubtitle}>{getTomorrow()}</Text>
      <Text style={styles.stepDescription}>How are you getting to work tomorrow?</Text>
      <TouchableOpacity style={styles.roleCard} onPress={() => onSelect("driver")} activeOpacity={0.8}>
        <View style={[styles.roleIconWrap, { backgroundColor: COLORS.light }]}>
          <Car size={32} color={COLORS.primary} />
        </View>
        <View style={styles.roleCardText}>
          <Text style={styles.roleCardTitle}>I'll Drive</Text>
          <Text style={styles.roleCardSub}>Offer seats to nearby colleagues</Text>
        </View>
        <ChevronLeft size={20} color={COLORS.gray} style={{ transform: [{ rotate: "180deg" }] }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.roleCard} onPress={() => onSelect("passenger")} activeOpacity={0.8}>
        <View style={[styles.roleIconWrap, { backgroundColor: "#FFF8E1" }]}>
          <Users size={32} color={COLORS.accent} />
        </View>
        <View style={styles.roleCardText}>
          <Text style={styles.roleCardTitle}>I Need a Ride</Text>
          <Text style={styles.roleCardSub}>Get matched with a driver near you</Text>
        </View>
        <ChevronLeft size={20} color={COLORS.gray} style={{ transform: [{ rotate: "180deg" }] }} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step: Driver Details ─────────────────────────────────────────────────────

function DriverDetailsStep({
  onSubmit,
  isLoading,
}: {
  onSubmit: (capacity: number, departureTime: string) => void;
  isLoading: boolean;
}) {
  const [capacity, setCapacity] = useState(1);
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");

  const handleSubmit = () => {
    const h = parseInt(hour);
    if (isNaN(h) || h < 6 || h > 9) {
      Alert.alert("Invalid Time", "Departure must be between 06:00 and 09:00.");
      return;
    }
    onSubmit(capacity, `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Driver Details</Text>
      <Text style={styles.stepSubtitle}>{getTomorrow()}</Text>

      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>Passengers you can take</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => setCapacity(c => Math.max(0, c - 1))}
          >
            <Minus size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{capacity}</Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => setCapacity(c => Math.min(9, c + 1))}
          >
            <Plus size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.fieldHint}>0 = just tracking your commute</Text>
      </View>

      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>Planned departure time</Text>
        <View style={styles.timeRow}>
          <TextInput
            style={styles.timeInput}
            value={hour}
            onChangeText={setHour}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="08"
            placeholderTextColor={COLORS.gray}
          />
          <Text style={styles.timeSep}>:</Text>
          <TextInput
            style={styles.timeInput}
            value={minute}
            onChangeText={setMinute}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="00"
            placeholderTextColor={COLORS.gray}
          />
        </View>
        <Text style={styles.fieldHint}>Between 06:00 and 09:00</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Submit Intent</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step: Submitted (driver or passenger) ────────────────────────────────────

function SubmittedStep({ role }: { role: "driver" | "passenger" }) {
  return (
    <View style={styles.centeredStep}>
      <View style={styles.bigCheckWrap}>
        <CheckCircle size={64} color={COLORS.green} />
      </View>
      <Text style={styles.stepTitle}>You're Registered!</Text>
      <Text style={styles.stepDescription}>
        {role === "driver"
          ? "We'll find passenger matches and notify you at 17:30."
          : "We'll find a driver match and notify you at 17:30."}
      </Text>
      <View style={styles.countdownCard}>
        <Clock size={18} color={COLORS.primary} />
        <Text style={styles.countdownLabel}>Match notification in</Text>
        <CountdownTimer targetHour={17} />
      </View>
      <Text style={styles.stepHint}>Keep notifications on to receive your match.</Text>
    </View>
  );
}

// ─── Step: Driver Review ──────────────────────────────────────────────────────

function DriverReviewStep({
  matches,
  onConfirm,
  isLoading,
}: {
  matches: TripIntentMatch[];
  onConfirm: (acceptedIds: string[], declinedIds: string[]) => void;
  isLoading: boolean;
}) {
  const pending = matches.filter(m => m.status === "pending_driver_review");
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set(pending.map(m => m.id)));

  const toggle = (id: string) => {
    setAcceptedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const acc = pending.filter(m => acceptedIds.has(m.id)).map(m => m.id);
    const dec = pending.filter(m => !acceptedIds.has(m.id)).map(m => m.id);
    onConfirm(acc, dec);
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Passenger Matches</Text>
      <Text style={styles.stepDescription}>
        {pending.length} match{pending.length !== 1 ? "es" : ""} found for tomorrow. Select who to accept.
      </Text>

      {pending.map(match => {
        const accepted = acceptedIds.has(match.id);
        return (
          <TouchableOpacity
            key={match.id}
            style={[styles.matchCard, accepted && styles.matchCardAccepted]}
            onPress={() => toggle(match.id)}
            activeOpacity={0.85}
          >
            <View style={styles.matchCardLeft}>
              <View style={styles.matchAvatar}>
                <Users size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.matchName}>
                  {match.passenger_profile?.first_name ?? "Passenger"}
                </Text>
                <Text style={styles.matchDetail}>
                  {match.ai_compatibility_score?.toFixed(0) ?? "—"}% match · {match.pickup_address?.split(",")[0] ?? "Pickup TBD"}
                </Text>
                {!!match.ai_reasoning && (
                  <Text style={styles.matchReasoning} numberOfLines={2}>{match.ai_reasoning}</Text>
                )}
              </View>
            </View>
            <View style={[styles.matchCheckbox, accepted && styles.matchCheckboxChecked]}>
              {accepted && <CheckCircle size={18} color={COLORS.white} />}
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
        onPress={handleConfirm}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Confirm Selections</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step: Driver Detour ──────────────────────────────────────────────────────

function DriverDetourStep({
  onConfirm,
  isLoading,
  acceptedIds,
}: {
  onConfirm: (detour: "flexible" | "fixed") => void;
  isLoading: boolean;
  acceptedIds: string[];
}) {
  const [choice, setChoice] = useState<"flexible" | "fixed">("flexible");

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Route Preference</Text>
      <Text style={styles.stepDescription}>
        How flexible are you with your driving route?
      </Text>

      <TouchableOpacity
        style={[styles.detourCard, choice === "flexible" && styles.detourCardSelected]}
        onPress={() => setChoice("flexible")}
        activeOpacity={0.85}
      >
        <MapPin size={24} color={choice === "flexible" ? COLORS.primary : COLORS.gray} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.detourTitle, choice === "flexible" && { color: COLORS.primary }]}>Flexible</Text>
          <Text style={styles.detourSub}>I'll pick up passengers near my route</Text>
        </View>
        {choice === "flexible" && <CheckCircle size={20} color={COLORS.primary} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.detourCard, choice === "fixed" && styles.detourCardSelected]}
        onPress={() => setChoice("fixed")}
        activeOpacity={0.85}
      >
        <Car size={24} color={choice === "fixed" ? COLORS.primary : COLORS.gray} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.detourTitle, choice === "fixed" && { color: COLORS.primary }]}>Fixed Route</Text>
          <Text style={styles.detourSub}>Passengers must come to a fixed pickup point</Text>
        </View>
        {choice === "fixed" && <CheckCircle size={20} color={COLORS.primary} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
        onPress={() => onConfirm(choice)}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Confirm &amp; Notify Passengers</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step: Driver Waiting ─────────────────────────────────────────────────────

function DriverWaitingStep({ matches }: { matches: TripIntentMatch[] }) {
  const accepted = matches.filter(m => m.status === "driver_accepted");
  return (
    <View style={styles.centeredStep}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 20 }} />
      <Text style={styles.stepTitle}>Waiting for Confirmation</Text>
      <Text style={styles.stepDescription}>
        {accepted.length} passenger{accepted.length !== 1 ? "s" : ""} notified. Waiting for them to confirm.
      </Text>
      <Text style={styles.stepHint}>You'll be notified when they respond.</Text>
    </View>
  );
}

// ─── Step: Driver Confirmed ───────────────────────────────────────────────────

function DriverConfirmedStep({ matches }: { matches: TripIntentMatch[] }) {
  const confirmed = matches.filter(m => m.status === "confirmed");
  return (
    <ScrollView contentContainerStyle={styles.centeredStep} showsVerticalScrollIndicator={false}>
      <View style={styles.bigCheckWrap}>
        <CheckCircle size={64} color={COLORS.green} />
      </View>
      <Text style={styles.stepTitle}>Ride Confirmed!</Text>
      <Text style={styles.stepDescription}>You have {confirmed.length} confirmed passenger{confirmed.length !== 1 ? "s" : ""}.</Text>
      {confirmed.map(match => (
        <View key={match.id} style={styles.confirmedCard}>
          <Users size={18} color={COLORS.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.confirmedName}>{match.passenger_profile?.first_name ?? "Passenger"}</Text>
            <Text style={styles.confirmedDetail}>
              Pickup: {match.pickup_address?.split(",")[0] ?? "TBD"} · {match.proposed_pickup_time ?? "—"}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Step: Passenger Details ──────────────────────────────────────────────────

function PassengerDetailsStep({
  onSubmit,
  isLoading,
}: {
  onSubmit: (arrivalTime: string) => void;
  isLoading: boolean;
}) {
  const [hour, setHour] = useState("09");
  const [minute, setMinute] = useState("00");

  const handleSubmit = () => {
    onSubmit(`${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Arrival Time</Text>
      <Text style={styles.stepSubtitle}>{getTomorrow()}</Text>
      <Text style={styles.stepDescription}>What time do you need to arrive at work?</Text>

      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>I need to arrive by</Text>
        <View style={styles.timeRow}>
          <TextInput
            style={styles.timeInput}
            value={hour}
            onChangeText={setHour}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="09"
            placeholderTextColor={COLORS.gray}
          />
          <Text style={styles.timeSep}>:</Text>
          <TextInput
            style={styles.timeInput}
            value={minute}
            onChangeText={setMinute}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="00"
            placeholderTextColor={COLORS.gray}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Find a Driver</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step: Passenger Review ───────────────────────────────────────────────────

function PassengerReviewStep({
  matches,
  onRespond,
  isLoading,
}: {
  matches: TripIntentMatch[];
  onRespond: (matchId: string, accepted: boolean) => void;
  isLoading: boolean;
}) {
  const available = matches.filter(m => m.status === "driver_accepted");
  const match = available[0];

  if (!match) {
    return (
      <View style={styles.centeredStep}>
        <AlertCircle size={48} color={COLORS.gray} />
        <Text style={styles.stepTitle}>No Matches Available</Text>
        <Text style={styles.stepDescription}>
          No drivers accepted your request. Check again tomorrow.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Driver Match Found!</Text>
      <Text style={styles.stepDescription}>Review your match for tomorrow.</Text>

      <View style={styles.driverMatchCard}>
        <View style={styles.matchCardLeft}>
          <View style={styles.matchAvatar}>
            <Car size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.matchName}>{match.driver_profile?.first_name ?? "Driver"}</Text>
            <Text style={styles.matchDetail}>
              Departs {match.proposed_departure ?? "—"} · {match.ai_compatibility_score?.toFixed(0) ?? "—"}% match
            </Text>
            <Text style={styles.matchDetail}>
              Pickup: {match.pickup_address ?? "To be confirmed"}
            </Text>
            {!!match.ai_reasoning && (
              <Text style={styles.matchReasoning} numberOfLines={3}>{match.ai_reasoning}</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.respondRow}>
        <TouchableOpacity
          style={[styles.declineBtn, isLoading && { opacity: 0.7 }]}
          onPress={() => onRespond(match.id, false)}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <X size={18} color={COLORS.red} />
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.acceptBtn, isLoading && { opacity: 0.7 }]}
          onPress={() => onRespond(match.id, true)}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <CheckCircle size={18} color={COLORS.white} />
              <Text style={styles.acceptBtnText}>Accept Ride</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Step: Passenger Confirmed ────────────────────────────────────────────────

function PassengerConfirmedStep({ matches }: { matches: TripIntentMatch[] }) {
  const confirmed = matches.find(m => m.status === "confirmed");
  return (
    <View style={styles.centeredStep}>
      <View style={styles.bigCheckWrap}>
        <CheckCircle size={64} color={COLORS.green} />
      </View>
      <Text style={styles.stepTitle}>Ride Confirmed!</Text>
      {confirmed ? (
        <>
          <View style={styles.confirmedCard}>
            <Car size={18} color={COLORS.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.confirmedName}>{confirmed.driver_profile?.first_name ?? "Driver"} picks you up</Text>
              <Text style={styles.confirmedDetail}>
                At {confirmed.pickup_address?.split(",")[0] ?? "pickup point"} · {confirmed.proposed_pickup_time ?? confirmed.proposed_departure ?? "—"}
              </Text>
            </View>
          </View>
          <Text style={styles.stepHint}>
            Your driver will contact you if plans change.
          </Text>
        </>
      ) : (
        <Text style={styles.stepDescription}>Your ride is confirmed for tomorrow.</Text>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DailyCommuteScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const TC = getThemeColors(isDark);

  const {
    step,
    intent,
    matches,
    isLoading,
    error,
    selectedRole,
    setStep,
    setSelectedRole,
    checkExistingIntent,
    submitIntent,
    respondAsDriver,
    respondAsPassenger,
    subscribeToMatches,
    reset,
  } = useDailyCommuteStore();

  // Accepted IDs staged during driver_review → needed for driver_detour step
  const pendingAcceptedIds = useRef<string[]>([]);
  const pendingDeclinedIds = useRef<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      checkExistingIntent();
    }, [])
  );

  useEffect(() => {
    if (!intent) return;
    const unsub = subscribeToMatches();
    return unsub;
  }, [intent?.id]);

  const handleRoleSelect = (role: "driver" | "passenger") => {
    setSelectedRole(role);
    setStep(role === "driver" ? "driver_details" : "passenger_details");
  };

  const handleDriverDetailsSubmit = async (capacity: number, departureTime: string) => {
    try {
      await submitIntent({ role: "driver", passenger_capacity: capacity, departure_time: departureTime });
    } catch {
      Alert.alert("Error", "Could not submit your intent. Check your profile has home/work addresses set.");
    }
  };

  const handlePassengerDetailsSubmit = async (arrivalTime: string) => {
    try {
      await submitIntent({ role: "passenger", required_arrival_time: arrivalTime });
    } catch {
      Alert.alert("Error", "Could not submit your intent. Check your profile has home/work addresses set.");
    }
  };

  const handleDriverReviewConfirm = (acceptedIds: string[], declinedIds: string[]) => {
    pendingAcceptedIds.current = acceptedIds;
    pendingDeclinedIds.current = declinedIds;
    setStep("driver_detour");
  };

  const handleDriverDetourConfirm = async (detour: "flexible" | "fixed") => {
    try {
      await respondAsDriver({
        accepted_ids: pendingAcceptedIds.current,
        declined_ids: pendingDeclinedIds.current,
        detour_preference: detour,
      });
    } catch {
      Alert.alert("Error", "Could not save your preferences. Please try again.");
    }
  };

  const handlePassengerRespond = async (matchId: string, accepted: boolean) => {
    try {
      await respondAsPassenger({ match_id: matchId, accepted });
    } catch {
      Alert.alert("Error", "Could not save your response. Please try again.");
    }
  };

  const handleBack = () => {
    if (step === "driver_details" || step === "passenger_details") {
      setStep("role_select");
    } else if (step === "driver_detour") {
      setStep("driver_review");
    } else {
      router.back();
    }
  };

  const showBackBtn = ["driver_details", "passenger_details", "driver_detour"].includes(step);
  const showCloseBtn = !showBackBtn;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
      {/* Header */}
      <View style={styles.header}>
        {showBackBtn ? (
          <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
            <ChevronLeft size={24} color={TC.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={[styles.headerTitle, { color: TC.text }]}>Daily Commute</Text>
        {showCloseBtn ? (
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <X size={22} color={TC.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {/* Error banner */}
      {!!error && (
        <View style={styles.errorBanner}>
          <AlertCircle size={16} color={COLORS.red} />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
        </View>
      )}

      {/* Steps */}
      {step === "role_select" && <RoleSelectStep onSelect={handleRoleSelect} />}
      {step === "driver_details" && (
        <DriverDetailsStep onSubmit={handleDriverDetailsSubmit} isLoading={isLoading} />
      )}
      {step === "driver_submitted" && <SubmittedStep role="driver" />}
      {step === "driver_review" && (
        <DriverReviewStep matches={matches} onConfirm={handleDriverReviewConfirm} isLoading={isLoading} />
      )}
      {step === "driver_detour" && (
        <DriverDetourStep
          onConfirm={handleDriverDetourConfirm}
          isLoading={isLoading}
          acceptedIds={pendingAcceptedIds.current}
        />
      )}
      {step === "driver_waiting" && <DriverWaitingStep matches={matches} />}
      {step === "driver_confirmed" && <DriverConfirmedStep matches={matches} />}
      {step === "passenger_details" && (
        <PassengerDetailsStep onSubmit={handlePassengerDetailsSubmit} isLoading={isLoading} />
      )}
      {step === "passenger_submitted" && <SubmittedStep role="passenger" />}
      {step === "passenger_review" && (
        <PassengerReviewStep matches={matches} onRespond={handlePassengerRespond} isLoading={isLoading} />
      )}
      {step === "passenger_confirmed" && <PassengerConfirmedStep matches={matches} />}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECACA",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.red,
  },

  // ── Step shared ──
  stepContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  centeredStep: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.primaryDark,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  stepHint: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: "center",
    marginTop: 4,
  },

  // ── Role cards ──
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  roleIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  roleCardText: {
    flex: 1,
  },
  roleCardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  roleCardSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // ── Fields ──
  fieldCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primaryDark,
    marginBottom: 12,
  },
  fieldHint: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 8,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.primaryDark,
    minWidth: 32,
    textAlign: "center",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeInput: {
    width: 72,
    height: 56,
    borderWidth: 1.5,
    borderColor: "#D1FAE5",
    borderRadius: 14,
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.primaryDark,
    textAlign: "center",
    backgroundColor: "#F0FDFA",
    ...Platform.select({ ios: {}, android: { paddingVertical: 0 } }),
  },
  timeSep: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },

  // ── Countdown ──
  bigCheckWrap: {
    marginBottom: 12,
  },
  countdownCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.light,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginTop: 8,
  },
  countdownLabel: {
    fontSize: 14,
    color: COLORS.primaryDark,
    fontWeight: "500",
  },
  countdown: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.primary,
  },

  // ── Match cards ──
  matchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  matchCardAccepted: {
    borderColor: COLORS.primary,
    backgroundColor: "#F0FDFA",
  },
  matchCardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 12,
  },
  matchAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
  },
  matchName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  matchDetail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  matchReasoning: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
    fontStyle: "italic",
    lineHeight: 16,
  },
  matchCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  matchCheckboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  // ── Driver match card (passenger view) ──
  driverMatchCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: "#B2EBF2",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  // ── Detour cards ──
  detourCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  detourCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: "#F0FDFA",
  },
  detourTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  detourSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // ── Confirmed card ──
  confirmedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FFF4",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    gap: 10,
    width: "100%",
  },
  confirmedName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  confirmedDetail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // ── Respond row (passenger) ──
  respondRow: {
    flexDirection: "row",
    gap: 12,
  },
  declineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: COLORS.red,
    borderRadius: 14,
    paddingVertical: 14,
  },
  declineBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.red,
  },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
  },

  // ── Primary button ──
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.white,
  },
});

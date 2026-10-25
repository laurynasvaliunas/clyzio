import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { KeyboardScroll } from "../components/ui/KeyboardScroll";
import { Text, TextInput } from "../components/ui/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Car,
  Users,
  Clock,
  ChevronLeft,
  CheckCircle,
  X,
  Minus,
  Plus,
  AlertCircle,
  MessageCircle,
} from "lucide-react-native";
import {
  useDailyCommuteStore,
  CarpoolError,
  type CarpoolOutcome,
  type TripIntentMatch,
} from "../store/useDailyCommuteStore";
import PickupDetails from "../components/PickupDetails";
import { dayLabel, tomorrowLocalISODate } from "../lib/localDate";
import OpenTripToggle from "../components/OpenTripToggle";
import { supabase } from "../lib/supabase";
import { formatClockTime } from "../lib/format";
import { useTheme } from "../contexts/ThemeContext";
import { getThemeColors } from "../lib/theme";
import { elevation as ELEVATION, depth } from "../lib/theme/tokens";
import { GlowBackdrop } from "../components/ui";
import ChatModal from "../components/ChatModal";
import { useChatStore, selectUnreadFor } from "../store/useChatStore";
import { UnreadBadge } from "../components/ui/UnreadBadge";
import type { ChatThread } from "../lib/chat";

// Ambient light across the top of the screen (decorative).
const GLOW_TOP = { bottom: undefined, height: 420 } as const;

const COLORS = {
  textMuted: "#5B6B7A",   // WCAG-AA muted text (#8B989C is 2.97:1 on white)
  primary: "#007C89",
  primaryDark: "#0B2540",
  accent: "#F59E0B",
  green: "#059669",
  red: "#DC2626",
  gray: "#8B989C",
  white: "#FFFFFF",
  light: "#E3FAFB",
  background: "#F4FAFB",
  textSecondary: "#5B6B7A",
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

function RoleSelectStep({
  onSelect,
  outcome,
}: {
  onSelect: (role: "driver" | "passenger") => void;
  outcome: CarpoolOutcome | null;
}) {
  return (
    <KeyboardScroll contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <OutcomeBanner outcome={outcome} />
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
        <View style={[styles.roleIconWrap, { backgroundColor: "#FFFBEB" }]}>
          <Users size={32} color={COLORS.accent} />
        </View>
        <View style={styles.roleCardText}>
          <Text style={styles.roleCardTitle}>I Need a Ride</Text>
          <Text style={styles.roleCardSub}>Get matched with a driver near you</Text>
        </View>
        <ChevronLeft size={20} color={COLORS.gray} style={{ transform: [{ rotate: "180deg" }] }} />
      </TouchableOpacity>
    </KeyboardScroll>
  );
}

// ─── Step: Driver Details ─────────────────────────────────────────────────────

function DriverDetailsStep({
  onSubmit,
  isLoading,
  hasCompany,
}: {
  onSubmit: (capacity: number, departureTime: string, openToIndependents: boolean) => void;
  isLoading: boolean;
  hasCompany: boolean;
}) {
  const [capacity, setCapacity] = useState(1);
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");
  const [openToIndependents, setOpenToIndependents] = useState(false);

  const handleSubmit = () => {
    const h = parseInt(hour);
    if (isNaN(h) || h < 6 || h > 9) {
      Alert.alert("Invalid Time", "Departure must be between 06:00 and 09:00.");
      return;
    }
    onSubmit(capacity, `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`, openToIndependents);
  };

  return (
    <KeyboardScroll contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Driver Details</Text>
      <Text style={styles.stepSubtitle}>{getTomorrow()}</Text>

      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>Passengers you can take</Text>
        <View style={styles.stepper}>
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="One fewer passenger"
            style={styles.stepperBtn}
            onPress={() => setCapacity(c => Math.max(0, c - 1))}
          >
            <Minus size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{capacity}</Text>
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="One more passenger"
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

      {hasCompany && <OpenTripToggle value={openToIndependents} onChange={setOpenToIndependents} />}

      <TouchableOpacity
        style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color="#0B2540" />
        ) : (
          <Text style={styles.primaryBtnText}>Submit Intent</Text>
        )}
      </TouchableOpacity>
    </KeyboardScroll>
  );
}

// ─── Step: Submitted (searching) ──────────────────────────────────────────────

// Carpool cutoff hour (local). After it, a trip for tomorrow still without a
// match also gets the greener options. Mirror of the server-side nudge.
const CARPOOL_CUTOFF_HOUR = 16;

/** "for tomorrow" / "for today" / "on Tue 27 Oct". */
function forDay(tripDate: string | null | undefined): string {
  if (!tripDate) return "for tomorrow";
  const label = dayLabel(tripDate);
  return label === "Today" || label === "Tomorrow" ? `for ${label.toLowerCase()}` : `on ${label}`;
}

/** What last happened: the other person cancelled, or the trip is done. */
function OutcomeBanner({ outcome }: { outcome: CarpoolOutcome | null }) {
  if (!outcome) return null;
  const done = outcome.kind === "trip_done";
  const text = done
    ? `Your carpool ${forDay(outcome.tripDate)} is done. Thanks for sharing the ride!`
    : `${outcome.name ?? "Your match"} cancelled. We're looking for another match.`;
  return (
    <View style={[styles.outcomeBanner, done && styles.outcomeBannerDone]}>
      {done ? <CheckCircle size={16} color={COLORS.green} /> : <AlertCircle size={16} color={COLORS.accent} />}
      <Text style={styles.outcomeText}>{text}</Text>
    </View>
  );
}

/** A quiet text button for the way out (stop looking / cancel the carpool). */
function QuietButton({ label, a11y, onPress, busy }: { label: string; a11y: string; onPress: () => void; busy?: boolean }) {
  return (
    <TouchableOpacity
      style={styles.quietBtn}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={styles.quietBtnText}>{busy ? "One moment…" : label}</Text>
    </TouchableOpacity>
  );
}

function SubmittedStep({
  role,
  tripDate,
  outcome,
  onSeeOptions,
  onStopLooking,
  busy,
}: {
  role: "driver" | "passenger";
  tripDate: string | null;
  outcome: CarpoolOutcome | null;
  onSeeOptions?: () => void;
  onStopLooking: () => void;
  busy: boolean;
}) {
  const counterpart = role === "driver" ? "passengers" : "a driver";
  // PDF 2c — no dead end: late in the day, also offer the greenest options.
  const late = tripDate === tomorrowLocalISODate() && new Date().getHours() >= CARPOOL_CUTOFF_HOUR;
  return (
    <View style={styles.centeredStep}>
      <OutcomeBanner outcome={outcome} />
      <View style={styles.bigCheckWrap}>
        <CheckCircle size={64} color={COLORS.green} />
      </View>
      <Text style={styles.stepTitle}>You're registered!</Text>
      <Text style={[styles.stepDescription, { textAlign: "center" }]}>
        Looking for {counterpart} {forDay(tripDate)}. We match anyone on your route - also along the
        way - and tell you right away.
      </Text>
      {late && onSeeOptions && (
        <TouchableOpacity style={styles.greenOptionsBtn} onPress={onSeeOptions}>
          <Text style={styles.greenOptionsBtnText}>See your greenest options</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.stepHint}>Keep notifications on to receive your match.</Text>
      <QuietButton label="Stop looking" a11y="Stop looking for a carpool" onPress={onStopLooking} busy={busy} />
    </View>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

type OnChat = (match: TripIntentMatch) => void;

/** "Message <name>": matched people can talk before either approves. */
function MessageButton({
  name,
  onPress,
  centered = false,
  match,
}: {
  name: string;
  onPress: () => void;
  /** In the centred waiting / confirmed steps. */
  centered?: boolean;
  /** The match this chat belongs to: shows its unread count. */
  match?: TripIntentMatch;
}) {
  const unread = useChatStore(
    selectUnreadFor(match ? [`match:${match.id}`, match.ride_id ? `ride:${match.ride_id}` : null] : []),
  );
  return (
    <TouchableOpacity
      style={[styles.messageBtn, centered && { alignSelf: "center" }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Message ${name}`}
    >
      <MessageCircle size={16} color={COLORS.primary} />
      <Text style={styles.messageBtnText}>Message {name}</Text>
      <UnreadBadge count={unread} />
    </TouchableOpacity>
  );
}

// ─── Step: Driver Review ──────────────────────────────────────────────────────

/** Employees see this on matches with commuters outside their company (045). */
function OutsideCompanyPill() {
  return (
    <View style={styles.outsidePill}>
      <Text style={styles.outsidePillText}>Outside your company</Text>
    </View>
  );
}

const isOffer = (m: TripIntentMatch) => m.status === "pending" || m.status === "awaiting_other";

function DriverReviewStep({
  matches,
  tripDate,
  onRespond,
  hasCompany,
  onChat,
}: {
  matches: TripIntentMatch[];
  tripDate: string | null;
  onRespond: (matchId: string, accepted: boolean) => Promise<void>;
  hasCompany: boolean;
  onChat: OnChat;
}) {
  // Symmetric approval: every open offer the driver hasn't answered yet, also
  // when another passenger is already confirmed (a free seat).
  const pending = matches.filter((m) => !m.driver_approved && isOffer(m));
  const riding = matches.filter((m) => m.status === "confirmed").length;
  const [busyId, setBusyId] = useState<string | null>(null);

  const respond = async (id: string, accepted: boolean) => {
    setBusyId(id);
    try {
      await onRespond(id, accepted);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <KeyboardScroll contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Passenger Matches</Text>
      <Text style={styles.stepDescription}>
        {pending.length} rider{pending.length !== 1 ? "s" : ""} on your way {forDay(tripDate)}. Check the
        pickup, then accept or decline.{riding > 0 ? ` ${riding} already riding with you.` : ""}
      </Text>

      {pending.map((match) => {
        const name = match.passenger_profile?.first_name ?? "Passenger";
        const busy = busyId === match.id;
        return (
          <View key={match.id} style={styles.driverMatchCard}>
            <View style={styles.matchCardLeft}>
              <View style={styles.matchAvatar}>
                <Users size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.matchName}>{name}</Text>
                {hasCompany && match.peer_is_colleague === false && <OutsideCompanyPill />}
                {match.passenger_approved && <Text style={styles.matchDetail}>{name} already accepted</Text>}
                {!!match.ai_reasoning && (
                  <Text style={styles.matchReasoning} numberOfLines={3}>{match.ai_reasoning}</Text>
                )}
              </View>
            </View>
            <PickupDetails match={match} viewer="driver" peerName={name} />
            <MessageButton match={match} name={name} onPress={() => onChat(match)} />
            <View style={[styles.respondRow, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.declineBtn, busyId !== null && { opacity: 0.7 }]}
                onPress={() => respond(match.id, false)}
                disabled={busyId !== null}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Decline ${name}`}
              >
                <X size={18} color={COLORS.red} />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, busyId !== null && { opacity: 0.7 }]}
                onPress={() => respond(match.id, true)}
                disabled={busyId !== null}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Accept ${name}`}
              >
                {busy ? (
                  <ActivityIndicator color="#0B2540" size="small" />
                ) : (
                  <>
                    <CheckCircle size={18} color="#0B2540" />
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </KeyboardScroll>
  );
}

// ─── Step: Waiting (either role) ──────────────────────────────────────────────

/** Ask before withdrawing — the other person is told the carpool is off. */
function confirmWithdraw(matchIds: string[], onWithdraw: (ids: string[]) => void) {
  Alert.alert(
    "Withdraw request?",
    "The other person will be told this carpool is off.",
    [
      { text: "Keep it", style: "cancel" },
      { text: "Withdraw", style: "destructive", onPress: () => onWithdraw(matchIds) },
    ],
  );
}

interface WaitingStepProps {
  matches: TripIntentMatch[];
  onWithdraw: (matchIds: string[]) => void;
  busy: boolean;
  onChat: OnChat;
}

function DriverWaitingStep({ matches, onWithdraw, busy, onChat }: WaitingStepProps) {
  // Driver has approved; waiting on the passenger to approve too.
  const waiting = matches.filter(m => m.driver_approved && !m.passenger_approved && m.status === "awaiting_other");
  return (
    <KeyboardScroll contentContainerStyle={styles.scrollCentered} showsVerticalScrollIndicator={false}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 20 }} />
      <Text style={styles.stepTitle}>You're in - waiting for them</Text>
      <Text style={styles.stepDescription}>
        You accepted {waiting.length} passenger{waiting.length !== 1 ? "s" : ""}. Waiting for them to accept too.
      </Text>
      <Text style={styles.stepHint}>The ride is confirmed once you both accept. You'll be notified.</Text>
      {waiting.map((m) => {
        const name = m.passenger_profile?.first_name ?? "passenger";
        return (
          <View key={m.id} style={styles.waitingCard}>
            <Text style={styles.confirmedName}>{name}</Text>
            <PickupDetails match={m} viewer="driver" peerName={name} showMap={false} />
            <MessageButton match={m} name={name} onPress={() => onChat(m)} />
          </View>
        );
      })}
      <TouchableOpacity
        style={[styles.declineBtn, styles.withdrawBtn]}
        onPress={() => confirmWithdraw(waiting.map((m) => m.id), onWithdraw)}
        disabled={busy || waiting.length === 0}
        accessibilityRole="button"
        accessibilityLabel="Withdraw your carpool request"
      >
        <Text style={styles.declineBtnText}>{busy ? "Withdrawing…" : "Withdraw request"}</Text>
      </TouchableOpacity>
    </KeyboardScroll>
  );
}

function PassengerWaitingStep({ matches, onWithdraw, busy, onChat }: WaitingStepProps) {
  // Passenger has approved; waiting on the driver to approve too.
  const waiting = matches.filter(m => m.passenger_approved && !m.driver_approved && m.status === "awaiting_other");
  const driverName = waiting[0]?.driver_profile?.first_name ?? "your driver";
  return (
    <KeyboardScroll contentContainerStyle={styles.scrollCentered} showsVerticalScrollIndicator={false}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 20 }} />
      <Text style={styles.stepTitle}>You're in - waiting for them</Text>
      <Text style={styles.stepDescription}>
        You accepted the carpool with {driverName}. Waiting for them to accept too.
      </Text>
      <Text style={styles.stepHint}>The ride is confirmed once you both accept. You'll be notified.</Text>
      {waiting[0] && (
        <View style={styles.waitingCard}>
          <PickupDetails match={waiting[0]} viewer="passenger" peerName={driverName} showMap={false} />
          <MessageButton match={waiting[0]} name={driverName} onPress={() => onChat(waiting[0])} />
        </View>
      )}
      <TouchableOpacity
        style={[styles.declineBtn, styles.withdrawBtn]}
        onPress={() => confirmWithdraw(waiting.map((m) => m.id), onWithdraw)}
        disabled={busy || waiting.length === 0}
        accessibilityRole="button"
        accessibilityLabel="Withdraw your carpool request"
      >
        <Text style={styles.declineBtnText}>{busy ? "Withdrawing…" : "Withdraw request"}</Text>
      </TouchableOpacity>
    </KeyboardScroll>
  );
}

// ─── Step: Driver Confirmed ───────────────────────────────────────────────────

type OnCancelCarpool = (match: TripIntentMatch, partnerName: string) => void;

function DriverConfirmedStep({
  matches,
  onChat,
  onCancel,
  busy,
}: {
  matches: TripIntentMatch[];
  onChat: OnChat;
  onCancel: OnCancelCarpool;
  busy: boolean;
}) {
  const router = useRouter();
  const confirmed = matches.filter(m => m.status === "confirmed");
  const waiting = matches.filter((m) => isOffer(m) && m.driver_approved);
  return (
    <KeyboardScroll contentContainerStyle={styles.scrollCentered} showsVerticalScrollIndicator={false}>
      <View style={styles.bigCheckWrap}>
        <CheckCircle size={64} color={COLORS.green} />
      </View>
      <Text style={styles.stepTitle}>Ride Confirmed!</Text>
      <Text style={styles.stepDescription}>You have {confirmed.length} confirmed passenger{confirmed.length !== 1 ? "s" : ""}.</Text>
      {confirmed.map(match => {
        const name = match.passenger_profile?.first_name ?? "Passenger";
        return (
          <View key={match.id} style={{ width: "100%" }}>
            <View style={styles.confirmedCardColumn}>
              <View style={styles.confirmedHead}>
                <Users size={18} color={COLORS.primary} />
                <Text style={styles.confirmedName}>{name}</Text>
              </View>
              <PickupDetails match={match} viewer="driver" peerName={name} />
            </View>
            <MessageButton centered match={match} name={name} onPress={() => onChat(match)} />
            {match.ride_id && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push(`/trip/${match.ride_id}` as any)}
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>View pickup & start trip</Text>
              </TouchableOpacity>
            )}
            {match.ride_id && (
              <QuietButton
                label="Cancel carpool"
                a11y={`Cancel the carpool with ${name}`}
                onPress={() => onCancel(match, name)}
                busy={busy}
              />
            )}
          </View>
        );
      })}
      {waiting.length > 0 && (
        <Text style={styles.stepHint}>
          Waiting for {waiting.map((m) => m.passenger_profile?.first_name ?? "a passenger").join(", ")} to accept too.
        </Text>
      )}
    </KeyboardScroll>
  );
}

// ─── Step: Passenger Details ──────────────────────────────────────────────────

function PassengerDetailsStep({
  onSubmit,
  isLoading,
  hasCompany,
}: {
  onSubmit: (leavingTime: string, openToIndependents: boolean) => void;
  isLoading: boolean;
  hasCompany: boolean;
}) {
  const [hour, setHour] = useState("08");
  const [minute, setMinute] = useState("00");
  const [openToIndependents, setOpenToIndependents] = useState(false);

  const handleSubmit = () => {
    onSubmit(`${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`, openToIndependents);
  };

  return (
    <KeyboardScroll contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Leaving Time</Text>
      <Text style={styles.stepSubtitle}>{getTomorrow()}</Text>
      <Text style={styles.stepDescription}>What time do you want to leave? We'll match you with a driver leaving within 15 minutes.</Text>

      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>I want to leave at</Text>
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

      {hasCompany && <OpenTripToggle value={openToIndependents} onChange={setOpenToIndependents} />}

      <TouchableOpacity
        style={[styles.primaryBtn, isLoading && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color="#0B2540" />
        ) : (
          <Text style={styles.primaryBtnText}>Find a Driver</Text>
        )}
      </TouchableOpacity>
    </KeyboardScroll>
  );
}

// ─── Step: Passenger Review ───────────────────────────────────────────────────

function PassengerReviewStep({
  matches,
  tripDate,
  onRespond,
  isLoading,
  hasCompany,
  onChat,
}: {
  matches: TripIntentMatch[];
  tripDate: string | null;
  onRespond: (matchId: string, accepted: boolean) => void;
  isLoading: boolean;
  hasCompany: boolean;
  onChat: OnChat;
}) {
  // Symmetric approval: the passenger reviews any open match they haven't yet
  // approved (whether or not the driver has approved already).
  const available = matches.filter(m => !m.passenger_approved && isOffer(m));
  const match = available[0];

  if (!match) {
    return (
      <View style={styles.centeredStep}>
        <AlertCircle size={48} color={COLORS.gray} />
        <Text style={styles.stepTitle}>No Matches Available</Text>
        <Text style={styles.stepDescription}>
          We're still looking for a driver on your route.
        </Text>
      </View>
    );
  }

  const driverName = match.driver_profile?.first_name ?? "Driver";
  return (
    <KeyboardScroll contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Driver Match Found!</Text>
      <Text style={styles.stepDescription}>Review your match {forDay(tripDate)}.</Text>

      <View style={styles.driverMatchCard}>
        <View style={styles.matchCardLeft}>
          <View style={styles.matchAvatar}>
            <Car size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.matchName}>{driverName}</Text>
            {hasCompany && match.peer_is_colleague === false && <OutsideCompanyPill />}
            <Text style={styles.matchDetail}>
              Leaves {formatClockTime(match.proposed_departure) ?? "-"}
              {match.driver_approved ? ` · ${driverName} already accepted` : ""}
            </Text>
            {!!match.ai_reasoning && (
              <Text style={styles.matchReasoning} numberOfLines={3}>{match.ai_reasoning}</Text>
            )}
          </View>
        </View>
        <PickupDetails match={match} viewer="passenger" peerName={driverName} />
        <MessageButton match={match} name={driverName} onPress={() => onChat(match)} />
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
            <ActivityIndicator color="#0B2540" size="small" />
          ) : (
            <>
              <CheckCircle size={18} color="#0B2540" />
              <Text style={styles.acceptBtnText}>Accept Ride</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardScroll>
  );
}

// ─── Step: Passenger Confirmed ────────────────────────────────────────────────

function PassengerConfirmedStep({
  matches,
  onChat,
  onCancel,
  busy,
}: {
  matches: TripIntentMatch[];
  onChat: OnChat;
  onCancel: OnCancelCarpool;
  busy: boolean;
}) {
  const router = useRouter();
  const confirmed = matches.find(m => m.status === "confirmed");
  const driverName = confirmed?.driver_profile?.first_name ?? "Driver";
  return (
    <KeyboardScroll contentContainerStyle={styles.scrollCentered} showsVerticalScrollIndicator={false}>
      <View style={styles.bigCheckWrap}>
        <CheckCircle size={64} color={COLORS.green} />
      </View>
      <Text style={styles.stepTitle}>Ride Confirmed!</Text>
      {confirmed ? (
        <>
          <View style={styles.confirmedCardColumn}>
            <View style={styles.confirmedHead}>
              <Car size={18} color={COLORS.primary} />
              <Text style={styles.confirmedName}>{driverName} picks you up</Text>
            </View>
            <PickupDetails match={confirmed} viewer="passenger" peerName={driverName} />
          </View>
          <MessageButton centered match={confirmed} name={driverName} onPress={() => onChat(confirmed)} />
          {confirmed.ride_id && (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push(`/trip/${confirmed.ride_id}` as any)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>View ride & pickup</Text>
            </TouchableOpacity>
          )}
          {confirmed.ride_id && (
            <QuietButton
              label="Cancel carpool"
              a11y={`Cancel the carpool with ${driverName}`}
              onPress={() => onCancel(confirmed, driverName)}
              busy={busy}
            />
          )}
        </>
      ) : (
        <Text style={styles.stepDescription}>Your ride is confirmed.</Text>
      )}
    </KeyboardScroll>
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
    outcome,
    isLoading,
    error,
    selectedRole,
    setStep,
    setSelectedRole,
    checkExistingIntent,
    submitIntent,
    respondAsDriver,
    respondAsPassenger,
    stopLooking,
    cancelCarpool,
    subscribeToMatches,
    reset,
  } = useDailyCommuteStore();

  // Employees get the per-trip "open to commuters outside my company" switch.
  const [hasCompany, setHasCompany] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
      setHasCompany(data?.company_id != null);
    })().catch(() => undefined);
  }, []);

  // Chat with a match. Before the ride exists the thread is the match; after,
  // the ride (which carries the earlier messages too).
  const [chat, setChat] = useState<{ thread: ChatThread; name: string } | null>(null);
  const openChat = useCallback(
    (m: TripIntentMatch) => {
      const iDrive = m.driver_user_id === userId;
      const peer = iDrive ? m.passenger_profile : m.driver_profile;
      setChat({
        thread: m.ride_id ? { rideId: m.ride_id } : { matchId: m.id },
        name: peer?.first_name ?? (iDrive ? "your passenger" : "your driver"),
      });
    },
    [userId],
  );

  // Chat push (/daily-commute?openChat=<matchId>): open it once the match loads.
  const { openChat: openChatId } = useLocalSearchParams<{ openChat?: string }>();
  const openedChatRef = useRef(false);
  useEffect(() => {
    if (openedChatRef.current || !openChatId || !userId) return;
    const m = matches.find((x) => x.id === openChatId);
    if (!m) return;
    openedChatRef.current = true;
    openChat(m);
  }, [openChatId, userId, matches, openChat]);

  // Withdrawing = declining through respond-to-match, which tells the other
  // side and puts both back into matching.
  const [withdrawing, setWithdrawing] = useState(false);
  const handleWithdraw = async (matchIds: string[]) => {
    setWithdrawing(true);
    try {
      for (const id of matchIds) {
        await respondAsPassenger({ match_id: id, accepted: false });
      }
    } catch {
      Alert.alert("Couldn't withdraw", "Check your connection and try again.");
    } finally {
      setWithdrawing(false);
    }
  };

  // Stop looking / cancel the carpool: you can plan a new trip straight after.
  const [leaving, setLeaving] = useState(false);
  const handleStopLooking = () => {
    Alert.alert("Stop looking?", "You can plan a new trip any time.", [
      { text: "Keep looking", style: "cancel" },
      {
        text: "Stop looking",
        style: "destructive",
        onPress: async () => {
          setLeaving(true);
          try {
            await stopLooking();
          } catch (err) {
            if (err instanceof CarpoolError && err.code === "has_confirmed_ride") {
              Alert.alert("Your carpool is confirmed", "Cancel the carpool instead - your partner is told right away.");
            } else {
              Alert.alert("Couldn't stop", "Check your connection and try again.");
            }
            checkExistingIntent();
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);
  };
  const handleCancelCarpool: OnCancelCarpool = (match, partnerName) => {
    if (!match.ride_id) return;
    const rideId = match.ride_id;
    Alert.alert(
      "Cancel this carpool?",
      `${partnerName} is told right away and we look for another match for them. You can plan a new trip straight after.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel carpool",
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            try {
              await cancelCarpool(rideId);
            } catch (err) {
              Alert.alert("Couldn't cancel", err instanceof Error ? err.message : "Check your connection and try again.");
            } finally {
              setLeaving(false);
            }
          },
        },
      ],
    );
  };

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

  const handleDriverDetailsSubmit = async (capacity: number, departureTime: string, openToIndependents: boolean) => {
    try {
      await submitIntent({
        role: "driver",
        passenger_capacity: capacity,
        departure_time: departureTime,
        open_to_independents: openToIndependents,
      });
    } catch (err) {
      alertSubmitError(err);
    }
  };

  const handlePassengerDetailsSubmit = async (leavingTime: string, openToIndependents: boolean) => {
    try {
      // Passenger now gives a LEAVING time so the matcher can compare it with
      // when the driver reaches the pickup (±15 min, see daily-commute-matcher).
      await submitIntent({
        role: "passenger",
        departure_time: leavingTime,
        open_to_independents: openToIndependents,
      });
    } catch (err) {
      alertSubmitError(err);
    }
  };

  const handleDriverRespond = async (matchId: string, accepted: boolean) => {
    try {
      await respondAsDriver(accepted ? { accepted_ids: [matchId] } : { accepted_ids: [], declined_ids: [matchId] });
    } catch {
      Alert.alert("Error", "Could not save your answer. Please try again.");
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
    } else {
      router.back();
    }
  };

  const showBackBtn = ["driver_details", "passenger_details"].includes(step);
  const showCloseBtn = !showBackBtn;
  const tripDate = intent?.trip_date ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
      <GlowBackdrop variant="brand" style={GLOW_TOP} />
      {/* Header */}
      <View style={styles.header}>
        {showBackBtn ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" style={styles.headerBtn} onPress={handleBack}>
            <ChevronLeft size={24} color={TC.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={[styles.headerTitle, { color: TC.text }]}>Daily Commute</Text>
        {showCloseBtn ? (
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <X size={22} color={TC.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
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
      {step === "role_select" && <RoleSelectStep onSelect={handleRoleSelect} outcome={outcome} />}
      {step === "driver_details" && (
        <DriverDetailsStep onSubmit={handleDriverDetailsSubmit} isLoading={isLoading} hasCompany={hasCompany} />
      )}
      {step === "driver_submitted" && (
        <SubmittedStep
          role="driver"
          tripDate={tripDate}
          outcome={outcome}
          onSeeOptions={() => router.replace("/(tabs)")}
          onStopLooking={handleStopLooking}
          busy={leaving}
        />
      )}
      {step === "driver_review" && (
        <DriverReviewStep matches={matches} tripDate={tripDate} onRespond={handleDriverRespond} hasCompany={hasCompany} onChat={openChat} />
      )}
      {step === "driver_waiting" && (
        <DriverWaitingStep matches={matches} onWithdraw={handleWithdraw} busy={withdrawing} onChat={openChat} />
      )}
      {step === "driver_confirmed" && (
        <DriverConfirmedStep matches={matches} onChat={openChat} onCancel={handleCancelCarpool} busy={leaving} />
      )}
      {step === "passenger_details" && (
        <PassengerDetailsStep onSubmit={handlePassengerDetailsSubmit} isLoading={isLoading} hasCompany={hasCompany} />
      )}
      {step === "passenger_submitted" && (
        <SubmittedStep
          role="passenger"
          tripDate={tripDate}
          outcome={outcome}
          onSeeOptions={() => router.replace("/(tabs)")}
          onStopLooking={handleStopLooking}
          busy={leaving}
        />
      )}
      {step === "passenger_review" && (
        <PassengerReviewStep matches={matches} tripDate={tripDate} onRespond={handlePassengerRespond} isLoading={isLoading} hasCompany={hasCompany} onChat={openChat} />
      )}
      {step === "passenger_waiting" && (
        <PassengerWaitingStep matches={matches} onWithdraw={handleWithdraw} busy={withdrawing} onChat={openChat} />
      )}
      {step === "passenger_confirmed" && (
        <PassengerConfirmedStep matches={matches} onChat={openChat} onCancel={handleCancelCarpool} busy={leaving} />
      )}

      {chat && userId && (
        <ChatModal
          visible
          onClose={() => setChat(null)}
          thread={chat.thread}
          currentUserId={userId}
          partnerName={chat.name}
        />
      )}
    </SafeAreaView>
  );
}

/** A submit the server refused: a confirmed carpool that day, or no commute set. */
function alertSubmitError(err: unknown) {
  if (err instanceof CarpoolError && err.code === "has_confirmed_ride") {
    Alert.alert(
      "You already have a carpool",
      "There's a confirmed carpool on that day. Cancel it first to plan a different trip.",
    );
    return;
  }
  Alert.alert("Error", "Could not submit your intent. Check your profile has home/work addresses set.");
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF6F7",
  },
  headerSpacer: { width: 44, height: 44 },
  headerBtn: {
    // Shared header spec (44pt target, light chip) — keep in sync across stack screens.
    width: 44,
    height: 44,
    borderRadius: 28,
    backgroundColor: "#F4FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
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
  // Centred like centeredStep, but grows past the screen so it can scroll.
  scrollCentered: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    paddingBottom: 40,
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
    color: COLORS.textMuted,
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
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  greenOptionsBtn: {
    backgroundColor: "#09E0E8",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 20,
    marginBottom: 4,
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  greenOptionsBtnText: {
    color: "#0B2540",
    fontSize: 15,
    fontWeight: "800",
  },

  // ── Role cards ──
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    boxShadow: ELEVATION.light.e2,
  },
  roleIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
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
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    boxShadow: ELEVATION.light.e2,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primaryDark,
    marginBottom: 12,
  },
  fieldHint: {
    fontSize: 12,
    color: COLORS.textMuted,
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
    borderRadius: 15,
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
    borderRadius: 18,
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.primaryDark,
    textAlign: "center",
    backgroundColor: "#E3FAFB",
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
    borderRadius: 18,
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
  matchCardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 12,
  },
  matchAvatar: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: depth.embossLight,
  },
  matchName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primaryDark,
  },
  outsidePill: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.light,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  outsidePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primary,
  },
  matchDetail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  matchReasoning: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    fontStyle: "italic",
    lineHeight: 16,
  },

  // ── Driver match card (passenger view) ──
  driverMatchCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: "#E1ECEE",
    boxShadow: ELEVATION.light.e2,
  },


  // ── Confirmed card ──
  messageBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    marginTop: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
  },
  messageBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  confirmedCardColumn: {
    backgroundColor: "#ECFDF5",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    width: "100%",
  },
  confirmedHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  waitingCard: {
    alignSelf: "stretch",
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#E1ECEE",
  },
  outcomeBanner: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  outcomeBannerDone: {
    backgroundColor: "#ECFDF5",
  },
  outcomeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  quietBtn: {
    alignSelf: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  quietBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.red,
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
    borderRadius: 18,
    paddingVertical: 14,
  },
  declineBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.red,
  },
  withdrawBtn: {
    flex: 0,
    alignSelf: "stretch",
    marginTop: 24,
    minHeight: 48,
  },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#09E0E8",
    borderRadius: 18,
    paddingVertical: 14,
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B2540",
  },

  // ── Primary button ──
  primaryBtn: {
    minHeight: 56,
    alignSelf: "stretch", // full width even inside centred steps (was text-width)
    backgroundColor: "#09E0E8",
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B2540",
  },
});

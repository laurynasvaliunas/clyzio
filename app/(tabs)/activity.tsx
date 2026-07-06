import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import {
  Calendar,
  Clock,
  Car,
  Leaf,
  X,
  ChevronRight,
  Filter,
  CheckCircle2,
  Users,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import TripCompletionModal from "../../components/TripCompletionModal";
import { useTheme } from "../../contexts/ThemeContext";
import { getThemeColors } from "../../lib/theme";
import { formatCO2 } from "../../lib/format";
// Gamification math now lives server-side in the `complete-trip` edge fn.
// Profile counters (xp_points / total_co2_saved / trips_completed / badges)
// are protected against direct client writes by migration 018.
import { useToast } from "../../contexts/ToastContext";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Editorial reskin — local palette re-pointed onto the warm "paper" system.
const COLORS = {
  primary: "#00565A",   // cyan
  primaryDark: "#003D40",// teal
  accent: "#F59E0B",    // sun
  dark: "#003D40",      // teal
  light: "#E6F1F2",     // cyan-fog
  background: "#F7F9FA",// paper
  white: "#FFFFFF",     // ivory
  gray: "#8B989C",      // ink-4
  textSecondary: "#5A6A6F", // ink-3
  red: "#DC2626",       // clay
  green: "#059669",     // leaf
  black: "#0B1A1F",     // ink
};

interface Ride {
  id: string;
  rider_id: string | null;
  driver_id: string | null;
  status: string;
  origin_lat: number;
  origin_long: number;
  origin_address?: string;
  dest_lat: number;
  dest_long: number;
  dest_address?: string;
  transport_mode?: string;
  transport_label?: string;
  co2_saved: number | null;
  scheduled_at: string;
  created_at: string;
}

type TabType = "upcoming" | "history";

/**
 * UpcomingCard - Card component for upcoming trips
 */
interface UpcomingCardProps {
  item: Ride;
  userId: string | null;
  onPress: () => void;
  onComplete: () => void;
  onCancel: () => void;
  completing?: boolean;
  TC: ReturnType<typeof getThemeColors>;
}

function UpcomingCard({ item, userId, onPress, onComplete, onCancel, completing = false, TC }: UpcomingCardProps) {
  const formatScheduledTime = (dateStr: string) => {
    const date = parseISO(dateStr);
    const time = format(date, "h:mm a");

    if (isToday(date)) return { time, day: "Today" };
    if (isTomorrow(date)) return { time, day: "Tomorrow" };
    return { time, day: format(date, "MMM d") };
  };

  const getRoleBadge = () => {
    if (!userId) return null;
    if (item.driver_id === userId) return { label: "Driver", color: COLORS.primary };
    if (item.rider_id === userId) return { label: "Rider", color: COLORS.accent };
    return null;
  };

  const getModeEmoji = (mode?: string) => {
    switch (mode) {
      case "walking": return "🚶";
      case "bike": return "🚲";
      case "ebike": return "⚡";
      case "motorbike": return "🏍️";
      case "public": return "🚌";
      default: return "🚗";
    }
  };

  const { time, day } = formatScheduledTime(item.scheduled_at);
  const role = getRoleBadge();

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: TC.surface }]} onPress={onPress} activeOpacity={0.7}>
      {/* Date badge */}
      <View style={styles.dateBadge}>
        <Text style={styles.dateBadgeText}>{day}</Text>
      </View>

      {/* Route connector */}
      <View style={styles.routeConnector}>
        <View style={styles.routeDots}>
          <View style={styles.routeDotOrigin} />
          <View style={[styles.routeDotLine, { backgroundColor: TC.border }]} />
          <View style={styles.routeDotDest} />
        </View>
        <View style={styles.routeAddresses}>
          <Text style={[styles.routeText, { color: TC.text }]} numberOfLines={1}>
            {item.origin_address || "Pickup location"}
          </Text>
          <Text style={[styles.routeText, { color: TC.text }]} numberOfLines={1}>
            {item.dest_address || "Destination"}
          </Text>
        </View>
      </View>

      {/* Details row */}
      <View style={styles.cardDetailsRow}>
        <View style={styles.modeCircle}>
          <Text style={{ fontSize: 16 }}>{getModeEmoji(item.transport_mode)}</Text>
        </View>
        <View style={styles.timeChip}>
          <Clock size={14} color={TC.textSecondary} />
          <Text style={[styles.timeText, { color: TC.textSecondary }]}>{time}</Text>
        </View>
        {!!item.co2_saved && item.co2_saved > 0 && (
          <View style={styles.co2Chip}>
            <Leaf size={14} color={COLORS.green} />
            <Text style={styles.co2ChipText}>–{formatCO2(item.co2_saved)} kg</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {role && (
          <View style={[styles.roleBadge, { backgroundColor: role.color + "20" }]}>
            <Text style={[styles.roleBadgeText, { color: role.color }]}>{role.label}</Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={[styles.cardActions, { borderTopColor: TC.border }]}>
        <TouchableOpacity
          style={[styles.completeBtn, completing && styles.completeBtnLoading]}
          onPress={onComplete}
          disabled={completing}
          activeOpacity={0.8}
        >
          {completing ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <CheckCircle2 size={16} color={COLORS.white} />
          )}
          <Text style={styles.completeBtnText}>
            {completing ? "Saving..." : "Mark Complete"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={completing}>
          <X size={16} color={completing ? COLORS.gray : COLORS.red} />
          <Text style={[styles.cancelText, completing && { color: COLORS.gray }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

/**
 * HistoryCard - Card component for completed/past trips
 */
interface HistoryCardProps {
  item: Ride;
  onPress: () => void;
  TC: ReturnType<typeof getThemeColors>;
}

function HistoryCard({ item, onPress, TC }: HistoryCardProps) {
  const formatScheduledTime = (dateStr: string) => {
    const date = parseISO(dateStr);
    const time = format(date, "h:mm a");
    
    if (isToday(date)) return { time, day: "Today" };
    if (isTomorrow(date)) return { time, day: "Tomorrow" };
    return { time, day: format(date, "MMM d") };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return COLORS.green;
      case "cancelled": return COLORS.red;
      case "in_progress": return COLORS.primary;
      default: return COLORS.gray;
    }
  };

  const { time, day } = formatScheduledTime(item.scheduled_at);
  const isCancelled = item.status === "cancelled";

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: TC.surface }, isCancelled && styles.cardCancelled]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={styles.historyLeft}>
          <View style={[styles.modeIcon, isCancelled && { opacity: 0.4 }]}>
            {item.status === "completed" ? (
              <CheckCircle2 size={20} color={COLORS.white} />
            ) : (
              <Car size={20} color={COLORS.white} />
            )}
          </View>
        </View>

        <View style={styles.historyCenter}>
          <Text style={[styles.historyDate, { color: TC.text }, isCancelled && styles.textCancelled]}>
            {day} • {time}
          </Text>
          <Text style={[styles.historyRoute, { color: TC.textSecondary }, isCancelled && styles.textCancelled]} numberOfLines={1}>
            {item.origin_address?.split(",")[0] || "Origin"} → {item.dest_address?.split(",")[0] || "Destination"}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
            {!!item.transport_label && (
              <Text style={[styles.transportModeSmall, { color: TC.textSecondary }]}> • {item.transport_label}</Text>
            )}
          </View>
        </View>

        <View style={styles.historyRight}>
          {item.co2_saved && item.co2_saved > 0 && !isCancelled ? (
            <View style={styles.co2Badge}>
              <Leaf size={13} color={COLORS.green} />
              <Text style={styles.co2Text}>–{formatCO2(item.co2_saved)} kg</Text>
            </View>
          ) : (
            <ChevronRight size={20} color={TC.textSecondary} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * EmptyState - Shown when no rides are available
 */
interface EmptyStateProps {
  isUpcoming: boolean;
  onPlanTrip: () => void;
  TC: ReturnType<typeof getThemeColors>;
}

function EmptyState({ isUpcoming, onPlanTrip, TC }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Leaf size={48} color={COLORS.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: TC.text }]}>
        {isUpcoming ? "No commutes planned" : "No history yet"}
      </Text>
      <Text style={[styles.emptySubtitle, { color: TC.textSecondary }]}>
        {isUpcoming
          ? "Tap the map to plan your next eco-friendly trip!"
          : "Complete some rides to see your impact here."}
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={onPlanTrip}>
        <Text style={styles.emptyButtonText}>Plan your route</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * ActivityScreen - Main component showing upcoming and completed trips
 */
export default function ActivityScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const TC = getThemeColors(isDark);
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<Ride[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  // Trip completion modal state
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState({
    xpEarned: 0,
    co2Saved: 0,
    distance: 0,
    leveledUp: false,
    newLevel: 0,
  });
  const [completingId, setCompletingId] = useState<string | null>(null);

  /**
   * Load rides based on active tab
   * Fetches upcoming or history rides from Supabase
   */
  const loadRides = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const now = new Date().toISOString();

      let query = supabase
        .from("rides")
        .select("*")
        .or(`rider_id.eq.${user.id},driver_id.eq.${user.id}`);

      if (activeTab === "upcoming") {
        // Upcoming: any active status — user must manually complete or cancel
        query = query
          .in("status", ["scheduled", "requested", "accepted", "in_progress"])
          .order("scheduled_at", { ascending: true });
      } else {
        // History: only explicitly completed or cancelled trips
        query = query
          .in("status", ["completed", "cancelled"])
          .order("scheduled_at", { ascending: false });
      }

      const { data, error } = await query.limit(50);

      if (error) {
        console.error("❌ Error fetching rides:", error);
      } else {
        if (__DEV__) { console.log(`✅ Fetched ${data?.length || 0} rides for ${activeTab}:`, data); }
        setRides(data || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Reload rides when tab changes or screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadRides();
    }, [loadRides])
  );

  /**
   * Handle tab change with animation
   */
  const handleTabChange = (tab: TabType) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(tab);
  };

  /**
   * Cancel a ride
   */
  const cancelRide = useCallback(async (rideId: string) => {
    Alert.alert(
      "Cancel Ride",
      "Are you sure you want to cancel this ride?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("rides")
                .update({ status: "cancelled" })
                .eq("id", rideId);

              if (error) throw error;
              loadRides();
            } catch (error: any) {
              showToast({ title: 'Error', message: error.message, type: 'error' });
            }
          },
        },
      ]
    );
  }, [loadRides]);

  /**
   * Complete a trip
   *
   * As of audit fix C2, the entire XP / CO₂ / trips_completed / badges
   * write happens in the `complete-trip` edge function — those columns are
   * protected against direct client writes by the BEFORE-UPDATE trigger
   * added in migration 018. This handler now:
   *   1. Confirms with native Alert (reversible action guard)
   *   2. Shows per-card loading state
   *   3. Calls the edge function (server computes XP, CO₂, badges, distance)
   *   4. Shows the celebration modal with the server-returned deltas
   *   5. Refreshes the list so the trip moves to History
   */
  const completeTrip = useCallback(async (rideId: string) => {
    Alert.alert(
      "Complete Trip",
      "Mark this trip as completed?",
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Yes, Complete",
          style: "default",
          onPress: async () => {
            setCompletingId(rideId);
            try {
              const { data, error } = await supabase.functions.invoke<{
                xp_earned: number;
                co2_saved: number;
                distance_km: number;
                new_level: number;
                leveled_up: boolean;
                already_completed?: boolean;
              }>("complete-trip", {
                body: { ride_id: rideId, end_trip: true },
              });

              if (error) throw error;
              if (!data) throw new Error("No response from server");

              if (data.already_completed) {
                showToast({ title: 'Already completed', message: 'This trip was already marked complete.', type: 'info' });
              } else {
                setCompletionData({
                  xpEarned: data.xp_earned,
                  co2Saved: data.co2_saved,
                  distance: data.distance_km,
                  leveledUp: data.leveled_up,
                  newLevel: data.new_level,
                });
                setShowCompletionModal(true);
              }

              // Refresh the list either way so status updates locally.
              loadRides();
            } catch (error: any) {
              showToast({ title: 'Could not complete trip', message: error.message ?? 'Please try again.', type: 'error' });
            } finally {
              setCompletingId(null);
            }
          },
        },
      ]
    );
  }, [loadRides, showToast]);

  /**
   * Render function for FlatList items
   */
  const renderCard = useCallback(({ item }: { item: Ride }) => {
    if (activeTab === "upcoming") {
      return (
        <UpcomingCard
          item={item}
          userId={userId}
          onPress={() => router.push(`/trip/${item.id}`)}
          onComplete={() => completeTrip(item.id)}
          onCancel={() => cancelRide(item.id)}
          completing={completingId === item.id}
          TC={TC}
        />
      );
    } else {
      return (
        <HistoryCard
          item={item}
          onPress={() => router.push(`/trip/${item.id}`)}
          TC={TC}
        />
      );
    }
  }, [activeTab, userId, router, completeTrip, cancelRide, completingId, TC]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: TC.text }]}>Activity</Text>
        <TouchableOpacity style={styles.filterBtn}>
          <Filter size={22} color={TC.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <View style={[styles.tabSwitcher, { backgroundColor: TC.surface }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "upcoming" ? styles.tabActive : { backgroundColor: TC.surface2 },
            ]}
            onPress={() => handleTabChange("upcoming")}
          >
            <Text style={[styles.tabText, { color: TC.text }, activeTab === "upcoming" && styles.tabTextActive]}>
              Upcoming
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === "history" ? styles.tabActive : { backgroundColor: TC.surface2 },
            ]}
            onPress={() => handleTabChange("history")}
          >
            <Text style={[styles.tabText, { color: TC.text }, activeTab === "history" && styles.tabTextActive]}>
              History
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : rides.length === 0 ? (
        <EmptyState
          isUpcoming={activeTab === "upcoming"}
          onPlanTrip={() => router.push("/(tabs)")}
          TC={TC}
        />
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Trip Completion Modal */}
      <TripCompletionModal
        visible={showCompletionModal}
        onClose={() => {
          setShowCompletionModal(false);
          // Switch to History so the user immediately sees their completed trip
          handleTabChange("history");
        }}
        xpEarned={completionData.xpEarned}
        co2Saved={completionData.co2Saved}
        distance={completionData.distance}
        leveledUp={completionData.leveledUp}
        newLevel={completionData.newLevel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ===== CONTAINER & HEADER =====
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontWeight: "700",
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.8,
    color: COLORS.dark
  },
  filterBtn: {
    padding: 8,
    borderRadius: 10,
  },

  // ===== TAB SWITCHER =====
  tabContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: 50,
    padding: 4,
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 50,
  },
  tabActive: {
    backgroundColor: COLORS.primary
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.gray
  },
  tabTextActive: {
    color: COLORS.white
  },
  
  // ===== LOADING & LIST =====
  loadingContainer: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center" 
  },
  listContent: { 
    padding: 16, 
    gap: 12 
  },
  
  // ===== CARD SHARED =====
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    shadowColor: COLORS.black,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardCancelled: {
    opacity: 0.5
  },

  // Date badge (shown at top of card)
  dateBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.light,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    marginBottom: 10,
  },
  dateBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },

  // ===== UPCOMING CARD =====
  cardLeft: {
    width: 70,
    alignItems: "center"
  },
  cardTime: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.dark
  },
  cardDay: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2
  },
  cardCenter: {
    flex: 1,
    paddingHorizontal: 12
  },

  // Route connector (dots + line)
  routeConnector: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  routeDots: {
    alignItems: "center",
    paddingTop: 2,
  },
  routeDotOrigin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  routeDotLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 3,
    minHeight: 14,
  },
  routeDotDest: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  routeAddresses: {
    flex: 1,
    gap: 10,
  },
  routeText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.dark,
  },

  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.gray
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.light,
    marginLeft: 4,
    marginVertical: 2
  },
  transportMode: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
    fontWeight: "500"
  },

  // Details row (mode icon + time + co2)
  cardDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 4,
  },
  modeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  co2Chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  co2ChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.green,
  },

  cardRight: {
    alignItems: "flex-end",
    justifyContent: "space-between"
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "bold"
  },
  completeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  completeBtnLoading: {
    opacity: 0.7,
  },
  completeBtnText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: "700",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 13,
    color: COLORS.red,
    fontWeight: "500",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },

  // Partner row
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  partnerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  partnerAvatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.white,
  },
  partnerName: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },

  // ===== HISTORY CARD =====
  historyLeft: {
    width: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  modeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCenter: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: "center"
  },
  historyDate: {
    fontSize: 14,
    color: COLORS.dark,
    fontWeight: "500"
  },
  historyRoute: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2
  },
  textCancelled: {
    textDecorationLine: "line-through",
    color: COLORS.gray
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500"
  },
  transportModeSmall: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: "400"
  },
  historyRight: {
    alignItems: "flex-end",
    justifyContent: "center"
  },
  co2Badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.green + "15",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  co2Text: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.green
  },
  
  // ===== EMPTY STATE =====
  emptyState: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    padding: 32 
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { 
    fontSize: 20, 
    fontWeight: "bold", 
    color: COLORS.dark, 
    marginBottom: 8 
  },
  emptySubtitle: { 
    fontSize: 14, 
    color: COLORS.gray, 
    textAlign: "center", 
    lineHeight: 22 
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
  },
  emptyButtonText: { 
    color: COLORS.white, 
    fontSize: 16, 
    fontWeight: "bold" 
  },
});


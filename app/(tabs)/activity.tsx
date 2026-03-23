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
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import TripCompletionModal from "../../components/TripCompletionModal";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  accent: "#FDD835",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  red: "#EF4444",
  green: "#4CAF50",
  black: "#000000",
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
 * Haversine Formula - Calculates distance between two coordinates
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in kilometers
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
}

/**
 * Calculate XP earned from a trip
 * @param distance Distance traveled in km
 * @param transportMode Type of transport used
 * @returns Total XP earned
 */
function calculateXP(distance: number, transportMode?: string): number {
  const baseXP = 100; // Base XP for completing any trip
  const distanceBonus = Math.floor(distance * 10); // 10 XP per km
  const ecoBonus = (transportMode === "walking" || transportMode === "bike") ? 50 : 0;
  return baseXP + distanceBonus + ecoBonus;
}

/**
 * UpcomingCard - Card component for upcoming trips
 */
interface UpcomingCardProps {
  item: Ride;
  userId: string | null;
  onPress: () => void;
  onComplete: () => void;
  onCancel: () => void;
}

function UpcomingCard({ item, userId, onPress, onComplete, onCancel }: UpcomingCardProps) {
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
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Date badge */}
      <View style={styles.dateBadge}>
        <Text style={styles.dateBadgeText}>{day}</Text>
      </View>

      {/* Route connector */}
      <View style={styles.routeConnector}>
        <View style={styles.routeDots}>
          <View style={styles.routeDotOrigin} />
          <View style={styles.routeDotLine} />
          <View style={styles.routeDotDest} />
        </View>
        <View style={styles.routeAddresses}>
          <Text style={styles.routeText} numberOfLines={1}>
            {item.origin_address || "Pickup location"}
          </Text>
          <Text style={styles.routeText} numberOfLines={1}>
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
          <Clock size={14} color={COLORS.textSecondary} />
          <Text style={styles.timeText}>{time}</Text>
        </View>
        {item.co2_saved && item.co2_saved > 0 && (
          <View style={styles.co2Chip}>
            <Leaf size={14} color={COLORS.green} />
            <Text style={styles.co2ChipText}>–{item.co2_saved.toFixed(2)} kg</Text>
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
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.completeBtn} onPress={onComplete}>
          <Text style={styles.completeBtnText}>✓ Complete</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <X size={16} color={COLORS.red} />
          <Text style={styles.cancelText}>Cancel</Text>
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
}

function HistoryCard({ item, onPress }: HistoryCardProps) {
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
      style={[styles.card, isCancelled && styles.cardCancelled]}
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
          <Text style={[styles.historyDate, isCancelled && styles.textCancelled]}>
            {day} • {time}
          </Text>
          <Text style={[styles.historyRoute, isCancelled && styles.textCancelled]} numberOfLines={1}>
            {item.origin_address?.split(",")[0] || "Origin"} → {item.dest_address?.split(",")[0] || "Destination"}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
            {item.transport_label && (
              <Text style={styles.transportModeSmall}> • {item.transport_label}</Text>
            )}
          </View>
        </View>

        <View style={styles.historyRight}>
          {item.co2_saved && item.co2_saved > 0 && !isCancelled ? (
            <View style={styles.co2Badge}>
              <Leaf size={13} color={COLORS.green} />
              <Text style={styles.co2Text}>–{item.co2_saved.toFixed(1)}kg</Text>
            </View>
          ) : (
            <ChevronRight size={20} color={COLORS.gray} />
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
}

function EmptyState({ isUpcoming, onPlanTrip }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Leaf size={48} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>
        {isUpcoming ? "No commutes planned" : "No history yet"}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isUpcoming
          ? "Tap the map to plan your next eco-friendly trip!"
          : "Complete some rides to see your impact here."}
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={onPlanTrip}>
        <Text style={styles.emptyButtonText}>Plan a Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * ActivityScreen - Main component showing upcoming and completed trips
 */
export default function ActivityScreen() {
  const router = useRouter();
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
        // Upcoming: scheduled, requested, accepted AND scheduled_at > now
        query = query
          .in("status", ["scheduled", "requested", "accepted", "in_progress"])
          .gte("scheduled_at", now)
          .order("scheduled_at", { ascending: true });
      } else {
        // History: completed OR scheduled_at < now
        query = query
          .or(`status.eq.completed,status.eq.cancelled,scheduled_at.lt.${now}`)
          .order("scheduled_at", { ascending: false });
      }

      const { data, error } = await query.limit(50);

      if (error) {
        console.error("❌ Error fetching rides:", error);
      } else {
        console.log(`✅ Fetched ${data?.length || 0} rides for ${activeTab}:`, data);
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
              Alert.alert("Error", error.message);
            }
          },
        },
      ]
    );
  }, [loadRides]);

  /**
   * Complete a trip
   * 1. Calculates distance and XP earned
   * 2. Updates ride status to completed
   * 3. Updates user profile stats (XP, CO2, trips count)
   * 4. Shows completion modal with celebration
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
            try {
              // Step 1: Fetch ride details
              const { data: ride, error: fetchError } = await supabase
                .from("rides")
                .select("*")
                .eq("id", rideId)
                .single();

              if (fetchError || !ride) {
                throw new Error("Failed to fetch ride details");
              }

              // Step 2: Calculate distance and XP
              const distance = calculateDistance(
                ride.origin_lat,
                ride.origin_long,
                ride.dest_lat,
                ride.dest_long
              );
              const totalXP = calculateXP(distance, ride.transport_mode);
              const co2Saved = ride.co2_saved || 0;

              // Step 3: Update ride status to completed
              const { error: updateError } = await supabase
                .from("rides")
                .update({ status: "completed" })
                .eq("id", rideId);

              if (updateError) throw updateError;

              // Step 4: Update user profile stats
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                // Fetch current profile stats
                const { data: profile, error: profileError } = await supabase
                  .from("profiles")
                  .select("xp_points, total_co2_saved, trips_completed")
                  .eq("id", user.id)
                  .single();

                if (profileError) {
                  console.error("Error fetching profile:", profileError);
                } else if (profile) {
                  // Calculate new values
                  const oldXP = profile.xp_points || 0;
                  const newXP = oldXP + totalXP;
                  const newCO2 = (profile.total_co2_saved || 0) + co2Saved;
                  const newTripsCount = (profile.trips_completed || 0) + 1;

                  // Check if user leveled up
                  const oldLevel = Math.floor(oldXP / 1000) + 1;
                  const newLevel = Math.floor(newXP / 1000) + 1;
                  const leveledUp = newLevel > oldLevel;

                  // Update profile in database
                  const { error: statsError } = await supabase
                    .from("profiles")
                    .update({
                      xp_points: newXP,
                      total_co2_saved: newCO2,
                      trips_completed: newTripsCount,
                    })
                    .eq("id", user.id);

                  if (statsError) {
                    console.error("Error updating stats:", statsError);
                  } else {
                    console.log(`✅ Stats updated: +${totalXP} XP, +${co2Saved.toFixed(2)} kg CO2`);
                  }

                  // Show completion modal
                  setCompletionData({
                    xpEarned: totalXP,
                    co2Saved: co2Saved,
                    distance: distance,
                    leveledUp: leveledUp,
                    newLevel: newLevel,
                  });
                  setShowCompletionModal(true);
                  
                  // Reload rides after a short delay
                  setTimeout(() => {
                    loadRides();
                  }, 500);
                }
              }
            } catch (error: any) {
              Alert.alert("Error", error.message);
            }
          },
        },
      ]
    );
  }, [loadRides]);

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
        />
      );
    } else {
      return (
        <HistoryCard
          item={item}
          onPress={() => router.push(`/trip/${item.id}`)}
        />
      );
    }
  }, [activeTab, userId, router, completeTrip, cancelRide]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activity</Text>
        <TouchableOpacity style={styles.filterBtn}>
          <Filter size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "upcoming" && styles.tabActive]}
            onPress={() => handleTabChange("upcoming")}
          >
            <Text style={[styles.tabText, activeTab === "upcoming" && styles.tabTextActive]}>
              Upcoming
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "history" && styles.tabActive]}
            onPress={() => handleTabChange("history")}
          >
            <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
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
          loadRides(); // Refresh list when modal closes
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
    fontSize: 30,
    fontWeight: "700",
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
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 8
  },
  completeBtnText: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: "bold"
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cancelText: {
    fontSize: 12,
    color: COLORS.red,
    fontWeight: "500"
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


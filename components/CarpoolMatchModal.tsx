import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { X, Users, Leaf, Clock, CheckCircle } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { CarpoolMatch, CarpoolAIResult, useAIStore } from "../store/useAIStore";
import { useToast } from "../contexts/ToastContext";
import { Avatar, toneFromKey } from "./ui/editorial";

// Editorial reskin — local palette re-pointed onto the warm "paper" system.
const COLORS = {
  primary: "#26C6DA",   // cyan
  primaryDark: "#00565A",// teal-2
  accent: "#F2C744",    // sun
  dark: "#003D40",      // teal
  light: "#EAF6F8",     // cyan-fog
  background: "#F1EDE4",// paper
  white: "#FAF7EF",     // ivory
  gray: "#8B989C",      // ink-4
  grayLight: "#E8E3D7", // paper-2
  green: "#5B8F5B",     // leaf
};

function CompatibilityBar({ score }: { score: number }) {
  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.accent : COLORS.gray;
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFill, { width: `${score}%` as any, backgroundColor: color }]} />
    </View>
  );
}

interface CarpoolMatchModalProps {
  visible: boolean;
  result: CarpoolAIResult | null;
  loading: boolean;
  rideId: string | null;       // the user's own ride to attach request to
  onClose: () => void;
  onMatchAccepted: (matchRideId: string) => void;
}

export default function CarpoolMatchModal({
  visible,
  result,
  loading,
  rideId,
  onClose,
  onMatchAccepted,
}: CarpoolMatchModalProps) {
  const { sendCarpoolSuggestion } = useAIStore();
  const { showToast } = useToast();

  const handleRequest = async (match: CarpoolMatch) => {
    if (!match.to_user_id) {
      showToast({ title: 'Not Available', message: 'This match is no longer available.', type: 'warning' });
      return;
    }

    try {
      await sendCarpoolSuggestion(match);
      onMatchAccepted(match.ride_id);
      showToast({ title: 'Request Sent!', message: `Carpool request sent to ${match.user_first_name}. They'll be notified shortly.`, type: 'success' });
      onClose();
    } catch (err: any) {
      showToast({ title: 'Error', message: err.message || 'Could not send request. Please try again.', type: 'error' });
    }
  };

  const renderMatch = ({ item }: { item: CarpoolMatch }) => (
    <View style={styles.matchCard}>
      <View style={styles.matchHeader}>
        <Avatar
          initials={(item.user_first_name || "?").trim().charAt(0).toUpperCase()}
          size={44}
          tone={toneFromKey(item.user_first_name)}
        />
        <View style={styles.matchInfo}>
          <Text style={styles.matchName}>{item.user_first_name}</Text>
          <Text style={styles.matchReasoning} numberOfLines={2}>{item.reasoning}</Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreText}>{item.compatibility_score}</Text>
          <Text style={styles.scoreLabel}>match</Text>
        </View>
      </View>

      <CompatibilityBar score={item.compatibility_score} />

      <View style={styles.matchStats}>
        <View style={styles.matchStat}>
          <Leaf size={13} color={COLORS.green} />
          <Text style={styles.matchStatText}>
            -{item.co2_saving_kg.toFixed(2)} kg CO2
          </Text>
        </View>
        <View style={styles.matchStat}>
          <Clock size={13} color={COLORS.gray} />
          <Text style={styles.matchStatText}>
            +{item.estimated_detour_min} min detour
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.requestBtn}
        onPress={() => handleRequest(item)}
      >
        <CheckCircle size={16} color={COLORS.white} />
        <Text style={styles.requestBtnText}>Request Carpool</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Users size={20} color={COLORS.primary} />
            <Text style={styles.headerTitle}>AI Carpool Matches</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={20} color={COLORS.dark} />
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Finding your best matches…</Text>
          </View>
        )}

        {!loading && result && result.ranked_matches.length === 0 && (
          <View style={styles.emptyBox}>
            <Users size={40} color={COLORS.gray} />
            <Text style={styles.emptyTitle}>No matches found</Text>
            <Text style={styles.emptyText}>{result.best_match_summary}</Text>
          </View>
        )}

        {!loading && result && result.ranked_matches.length > 0 && (
          <>
            {/* Summary banner */}
            <LinearGradient
              colors={["#E0F7FA", "#B2EBF2"]}
              style={styles.summaryBanner}
            >
              <Text style={styles.summaryText}>{result.best_match_summary}</Text>
            </LinearGradient>

            <FlatList
              data={result.ranked_matches}
              keyExtractor={(item) => item.ride_id}
              renderItem={renderMatch}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
    backgroundColor: COLORS.white,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { fontFamily: "InstrumentSerif", fontSize: 24, color: "#0B1A1F" },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: COLORS.grayLight,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 15, color: COLORS.gray },

  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: COLORS.dark },
  emptyText: { fontSize: 14, color: COLORS.gray, textAlign: "center", lineHeight: 20 },

  summaryBanner: {
    margin: 16,
    borderRadius: 14,
    padding: 14,
  },
  summaryText: { fontSize: 13, color: COLORS.dark, lineHeight: 19 },

  list: { paddingHorizontal: 16, paddingBottom: 32 },

  matchCard: {
    backgroundColor: COLORS.white,
    borderRadius: 26,
    padding: 18,
    marginBottom: 12,
    shadowColor: "#0B1A1F",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  matchHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
  },
  matchInfo: { flex: 1 },
  matchName: { fontFamily: "InstrumentSerif", fontSize: 20, color: "#0B1A1F" },
  matchReasoning: { fontSize: 12, color: COLORS.gray, marginTop: 2, lineHeight: 16 },
  scoreBox: { alignItems: "center" },
  scoreText: { fontFamily: "InstrumentSerif", fontSize: 24, color: COLORS.dark },
  scoreLabel: {
    fontFamily: "JetBrainsMono",
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.gray,
    marginTop: 2,
  },

  barBg: {
    height: 4,
    backgroundColor: COLORS.grayLight,
    borderRadius: 2,
    marginBottom: 12,
    overflow: "hidden",
  },
  barFill: { height: 4, borderRadius: 2 },

  matchStats: { flexDirection: "row", gap: 16, marginBottom: 14 },
  matchStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  matchStatText: {
    fontFamily: "JetBrainsMono",
    fontSize: 11,
    letterSpacing: 0.3,
    color: COLORS.gray,
  },

  requestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1A1F",
    borderRadius: 999,
    paddingVertical: 15,
    gap: 8,
  },
  requestBtnText: {
    color: "#FAF7EF",
    fontFamily: "JetBrainsMono",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});

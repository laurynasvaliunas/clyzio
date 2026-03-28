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

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  grayLight: "#F1F5F9",
  green: "#4CAF50",
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
        <View style={styles.avatarPlaceholder}>
          <Users size={18} color={COLORS.primary} />
        </View>
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
  headerTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
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
  matchName: { fontSize: 15, fontWeight: "bold", color: COLORS.dark },
  matchReasoning: { fontSize: 12, color: COLORS.gray, marginTop: 2, lineHeight: 16 },
  scoreBox: { alignItems: "center" },
  scoreText: { fontSize: 20, fontWeight: "bold", color: COLORS.primary },
  scoreLabel: { fontSize: 10, color: COLORS.gray },

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
  matchStatText: { fontSize: 12, color: COLORS.gray },

  requestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  requestBtnText: { color: COLORS.white, fontWeight: "bold", fontSize: 14 },
});

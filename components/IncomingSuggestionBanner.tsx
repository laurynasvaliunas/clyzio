import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { useEffect, useRef } from "react";
import { Users, Leaf, Check, X } from "lucide-react-native";
import { CarpoolSuggestion, useAIStore } from "../store/useAIStore";

const COLORS = {
  primary: "#26C6DA",
  dark: "#006064",
  green: "#4CAF50",
  white: "#FFFFFF",
  gray: "#90A4AE",
  light: "#E0F7FA",
  error: "#EF5350",
};

interface Props {
  suggestion: CarpoolSuggestion;
}

function SuggestionCard({ suggestion }: Props) {
  const { respondToSuggestion } = useAIStore();
  const slideAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const senderName =
    suggestion.from_profile?.first_name ??
    suggestion.from_profile?.email?.split("@")[0] ??
    "Someone";

  const handleRespond = (response: "accepted" | "declined") => {
    respondToSuggestion(suggestion.id, response);
  };

  return (
    <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Users size={18} color={COLORS.primary} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>
            <Text style={styles.bold}>{senderName}</Text> wants to carpool with you
          </Text>
          {suggestion.ai_reasoning ? (
            <Text style={styles.reasoning} numberOfLines={2}>
              {suggestion.ai_reasoning}
            </Text>
          ) : null}
          <View style={styles.stats}>
            {suggestion.co2_saving_kg != null && (
              <View style={styles.stat}>
                <Leaf size={11} color={COLORS.green} />
                <Text style={styles.statText}>
                  -{suggestion.co2_saving_kg.toFixed(2)} kg CO2
                </Text>
              </View>
            )}
            {suggestion.compatibility_score != null && (
              <Text style={styles.score}>
                {suggestion.compatibility_score}% match
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.declineBtn]}
          onPress={() => handleRespond("declined")}
        >
          <X size={14} color={COLORS.gray} />
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.acceptBtn]}
          onPress={() => handleRespond("accepted")}
        >
          <Check size={14} color={COLORS.white} />
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

/**
 * Drop this anywhere in a screen (or layout) to show incoming carpool
 * suggestions reactively. Wire up subscribeToIncomingSuggestions() in
 * the root layout useEffect.
 */
export default function IncomingSuggestionBanner() {
  const { incomingSuggestions } = useAIStore();

  const pending = incomingSuggestions.filter((s) => s.status === "pending");
  if (pending.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {pending.slice(0, 2).map((s) => (
        <SuggestionCard key={s.id} suggestion={s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: { flex: 1 },
  title: { fontSize: 13, color: COLORS.dark, lineHeight: 18 },
  bold: { fontWeight: "700" },
  reasoning: { fontSize: 12, color: COLORS.gray, marginTop: 3, lineHeight: 16 },
  stats: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 11, color: COLORS.gray },
  score: { fontSize: 11, color: COLORS.primary, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  declineBtn: { backgroundColor: "#F1F5F9" },
  acceptBtn: { backgroundColor: COLORS.primary },
  declineBtnText: { fontSize: 13, color: COLORS.gray, fontWeight: "600" },
  acceptBtnText: { fontSize: 13, color: COLORS.white, fontWeight: "600" },
});

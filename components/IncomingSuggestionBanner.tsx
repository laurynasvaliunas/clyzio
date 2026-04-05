import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
} from "react-native";
import { useEffect, useRef, useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Users, Leaf, Check, X } from "lucide-react-native";
import { CarpoolSuggestion, useAIStore } from "../store/useAIStore";

const COLORS = {
  primary: "#26C6DA",
  dark: "#006064",
  green: "#4CAF50",
  greenBg: "#E8F5E9",
  white: "#FFFFFF",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  light: "#E0F7FA",
  error: "#EF5350",
  declineBg: "#F1F5F9",
  accentPurple: "#7C3AED",
  accentPurpleBg: "#EDE9FE",
};

interface Props {
  suggestion: CarpoolSuggestion;
  topOffset: number;
  index: number;
}

function SuggestionCard({ suggestion, topOffset, index }: Props) {
  const { respondToSuggestion } = useAIStore();
  const slideY = useRef(new Animated.Value(-160)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        friction: 10,
        tension: 65,
        useNativeDriver: true,
        delay: index * 80,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const animateOut = useCallback(
    (cb?: () => void) => {
      Animated.parallel([
        Animated.timing(slideY, { toValue: -160, duration: 260, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(cb);
    },
    []
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -8,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -20) animateOut();
      },
    })
  ).current;

  const senderName =
    suggestion.from_profile?.first_name ??
    suggestion.from_profile?.email?.split("@")[0] ??
    "Someone";

  const handleRespond = (response: "accepted" | "declined") => {
    animateOut(() => respondToSuggestion(suggestion.id, response));
  };

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateY: slideY }], opacity }]}
      {...panResponder.panHandlers}
    >
      {/* Left accent bar */}
      <View style={styles.accentBar} />

      <View style={styles.body}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Users size={17} color={COLORS.accentPurple} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              <Text style={styles.bold}>{senderName}</Text>
              {" "}wants to carpool with you
            </Text>
            {suggestion.ai_reasoning ? (
              <Text style={styles.reasoning} numberOfLines={2}>
                {suggestion.ai_reasoning}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Stats row */}
        {(suggestion.co2_saving_kg != null || suggestion.compatibility_score != null) && (
          <View style={styles.statsRow}>
            {suggestion.co2_saving_kg != null && (
              <View style={styles.badge}>
                <Leaf size={11} color={COLORS.green} />
                <Text style={[styles.badgeText, { color: COLORS.green }]}>
                  −{suggestion.co2_saving_kg.toFixed(2)} kg CO₂
                </Text>
              </View>
            )}
            {suggestion.compatibility_score != null && (
              <View style={[styles.badge, { backgroundColor: COLORS.light }]}>
                <Text style={[styles.badgeText, { color: COLORS.primary }]}>
                  {suggestion.compatibility_score}% match
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.declineBtn]}
            onPress={() => handleRespond("declined")}
            activeOpacity={0.7}
          >
            <X size={13} color={COLORS.gray} />
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.acceptBtn]}
            onPress={() => handleRespond("accepted")}
            activeOpacity={0.85}
          >
            <Check size={13} color={COLORS.white} />
            <Text style={styles.acceptText}>Accept Ride</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

export default function IncomingSuggestionBanner() {
  const { incomingSuggestions } = useAIStore();
  const insets = useSafeAreaInsets();

  const pending = incomingSuggestions.filter((s) => s.status === "pending");
  if (pending.length === 0) return null;

  const topOffset = insets.top + (Platform.OS === "android" ? 8 : 4);

  return (
    <View
      style={[styles.container, { top: topOffset }]}
      pointerEvents="box-none"
    >
      {pending.slice(0, 2).map((s, i) => (
        <SuggestionCard key={s.id} suggestion={s} topOffset={topOffset} index={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 998,
    gap: 8,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 8,
  },
  accentBar: {
    width: 4,
    backgroundColor: COLORS.accentPurple,
  },
  body: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.accentPurpleBg,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 3 },
  title: {
    fontSize: 13,
    color: COLORS.dark,
    lineHeight: 18,
  },
  bold: { fontWeight: "700" },
  reasoning: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.greenBg,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
  },
  declineBtn: {
    backgroundColor: COLORS.declineBg,
  },
  acceptBtn: {
    backgroundColor: COLORS.accentPurple,
  },
  declineText: {
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: "600",
  },
  acceptText: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: "600",
  },
});

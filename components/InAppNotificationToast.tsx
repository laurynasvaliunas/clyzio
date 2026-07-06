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
import { useRouter } from "expo-router";
import {
  Leaf,
  Car,
  Users,
  Trophy,
  Bell,
  MapPin,
  X,
} from "lucide-react-native";
import { ToastItem, useNotificationToastStore } from "../store/useNotificationToastStore";

const AUTO_DISMISS_MS = 4500;

const TYPE_CONFIG: Record<
  ToastItem["type"],
  { icon: React.ElementType; iconColor: string; accentColor: string; bg: string }
> = {
  co2:      { icon: Leaf,    iconColor: "#059669", accentColor: "#059669", bg: "#ECFDF5" },
  trip:     { icon: MapPin,  iconColor: "#00565A", accentColor: "#00565A", bg: "#E6F1F2" },
  carpool:  { icon: Users,   iconColor: "#00676D", accentColor: "#00676D", bg: "#EDE9FE" },
  badge:    { icon: Trophy,  iconColor: "#F59E0B", accentColor: "#F59E0B", bg: "#FFFBEB" },
  reminder: { icon: Bell,    iconColor: "#D97706", accentColor: "#D97706", bg: "#FFFBEB" },
  info:     { icon: Car,     iconColor: "#00565A", accentColor: "#00565A", bg: "#E6F1F2" },
};

function ToastCard({ item }: { item: ToastItem }) {
  const { dismiss } = useNotificationToastStore();
  const router = useRouter();
  const slideY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(1)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const config = TYPE_CONFIG[item.type];
  const Icon = config.icon;

  const animateOut = useCallback(() => {
    clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(slideY, { toValue: -120, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => dismiss(item.id));
  }, [item.id]);

  useEffect(() => {
    // Slide in
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0,
        friction: 10,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Progress bar drain
    Animated.timing(progressWidth, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      useNativeDriver: false,
    }).start();

    // Auto dismiss
    dismissTimer.current = setTimeout(animateOut, AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimer.current);
  }, []);

  // Swipe-up to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -8,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -20) animateOut();
      },
    })
  ).current;

  const handlePress = () => {
    if (item.screen) {
      animateOut();
      router.push(item.screen as any);
    }
  };

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateY: slideY }], opacity }]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={item.screen ? 0.85 : 1}
        onPress={handlePress}
        style={styles.cardInner}
      >
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: config.accentColor }]} />

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: config.bg }]}>
          <Icon size={18} color={config.iconColor} />
        </View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={animateOut}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={14} color="#8B989C" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Progress drain bar */}
      <Animated.View
        style={[
          styles.progressBar,
          {
            backgroundColor: config.accentColor,
            width: progressWidth.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </Animated.View>
  );
}

export default function InAppNotificationToast() {
  const { queue } = useNotificationToastStore();
  const insets = useSafeAreaInsets();

  if (queue.length === 0) return null;

  return (
    <View
      style={[styles.container, { top: insets.top + (Platform.OS === "android" ? 8 : 20) }]}
      pointerEvents="box-none"
    >
      {queue.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 999,
    gap: 8,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 8,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 12,
    gap: 10,
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#003D40",
    letterSpacing: 0.1,
  },
  body: {
    fontSize: 12,
    color: "#5A6A6F",
    lineHeight: 17,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  progressBar: {
    height: 3,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
});

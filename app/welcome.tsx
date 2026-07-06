import { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { Bike, Cloud, Smile, ArrowRight } from "lucide-react-native";

/**
 * Welcome — Stage 0 of the customer-journey PDF.
 *
 * The user has just downloaded the app and knows nothing. This screen has
 * three seconds to earn attention before asking for anything.
 *
 * Animation (sequenced, no external assets):
 *   t=0       — bike rider icon slides in from the left
 *   t=0.6s    — CO₂ cloud appears above, shrinks from large → small + greens
 *   t=1.4s    — smiley face fades in to the right
 *   t=1.8s    — tagline fades in below
 *   t=2.2s    — CTA button slides up from below
 *
 * The whole sequence is < 3 seconds so an impatient user can tap the CTA
 * the moment it appears.
 *
 * On "Let's set up" → routes to `/(auth)/login`. The SecureStore flag
 * `clyzio.welcomeSeen.v1` is set so returning users (signed out or fresh
 * device with the flag persisted) don't re-see this. From login the user
 * picks "Sign up" if they're new, or signs in if they already have an
 * account.
 */

const COLORS = {
  bgTop: "#00565A",        // brand deep teal
  bgBottom: "#003D40",     // darker teal
  ink: "#FFFFFF",          // white type on the gradient
  cloudStart: "#DC2626",   // red — represents pollution
  cloudEnd: "#059669",     // emerald — represents savings
  cta: "#FFFFFF",          // white button bg on the gradient
  ctaInk: "#0B1A1F",       // ink on the cta
};

export const WELCOME_SEEN_KEY = "clyzio.welcomeSeen.v1";

export default function WelcomeScreen() {
  const router = useRouter();

  // Stage anims
  const bikeX = useRef(new Animated.Value(-120)).current;
  const bikeOpacity = useRef(new Animated.Value(0)).current;
  const cloudOpacity = useRef(new Animated.Value(0)).current;
  const cloudScale = useRef(new Animated.Value(1.6)).current;
  const cloudColor = useRef(new Animated.Value(0)).current; // 0 → 1 = clay → leaf
  const smileOpacity = useRef(new Animated.Value(0)).current;
  const smileScale = useRef(new Animated.Value(0.6)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(12)).current;
  const ctaY = useRef(new Animated.Value(80)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Stage 1: bike slides in
      Animated.parallel([
        Animated.timing(bikeX, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(bikeOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Stage 2: cloud appears + shrinks + color shifts (clay → leaf)
      Animated.parallel([
        Animated.timing(cloudOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(cloudScale, {
          toValue: 0.85,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cloudColor, {
          toValue: 1,
          duration: 800,
          // Color interpolation can't use native driver
          useNativeDriver: false,
        }),
      ]),
      // Stage 3: smile fades in
      Animated.parallel([
        Animated.timing(smileOpacity, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.spring(smileScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      // Stage 4: tagline
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
        Animated.timing(taglineY, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Stage 5: CTA
      Animated.parallel([
        Animated.timing(ctaY, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(ctaOpacity, {
          toValue: 1,
          duration: 360,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [bikeX, bikeOpacity, cloudOpacity, cloudScale, cloudColor, smileOpacity, smileScale, taglineOpacity, taglineY, ctaY, ctaOpacity]);

  const cloudTint = cloudColor.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.cloudStart, COLORS.cloudEnd],
  });

  const handlePress = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    // Mark welcome as seen so the root layout doesn't re-route here on
    // future cold starts (even after sign-out + sign-in on the same device).
    try { await SecureStore.setItemAsync(WELCOME_SEEN_KEY, "1"); } catch { /* non-fatal */ }
    // Send the user to the login/signup flow.
    router.replace("/(auth)/login" as any);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[COLORS.bgTop, COLORS.bgBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Hero area */}
        <View style={styles.hero}>
          {/* Bike rider */}
          <Animated.View
            style={[
              styles.stageItem,
              {
                transform: [{ translateX: bikeX }],
                opacity: bikeOpacity,
              },
            ]}
          >
            <View style={styles.iconBubble}>
              <Bike size={48} color={COLORS.bgTop} />
            </View>
          </Animated.View>

          {/* CO2 cloud — shrinks + recolors */}
          <Animated.View
            style={[
              styles.stageItem,
              styles.cloudWrap,
              {
                opacity: cloudOpacity,
                transform: [{ scale: cloudScale }],
              },
            ]}
          >
            <Animated.View style={[styles.iconBubble, { backgroundColor: cloudTint }]}>
              <Cloud size={48} color={COLORS.ink} />
            </Animated.View>
            <Text style={styles.cloudLabel} accessibilityLabel="CO 2">CO₂</Text>
          </Animated.View>

          {/* Smile */}
          <Animated.View
            style={[
              styles.stageItem,
              {
                opacity: smileOpacity,
                transform: [{ scale: smileScale }],
              },
            ]}
          >
            <View style={[styles.iconBubble, { backgroundColor: "#F59E0B" }]}>
              <Smile size={48} color={COLORS.bgBottom} />
            </View>
          </Animated.View>
        </View>

        {/* Tagline */}
        <Animated.View
          style={[
            styles.taglineWrap,
            {
              opacity: taglineOpacity,
              transform: [{ translateY: taglineY }],
            },
          ]}
        >
          <Text style={styles.tagline} accessibilityRole="header">
            Track your commute. Shrink your footprint.
          </Text>
        </Animated.View>

        {/* CTA */}
        <Animated.View
          style={[
            styles.ctaWrap,
            {
              opacity: ctaOpacity,
              transform: [{ translateY: ctaY }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.cta}
            onPress={handlePress}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Let's set up"
          >
            <Text style={styles.ctaText}>Let's set up</Text>
            <ArrowRight size={20} color={COLORS.ctaInk} />
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgTop,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  stageItem: {
    alignItems: "center",
    justifyContent: "center",
  },
  cloudWrap: {
    alignItems: "center",
    gap: 6,
  },
  iconBubble: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: COLORS.ink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cloudLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: COLORS.ink,
    opacity: 0.85,
  },
  taglineWrap: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  tagline: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
    color: COLORS.ink,
  },
  ctaWrap: {
    paddingBottom: 12,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.cta,
    paddingVertical: 18,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaText: {
    color: COLORS.ctaInk,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

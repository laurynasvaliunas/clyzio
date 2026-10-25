import { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { Text } from "../components/ui/AppText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { Cloud, Smile, ArrowRight } from "lucide-react-native";
import { BikeIcon } from "../components/icons/TransportIcons";
import { CommuteCity } from "../components/three";
import { GlowBackdrop, PressableScale } from "../components/ui";

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
  bgTop: "#09E0E8",        // the logo's bright cyan
  bgBottom: "#00CBD6",     // a touch deeper at the bottom
  ink: "#0B2540",          // navy type on the bright cyan (9.5:1)
  bubble: "#FFFFFF",       // white story bubbles
  accent: "#007C89",       // deep cyan icon on white
  sun: "#FFDE5A",          // the logo's yellow
  cloudStart: "#DC2626",   // red — represents pollution
  cloudEnd: "#059669",     // emerald — represents savings
  cta: "#FFFFFF",          // white button bg on the gradient
  ctaInk: "#0B2540",       // ink on the cta
};

export const WELCOME_SEEN_KEY = "clyzio.welcomeSeen.v1";

export default function WelcomeScreen() {
  const router = useRouter();
  // Phones without a home indicator (iPhone SE) have no bottom inset, which
  // left the CTA 12pt from the screen edge.
  const { bottom: bottomInset } = useSafeAreaInsets();

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
    // First launch on a device is almost always a new user, so open in
    // sign-up mode (it used to greet them with "Welcome back / Sign in").
    // Returning users switch with one tap.
    router.replace({ pathname: "/(auth)/login", params: { mode: "signup" } } as any);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[COLORS.bgTop, COLORS.bgBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <GlowBackdrop variant="eco" />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Hero: a live 3D city where people commute cleanly. */}
        <View style={styles.hero}>
          <CommuteCity style={styles.city} accessibilityLabel="A small city where a car and a bike share the road" />
        </View>

        {/* The story in three beats: ride → less CO₂ → happier planet. */}
        <View style={styles.storyRow}>
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
              <BikeIcon size={30} color={COLORS.accent} />
            </View>
          </Animated.View>

          {/* CO₂ cloud — shrinks + recolors */}
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
              <Cloud size={30} color={COLORS.bubble} />
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
            <View style={[styles.iconBubble, { backgroundColor: COLORS.sun }]}>
              <Smile size={30} color={COLORS.ink} />
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
            {
              paddingBottom: bottomInset > 0 ? 12 : 24,
              opacity: ctaOpacity,
              transform: [{ translateY: ctaY }],
            },
          ]}
        >
          <PressableScale
            style={styles.cta}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel="Let's set up"
          >
            <Text style={styles.ctaText}>Let's set up</Text>
            <View style={styles.ctaArrow}>
              <ArrowRight size={20} color={COLORS.ink} strokeWidth={2.6} />
            </View>
          </PressableScale>
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
    justifyContent: "center",
    marginHorizontal: -24,
  },
  city: {
    flex: 1,
    minHeight: 260,
    maxHeight: 440,
  },
  storyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 20,
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
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.bubble,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    boxShadow: "inset 0px -3px 0px rgba(11,37,64,0.08), 0px 10px 22px rgba(11,37,64,0.18)",
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
    fontWeight: "900",
    letterSpacing: -0.4,
    textAlign: "center",
    color: COLORS.ink,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.cta,
    minHeight: 60,
    paddingLeft: 26,
    paddingRight: 8,
    borderRadius: 999,
    boxShadow: "inset 0px -4px 0px rgba(11,37,64,0.08), 0px 14px 30px rgba(11,37,64,0.22)",
  },
  ctaArrow: {
    width: 44,
    height: 44,
    borderRadius: 28,
    backgroundColor: COLORS.sun,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0px -3px 0px rgba(11,37,64,0.12)",
  },
  ctaText: {
    color: COLORS.ctaInk,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});

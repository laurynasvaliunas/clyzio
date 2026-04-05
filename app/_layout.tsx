import { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  View,
  StatusBar,
  Platform,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { ToastProvider } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { checkAndSendAINotifications } from "../lib/aiNotifications";
import { useAIStore } from "../store/useAIStore";
import { useTripStore } from "../store/useTripStore";
import { useNotificationToastStore } from "../store/useNotificationToastStore";
import IncomingSuggestionBanner from "../components/IncomingSuggestionBanner";
import InAppNotificationToast from "../components/InAppNotificationToast";
import "../global.css";

// Brand Colors (matching logo)
const COLORS = {
  primary: "#26C6DA",  // Unified Cyan (Phase 27)  // Cyan from logo
  accent: "#FDD835",   // Yellow sun
  dark: "#006064",
  white: "#FFFFFF",
  background: "#F5FAFA",
};

// Configure notification handler — suppress system banner in-foreground;
// we show our own styled in-app toast via InAppNotificationToast instead.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,   // ← no system banner while app is open
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: true,
  }),
});

// Register for push notifications
async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4DD0E1",
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== "granted") {
      console.log("Failed to get push notification permissions");
      return;
    }
    
    try {
      // Note: Push tokens require projectId in Expo Go - this is expected to fail
      // In production builds, this will work correctly
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: "565dc638-6385-4dcf-885d-8abd3f0d9c30",
      })).data;
      console.log("Push token:", token);
    } catch (error) {
      // Expected in Expo Go - push tokens work in development/production builds
      console.log("Push token not available (expected in Expo Go)");
    }
  } else {
    console.log("Push notifications require a physical device");
  }

  return token;
}

// Animated Splash Screen Component — "GPS Pulse → Logo Reveal → Route Build"
function AnimatedSplash({ onAnimationComplete }: { onAnimationComplete: () => void }) {
  // Act 1 — GPS ping rings
  const ping0Scale = useRef(new Animated.Value(0.1)).current;
  const ping1Scale = useRef(new Animated.Value(0.1)).current;
  const ping2Scale = useRef(new Animated.Value(0.1)).current;
  const ping0Opacity = useRef(new Animated.Value(0.7)).current;
  const ping1Opacity = useRef(new Animated.Value(0.7)).current;
  const ping2Opacity = useRef(new Animated.Value(0.7)).current;
  const coreScale = useRef(new Animated.Value(0)).current;

  // Act 2 — Letters: C L Y Z I O (individual refs — React hook rules)
  const l0Op = useRef(new Animated.Value(0)).current;
  const l1Op = useRef(new Animated.Value(0)).current;
  const l2Op = useRef(new Animated.Value(0)).current;
  const l3Op = useRef(new Animated.Value(0)).current;
  const l4Op = useRef(new Animated.Value(0)).current;
  const l5Op = useRef(new Animated.Value(0)).current;
  const l0Y = useRef(new Animated.Value(14)).current;
  const l1Y = useRef(new Animated.Value(14)).current;
  const l2Y = useRef(new Animated.Value(14)).current;
  const l3Y = useRef(new Animated.Value(14)).current;
  const l4Y = useRef(new Animated.Value(14)).current;
  const l5Y = useRef(new Animated.Value(14)).current;
  const dotScale = useRef(new Animated.Value(0)).current;
  const dotY = useRef(new Animated.Value(-18)).current;

  // Act 3 — Route connector + tagline
  const routeOriginOpacity = useRef(new Animated.Value(0)).current;
  const lineScaleY = useRef(new Animated.Value(0)).current;
  const destDotScale = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(10)).current;

  // Exit
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pingScales = [ping0Scale, ping1Scale, ping2Scale];
    const pingOpacities = [ping0Opacity, ping1Opacity, ping2Opacity];
    const letterOps = [l0Op, l1Op, l2Op, l3Op, l4Op, l5Op];
    const letterYs = [l0Y, l1Y, l2Y, l3Y, l4Y, l5Y];

    // Act 1: GPS ping rings fire-and-forget (staggered 180ms)
    [0, 180, 360].forEach((delay, i) => {
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(pingScales[i], { toValue: 2.8, duration: 900, useNativeDriver: true }),
          Animated.timing(pingOpacities[i], { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
      ]).start();
    });

    // Letter animations
    const letterAnims = letterOps.map((op, i) =>
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(letterYs[i], { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      ])
    );

    // Main sequence
    Animated.sequence([
      // Core circle springs in
      Animated.spring(coreScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      // Letters stagger in
      Animated.stagger(110, letterAnims),
      // Yellow accent dot bounces in
      Animated.parallel([
        Animated.spring(dotScale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.spring(dotY, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }),
      ]),
      // Route connector assembles
      Animated.sequence([
        Animated.timing(routeOriginOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(lineScaleY, { toValue: 1, friction: 10, tension: 60, useNativeDriver: true }),
        Animated.spring(destDotScale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
      ]),
      // Tagline slides up
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(taglineY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      // Hold then exit
      Animated.delay(400),
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onAnimationComplete());
  }, []);

  const pingScales = [ping0Scale, ping1Scale, ping2Scale];
  const pingOpacities = [ping0Opacity, ping1Opacity, ping2Opacity];
  const letterOps = [l0Op, l1Op, l2Op, l3Op, l4Op, l5Op];
  const letterYs = [l0Y, l1Y, l2Y, l3Y, l4Y, l5Y];

  return (
    <Animated.View style={[splashStyles.root, { opacity: containerOpacity }]}>
      <LinearGradient colors={["#006064", "#003040"]} style={StyleSheet.absoluteFill} />
      <StatusBar barStyle="light-content" backgroundColor="#006064" />

      {/* Act 1 — GPS ping rings + core dot */}
      <View style={splashStyles.pingContainer}>
        {[0, 1, 2].map(i => (
          <Animated.View
            key={i}
            style={[
              splashStyles.pingRing,
              { transform: [{ scale: pingScales[i] }], opacity: pingOpacities[i] },
            ]}
          />
        ))}
        <Animated.View style={[splashStyles.pingCore, { transform: [{ scale: coreScale }] }]} />
      </View>

      {/* Act 2 — CLYZIO letters + accent dot */}
      <View style={splashStyles.lettersRow}>
        {["C", "L", "Y", "Z", "I", "O"].map((char, i) => (
          <Animated.Text
            key={char}
            style={[
              splashStyles.letterText,
              { opacity: letterOps[i], transform: [{ translateY: letterYs[i] }] },
            ]}
          >
            {char}
          </Animated.Text>
        ))}
        <Animated.View
          style={[
            splashStyles.accentDot,
            { transform: [{ scale: dotScale }, { translateY: dotY }] },
          ]}
        />
      </View>

      {/* Act 3 — Route connector */}
      <View style={splashStyles.routeRow}>
        <Animated.View style={[splashStyles.routeOriginDot, { opacity: routeOriginOpacity }]} />
        <View style={splashStyles.routeLineWrap}>
          <Animated.View style={[splashStyles.routeLine, { transform: [{ scaleY: lineScaleY }] }]} />
        </View>
        <Animated.View style={[splashStyles.routeDestDot, { transform: [{ scale: destDotScale }] }]} />
      </View>

      {/* Tagline */}
      <Animated.Text
        style={[
          splashStyles.tagline,
          { opacity: taglineOpacity, transform: [{ translateY: taglineY }] },
        ]}
      >
        Ride green. Save the planet.
      </Animated.Text>
    </Animated.View>
  );
}

function RootLayoutContent() {
  const { isDark } = useTheme(); // Use theme context instead of system color scheme
  const router = useRouter();
  const segments = useSegments();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { subscribeToIncomingSuggestions, unsubscribeFromSuggestions } = useAIStore();
  const setUserBaselineFromFuelType = useTripStore((s) => s.setUserBaselineFromFuelType);
  const pushToast = useNotificationToastStore((s) => s.push);
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>("");
  const notificationListener = useRef<Notifications.EventSubscription>(undefined!);
  const responseListener = useRef<Notifications.EventSubscription>(undefined!);

  // CRITICAL: Check for existing session on mount (Fix auth persistence)
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session);
      } catch (error) {
        console.error('Session check error:', error);
        setIsAuthenticated(false);
      }
    };
    
    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Subscribe to incoming carpool suggestions when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      subscribeToIncomingSuggestions();
    } else {
      unsubscribeFromSuggestions();
    }
    return () => {
      unsubscribeFromSuggestions();
    };
  }, [isAuthenticated]);

  // Seed trip store CO2 baseline from user's car fuel type on sign-in
  useEffect(() => {
    if (!isAuthenticated) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('car_fuel_type')
        .eq('id', user.id)
        .single();
      if (data?.car_fuel_type) {
        setUserBaselineFromFuelType(data.car_fuel_type);
      }
    });
  }, [isAuthenticated]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isAuthenticated === null) return; // Still loading

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // Not authenticated, redirect to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated but in auth screens, redirect to app
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments]);

  useEffect(() => {
    // Register for push notifications and store token in DB
    registerForPushNotificationsAsync().then(async (token) => {
      setExpoPushToken(token);
      if (token) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('profiles').update({ expo_push_token: token }).eq('id', user.id);
        }
      }
    });

    // Check if AI-powered notifications should be sent on app open
    checkAndSendAINotifications().catch(() => {});

    // Intercept incoming notifications → show styled in-app toast instead of system banner
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      if (title) {
        pushToast({
          title: title as string,
          body: (body as string) ?? "",
          screen: (data?.screen as string) ?? undefined,
          type: undefined as any, // inferred from title by the store
        });
      }
    });

    // Listen for user tapping on notification — deep-link into daily commute flow
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("Notification response:", response);
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'daily-commute') {
        router.push('/daily-commute');
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const handleAnimationComplete = () => {
    setIsReady(true);
  };

  // Show animated splash until ready
  if (!isReady) {
    return (
      <SafeAreaProvider>
        <AnimatedSplash onAnimationComplete={handleAnimationComplete} />
      </SafeAreaProvider>
    );
  }

  const bgColor = isDark ? '#000000' : COLORS.background;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={statusBarStyle} translucent backgroundColor="transparent" />
      <View style={{ flex: 1, backgroundColor: bgColor }} className={isDark ? 'dark' : ''}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(manager)" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="trip" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="legal" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="daily-commute" options={{ headerShown: false, presentation: "modal" }} />
        </Stack>
        <IncomingSuggestionBanner />
        <InAppNotificationToast />
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RootLayoutContent />
      </ToastProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({});

const splashStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Act 1 — ping rings
  pingContainer: {
    position: "absolute",
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  pingRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: "#26C6DA",
  },
  pingCore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#26C6DA",
  },
  // Act 2 — letters
  lettersRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 32,
    position: "relative",
  },
  letterText: {
    fontSize: 68,
    fontWeight: "800",
    color: "#26C6DA",
    letterSpacing: -1,
  },
  accentDot: {
    position: "absolute",
    right: -10,
    top: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FDD835",
  },
  // Act 3 — route connector
  routeRow: {
    alignItems: "center",
    marginTop: 20,
  },
  routeOriginDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#26C6DA",
  },
  routeLineWrap: {
    width: 2,
    height: 32,
    overflow: "hidden",
  },
  routeLine: {
    width: 2,
    height: 32,
    backgroundColor: "rgba(38,198,218,0.35)",
  },
  routeDestDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FDD835",
  },
  // Tagline
  tagline: {
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
    marginTop: 28,
    letterSpacing: 0.3,
  },
});

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
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { parseLink, toRoutePath, notificationToRoute } from "../lib/deepLinks";
import { hasCompletedCommuteSetup, COMMUTE_SETUP_ROUTE } from "../lib/permissionsPriming";
import { WELCOME_SEEN_KEY } from "./welcome";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { ToastProvider } from "../contexts/ToastContext";
import { supabase } from "../lib/supabase";
import { checkAndSendAINotifications } from "../lib/aiNotifications";
import { useAIStore } from "../store/useAIStore";
import { useTripStore } from "../store/useTripStore";
import { useNotificationToastStore } from "../store/useNotificationToastStore";
import IncomingSuggestionBanner from "../components/IncomingSuggestionBanner";
import InAppNotificationToast from "../components/InAppNotificationToast";
import ErrorBoundary from "../components/ErrorBoundary";
import { initSentry, setSentryUser, clearSentryUser, captureError, Sentry } from "../lib/sentry";
import "../global.css";

// Initialise Sentry as early as possible — before any component renders
initSentry();

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
    // 1.1 — Don't prompt silently here. The priming screen (1.1) owns
    // first-time consent so the user sees the *why* before the OS dialog.
    // We only proceed if permission has already been granted (either by
    // the priming flow or by a returning-user OS-level grant).
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus !== "granted") {
      if (__DEV__) {
        console.log("Push permission not granted yet — token registration deferred to priming flow");
      }
      return;
    }
    
    try {
      // Resolve EAS projectId dynamically from app.config.ts — avoids drift if
      // the project is ever rotated.
      const projectId =
        (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
        (Constants as any)?.easConfig?.projectId;
      if (!projectId) {
        if (__DEV__) { console.log("Push token skipped — missing EAS projectId"); }
        return token;
      }
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (__DEV__) { console.log("Push token registered"); }
    } catch (_error) {
      if (__DEV__) { console.log("Push token not available (expected in Expo Go)"); }
    }
  } else {
    if (__DEV__) { console.log("Push notifications require a physical device"); }
  }

  return token;
}

// 1.6 — Splash skip-on-repeat. The full splash is gorgeous but ~3.3 s long;
// past the first run it just delays daily users. We persist the app version
// of the last full play and short-circuit subsequent cold starts to a tiny
// fade. The full sequence reappears whenever the app version changes — a
// small reward for shipping.
const SPLASH_VERSION_KEY = "clyzio.splashSeen.version";
const APP_VERSION =
  ((Constants as any)?.expoConfig?.version as string | undefined) ?? "1.0.0";

// Animated Splash Screen Component — clean, image-led brand reveal.
// Single act: logo scales up with a subtle glow, tagline fades in, fade out.
// First launch ≈ 1.6 s; repeat launches collapse to ≈ 600 ms via skipToEnd.
function AnimatedSplash({
  onAnimationComplete,
  skipToEnd = false,
}: {
  onAnimationComplete: () => void;
  skipToEnd?: boolean;
}) {
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.6)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(8)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (skipToEnd) {
      logoScale.setValue(1);
      logoOpacity.setValue(1);
      glowScale.setValue(1);
      glowOpacity.setValue(0.45);
      taglineOpacity.setValue(1);
      taglineY.setValue(0);
      Animated.sequence([
        Animated.delay(350),
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => onAnimationComplete());
      return;
    }

    Animated.sequence([
      // Logo + soft halo scale and fade in together.
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowScale, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.45,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Tagline slides up gently.
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(taglineY, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Hold a beat so the brand registers.
      Animated.delay(420),
      // Smooth fade out.
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 380,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onAnimationComplete());
  }, []);

  return (
    <Animated.View style={[splashStyles.root, { opacity: containerOpacity }]}>
      <LinearGradient
        colors={["#09E0E8", "#26C6DA"]}
        style={StyleSheet.absoluteFill}
      />
      <StatusBar barStyle="light-content" backgroundColor="#09E0E8" />

      <View style={splashStyles.logoWrap}>
        <Animated.View
          style={[
            splashStyles.glow,
            {
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />
        <Animated.Image
          source={require("../assets/icon.png")}
          resizeMode="contain"
          style={[
            splashStyles.logo,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
          accessibilityLabel="Clyzio"
        />
      </View>

      <Animated.Text
        style={[
          splashStyles.tagline,
          { opacity: taglineOpacity, transform: [{ translateY: taglineY }] },
        ]}
      >
        Track your commute. Shrink your footprint.
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
  // 1.6 — Has this user already seen the full splash for *this* app
  // version? `null` = still resolving (we wait before mounting splash to
  // avoid the wrong variant flashing). `true` = fast path. `false` = full.
  const [splashSkipResolved, setSplashSkipResolved] = useState<boolean | null>(null);
  const [skipFullSplash, setSkipFullSplash] = useState(false);

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
      if (session?.user?.id) {
        setSentryUser(session.user.id);
      } else {
        clearSentryUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // H4: deep-link handler queues URLs that arrive before the router/auth is
  // ready, then drains the queue once `isReady && isAuthenticated !== null`.
  // Previous implementation used `setTimeout(..., 0)` which dropped links
  // silently if the router wasn't mounted yet (e.g. cold-start from a push
  // notification or universal link).
  const pendingDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    const enqueue = (url: string | null) => {
      if (!url) return;
      pendingDeepLinkRef.current = url;
    };
    Linking.getInitialURL().then(enqueue);
    const sub = Linking.addEventListener('url', (ev) => enqueue(ev.url));
    return () => sub.remove();
  }, []);

  // Drain the pending deep link once the navigator is ready.
  useEffect(() => {
    if (!isReady || isAuthenticated === null) return;
    const url = pendingDeepLinkRef.current;
    if (!url) return;
    pendingDeepLinkRef.current = null;
    try {
      const target = parseLink(url);
      const path = toRoutePath(target);
      if (path) router.push(path as any);
    } catch (err) {
      captureError(err, { feature: 'deep-link', url });
    }
  }, [isReady, isAuthenticated, router]);

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

  // Welcome-seen gate: first-ever cold-launch on this device sees the
  // Welcome (Stage 0 of the customer-journey PDF) before login. The flag
  // is persisted in SecureStore by `app/welcome.tsx` when the user taps
  // "Let's set up". `null` = still resolving (we don't route until we know).
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync(WELCOME_SEEN_KEY)
      .then((v) => setWelcomeSeen(v === "1"))
      .catch(() => setWelcomeSeen(true)); // on storage error, skip welcome — never block launch
  }, []);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isAuthenticated === null) return;      // Still loading auth
    if (welcomeSeen === null) return;          // Still loading welcome flag

    const inAuthGroup = segments[0] === '(auth)';
    // Public (no auth required) screens — Terms / Privacy / Licenses pages
    // must be reachable without login for App Store / Play Store review.
    const inPublicGroup = segments[0] === 'legal';
    const inWelcome = segments[0] === 'welcome';
    // First-run setup screens (Stage 1 of the PDF). Authenticated route, but
    // outside (auth) so the "kick auth'd users out of (auth)" rule below
    // doesn't fire. Setup is reached only via nextRouteAfterAuth.
    const inSetup = segments[0] === 'setup';

    // Unauthed + never seen Welcome → land on Welcome first.
    if (!isAuthenticated && !welcomeSeen && !inWelcome && !inAuthGroup && !inPublicGroup) {
      router.replace('/welcome' as any);
      return;
    }
    if (!isAuthenticated && !inAuthGroup && !inPublicGroup && !inWelcome && !inSetup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && (inAuthGroup || inWelcome)) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, welcomeSeen, segments]);

  // First-run resilience: if an authenticated user hasn't finished commute setup
  // (e.g. they quit mid-flow), resume them on this launch. Runs once per launch
  // and only outside the auth/legal/welcome groups so it doesn't fight other
  // routing. Tolerates the flag column being absent (treated as done).
  // The destination is the canonical first-run route from permissionsPriming
  // (changed in Phase 1.2 of the customer-journey rebuild — was profile?setup=1,
  // now edit-profile?setup=1; Phase 2 will move it to /setup/places).
  const commuteGateChecked = useRef(false);
  useEffect(() => {
    if (isAuthenticated !== true || commuteGateChecked.current) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inPublicGroup = segments[0] === 'legal';
    const inWelcome = segments[0] === 'welcome';
    const inSetup = segments[0] === 'setup';
    if (inAuthGroup || inPublicGroup || inWelcome || inSetup) return;
    commuteGateChecked.current = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!(await hasCompletedCommuteSetup(user.id))) {
          router.replace(COMMUTE_SETUP_ROUTE as any);
        }
      } catch { /* ignore — never block launch */ }
    })();
  }, [isAuthenticated, segments]);

  useEffect(() => {
    // H3: only register for push notifications once the user is authenticated.
    // Registering before auth means the upsert below has no user.id to bind to,
    // so the token is silently dropped and notifications never reach the device.
    if (!isAuthenticated) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (cancelled) return;
        setExpoPushToken(token);
        if (!token) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        const { error } = await supabase
          .from('profiles')
          .update({ expo_push_token: token })
          .eq('id', user.id);
        if (error) {
          captureError(error, { feature: 'push-token-register' });
        }
      } catch (err) {
        captureError(err, { feature: 'push-token-register' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {

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

    // Listen for user tapping on notification — dispatch via the central
    // table in `lib/deepLinks.ts` so trip-match / chat / rating / invite
    // notifications all route correctly. Previously only `daily-commute`
    // was handled, so every other notification tap landed on whatever
    // screen the user happened to have open.
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      if (__DEV__) { console.log("Notification response:", response); }
      const data = response.notification.request.content.data;
      const route = notificationToRoute(data as any);
      if (route) {
        router.push(route as any);
      } else {
        // Unknown screen — leave a breadcrumb so we can catch server-side
        // payload typos or out-of-date clients in Sentry.
        Sentry.addBreadcrumb({
          category: 'notification',
          level: 'warning',
          message: 'notification opened with no matching route',
          data: { screen: (data as any)?.screen ?? null },
        });
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

  // 1.6 — Resolve the splash skip preference once on mount. SecureStore is
  // typically <30 ms; if it errors (rare) we just fall back to the full
  // animation, which is the safe default.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(SPLASH_VERSION_KEY);
        if (cancelled) return;
        setSkipFullSplash(stored === APP_VERSION);
      } catch {
        if (!cancelled) setSkipFullSplash(false);
      } finally {
        if (!cancelled) setSplashSkipResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAnimationComplete = () => {
    setIsReady(true);
    // Persist that this version has played in full so subsequent cold
    // starts use the fast path. Fire-and-forget — failure is harmless.
    if (!skipFullSplash) {
      SecureStore.setItemAsync(SPLASH_VERSION_KEY, APP_VERSION).catch(() => {});
    }
  };

  // Show animated splash until BOTH the intro animation has played out AND
  // the auth session has been resolved. Previously we only waited on `isReady`
  // which meant a fraction of a second of unauthenticated tabs flashed before
  // the redirect effect ran.
  if (!isReady || isAuthenticated === null || splashSkipResolved === null) {
    return (
      <SafeAreaProvider>
        <AnimatedSplash
          onAnimationComplete={handleAnimationComplete}
          skipToEnd={skipFullSplash}
        />
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

function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <RootLayoutContent />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

// Sentry.wrap enables automatic JS error capture + native crash reporting
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({});

const splashStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  // Soft halo behind the mark — gives depth without competing with the logo.
  glow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 32,
    // Subtle drop shadow on iOS so the white O reads against the cyan halo.
    shadowColor: "#003040",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  tagline: {
    marginTop: 36,
    fontSize: 15,
    color: "rgba(255,255,255,0.92)",
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});

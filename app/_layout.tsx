import { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { 
  View, 
  StatusBar, 
  Platform, 
  StyleSheet, 
  Image, 
  Text,
  Animated,
  Easing,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { supabase } from "../lib/supabase";
import { checkAndSendAINotifications } from "../lib/aiNotifications";
import "../global.css";

// Brand Colors (matching logo)
const COLORS = {
  primary: "#26C6DA",  // Unified Cyan (Phase 27)  // Cyan from logo
  accent: "#FDD835",   // Yellow sun
  dark: "#006064",
  white: "#FFFFFF",
  background: "#F5FAFA",
};

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
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
        projectId: "clyzio-app", // Placeholder - will be auto-resolved in production
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

// Logo image
let logoImage: any = null;
try {
  logoImage = require("../assets/images/clyzio-logo.png");
} catch (e) {
  // Logo not found
}

// Animated Splash Screen Component
function AnimatedSplash({ onAnimationComplete }: { onAnimationComplete: () => void }) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Animation sequence
    Animated.sequence([
      // 1. Fade in logo with scale
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      // 2. Fade in tagline
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // 3. Hold
      Animated.delay(1200),
      // 4. Fade out everything
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onAnimationComplete();
    });
  }, []);

  return (
    <Animated.View style={[styles.splashContainer, { opacity: containerOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Logo */}
      <Animated.View style={[
        styles.logoContainer,
        { opacity: logoOpacity, transform: [{ scale: logoScale }] }
      ]}>
        {logoImage ? (
          <Image source={logoImage} style={styles.splashLogo} />
        ) : (
          // Fallback matching the logo design
          <View style={styles.fallbackLogo}>
            <Text style={styles.splashLogoText}>clyzio</Text>
            <View style={styles.splashSunIcon} />
          </View>
        )}
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: textOpacity }]}>
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
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>("");
  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

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
    // Register for push notifications
    registerForPushNotificationsAsync().then((token) => setExpoPushToken(token));

    // Check if AI-powered notifications should be sent on app open
    checkAndSendAINotifications().catch(() => {});


    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log("Notification received:", notification);
    });

    // Listen for user tapping on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("Notification response:", response);
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

  // Apply dark mode class to root (Phase 24)
  const bgColor = isDark ? '#0F172A' : COLORS.background;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={statusBarStyle} backgroundColor={bgColor} />
      <View style={{ flex: 1, backgroundColor: bgColor }} className={isDark ? 'dark' : ''}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="trip" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  // Splash screen - black background like the logo
  splashContainer: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogo: {
    width: 280,
    height: 100,
    resizeMode: "contain",
  },
  // Fallback logo matching the design
  fallbackLogo: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  splashLogoText: {
    fontSize: 64,
    fontWeight: "bold",
    color: COLORS.primary,
    letterSpacing: -1,
  },
  splashSunIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    marginLeft: 4,
    marginTop: -4,
  },
  tagline: {
    fontSize: 16,
    color: COLORS.white,
    marginTop: 32,
    fontWeight: "500",
    opacity: 0.9,
  },
});

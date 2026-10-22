import { useEffect } from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map, Calendar, BarChart3, User, LucideIcon } from "lucide-react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { brand, editorial, elevation, getGlass, motion } from "../../lib/theme";

// Floating glass tab bar (2026-10 redesign). It occupies at most
// TAB_BAR_HEIGHT (88) from the bottom edge — bar height + bottom gap — so the
// screens' TAB_SCREEN_BOTTOM_PADDING still clears it.
const BAR_HEIGHT = 60;
const BAR_RADIUS = 24;

const TINT = {
  activeLight: brand.primaryDark,
  activeDark: "#7FD3D6",
  inactiveLight: editorial.ink4,
  inactiveDark: "rgba(255,255,255,0.45)",
};

function TabIcon({ Icon, color, focused, isDark }: { Icon: LucideIcon; color: string; focused: boolean; isDark: boolean }) {
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(focused ? 1 : 0, motion.spring.snappy);
  }, [focused, on]);
  const pill = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scaleX: 0.55 + 0.45 * on.value }, { scaleY: 0.8 + 0.2 * on.value }],
  }));
  return (
    <View style={styles.iconWrap}>
      <Animated.View
        style={[styles.pill, { backgroundColor: isDark ? "rgba(127,211,214,0.16)" : "rgba(0,86,90,0.10)" }, pill]}
      />
      <Icon size={21} color={color} strokeWidth={focused ? 2.4 : 2} />
    </View>
  );
}

export default function TabsLayout() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const g = getGlass(isDark);
  const bottomGap = Math.max(insets.bottom - 10, 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? TINT.activeDark : TINT.activeLight,
        tabBarInactiveTintColor: isDark ? TINT.inactiveDark : TINT.inactiveLight,
        tabBarStyle: {
          position: "absolute",
          bottom: bottomGap,
          marginHorizontal: 14,
          height: BAR_HEIGHT,
          paddingTop: 6,
          paddingBottom: 6,
          borderRadius: BAR_RADIUS,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          boxShadow: (isDark ? elevation.dark : elevation.light).e4,
        },
        tabBarItemStyle: { height: BAR_HEIGHT - 12 },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, styles.barClip]}>
            <BlurView intensity={g.intensity + 15} tint={g.tint} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]} />
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.barClip,
                { borderWidth: StyleSheet.hairlineWidth, borderColor: g.stroke, borderTopColor: g.highlight },
              ]}
            />
          </View>
        ),
        tabBarLabelStyle: {
          fontWeight: "600",
          // Bumped 9.5 → 11 for legibility (accessibility sweep G1/G4).
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Map",
          tabBarAccessibilityLabel: "Map tab",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={Map} color={color} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarAccessibilityLabel: "Activity tab",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={Calendar} color={color} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Impact",
          tabBarAccessibilityLabel: "Impact tab",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={BarChart3} color={color} focused={focused} isDark={isDark} />
          ),
        }}
      />
      {/*
        AI Planner — hidden from the tab bar as of the customer-journey
        rebuild (5 tabs → 4: Map · Activity · Stats · Profile). The route
        file `ai-planner.tsx` is kept so:
          (a) existing navigators / deep links don't crash, and
          (b) Phase 4 of the rebuild can fold its logic into the new
              Plan Ride bottom sheet anchored to the Map screen.
        Using `href: null` is the expo-router idiom for "registered but
        not shown in the tab bar".
      */}
      <Tabs.Screen
        name="ai-planner"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarAccessibilityLabel: "Profile tab",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon Icon={User} color={color} focused={focused} isDark={isDark} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barClip: { borderRadius: BAR_RADIUS, overflow: "hidden" },
  iconWrap: { width: 52, height: 30, alignItems: "center", justifyContent: "center" },
  pill: { position: "absolute", width: 52, height: 30, borderRadius: 15 },
});

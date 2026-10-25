import { useEffect } from "react";
import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Map, Calendar, BarChart3, User, LucideIcon } from "lucide-react-native";
import { useTheme } from "../../contexts/ThemeContext";
import { useChatStore, selectTotalUnread } from "../../store/useChatStore";
import { editorial, elevation, fun, motion } from "../../lib/theme";

// Floating friendly tab bar (2026-10 Waze-style redesign): a white pill with a
// bright cyan bubble behind the active icon. It occupies at most
// TAB_BAR_HEIGHT (88) from the bottom edge — bar height + bottom gap — so the
// screens' TAB_SCREEN_BOTTOM_PADDING still clears it.
const BAR_HEIGHT = 62;
const BAR_RADIUS = 31;

const TINT = {
  activeLight: fun.navy,
  activeDark: "#7CF0F4",
  inactiveLight: editorial.ink3,
  inactiveDark: "rgba(255,255,255,0.55)",
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
        style={[styles.pill, { backgroundColor: isDark ? "rgba(124,240,244,0.18)" : fun.cyan }, pill]}
      />
      <Icon size={22} color={color} strokeWidth={focused ? 2.5 : 2.1} />
    </View>
  );
}

export default function TabsLayout() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom - 10, 12);
  // Unread chat messages, visible from every tab (ChatWatcher counts them).
  const unreadChats = useChatStore(selectTotalUnread);

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
          backgroundColor: isDark ? editorial.night2 : "#FFFFFF",
          borderTopWidth: 0,
          elevation: 0,
          boxShadow: (isDark ? elevation.dark : elevation.light).e3,
        },
        tabBarItemStyle: { height: BAR_HEIGHT - 12 },
        tabBarLabelStyle: {
          // React Navigation draws its own Text, so the rounded font is set here.
          fontFamily: "Nunito_800ExtraBold",
          // Bumped 9.5 → 11 for legibility (accessibility sweep G1/G4).
          fontSize: 11.5,
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
          tabBarAccessibilityLabel: unreadChats > 0 ? `Activity tab, ${unreadChats} unread messages` : "Activity tab",
          tabBarBadge: unreadChats > 0 ? (unreadChats > 9 ? "9+" : unreadChats) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#DC2626",
            color: "#FFFFFF",
            fontFamily: "Nunito_800ExtraBold",
            fontSize: 11,
          },
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
  iconWrap: { width: 54, height: 30, alignItems: "center", justifyContent: "center" },
  pill: { position: "absolute", width: 54, height: 30, borderRadius: 19 },
});

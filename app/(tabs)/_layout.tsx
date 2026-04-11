import { Tabs } from "expo-router";
import { View, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Map, Calendar, BarChart3, User, Sparkles } from "lucide-react-native";
import { useTheme } from "../../contexts/ThemeContext";

const COLORS = {
  primary: "#26C6DA",
  gray: "#90A4AE",
};

export default function TabsLayout() {
  const { isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: isDark ? "rgba(255,255,255,0.4)" : COLORS.gray,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 88,
          paddingBottom: 28,
          paddingTop: 12,
        },
        tabBarBackground: () => (
          <View style={{ flex: 1, backgroundColor: isDark ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.92)" }}>
            <BlurView
              intensity={60}
              tint={isDark ? "dark" : "light"}
              style={{ flex: 1 }}
            />
          </View>
        ),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Map",
          accessibilityLabel: "Map tab",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? COLORS.primary + "20" : "transparent",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <Map size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          accessibilityLabel: "Activity tab",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? COLORS.primary + "20" : "transparent",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <Calendar size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Impact",
          accessibilityLabel: "Impact tab",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? COLORS.primary + "20" : "transparent",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <BarChart3 size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="ai-planner"
        options={{
          title: "AI Plan",
          accessibilityLabel: "AI Plan tab",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? COLORS.primary + "20" : "transparent",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <Sparkles size={22} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          accessibilityLabel: "Profile tab",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? COLORS.primary + "20" : "transparent",
                borderRadius: 12,
                padding: 8,
              }}
            >
              <User size={22} color={color} />
            </View>
          ),
        }}
      />
      {/* Hide trips tab - replaced by activity */}
      <Tabs.Screen
        name="trips"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

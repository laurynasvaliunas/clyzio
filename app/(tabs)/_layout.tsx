import { Tabs } from "expo-router";
import { View } from "react-native";
import { Map, Calendar, BarChart3, User, Sparkles } from "lucide-react-native";

// Brand Colors
const COLORS = {
  primary: "#26C6DA",
  dark: "#006064",
  gray: "#90A4AE",
  background: "#F5FAFA",
  white: "#FFFFFF",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 88,
          paddingBottom: 28,
          paddingTop: 12,
        },
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

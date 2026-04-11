import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Scale } from "lucide-react-native";

const COLORS = {
  primary: "#26C6DA",
  dark: "#006064",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  border: "#E5E7EB",
};

const LICENSES = [
  {
    name: "React Native",
    license: "MIT",
    description: "A framework for building native apps using React.",
  },
  {
    name: "Expo",
    license: "MIT",
    description: "An open-source platform for making universal native apps.",
  },
  {
    name: "Supabase",
    license: "Apache 2.0",
    description: "Open source Firebase alternative with Postgres database.",
  },
  {
    name: "Mapbox",
    license: "Mapbox ToS",
    description: "Maps, navigation, and location search SDK.",
  },
  {
    name: "Zustand",
    license: "MIT",
    description: "A small, fast, and scalable state management solution.",
  },
  {
    name: "Lucide Icons",
    license: "ISC",
    description: "Beautiful and consistent open source icon set.",
  },
  {
    name: "date-fns",
    license: "MIT",
    description: "Modern JavaScript date utility library.",
  },
  {
    name: "React Navigation",
    license: "MIT",
    description: "Routing and navigation for React Native apps.",
  },
  {
    name: "NativeWind",
    license: "MIT",
    description: "Tailwind CSS utility classes for React Native.",
  },
];

export default function LicensesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Open Source Licenses</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Clyzio is built with the help of these amazing open source projects.
          We are grateful to their authors and contributors.
        </Text>

        {LICENSES.map((item, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardHeader}>
              <Scale size={16} color={COLORS.primary} />
              <Text style={styles.packageName}>{item.name}</Text>
              <View style={styles.licenseBadge}>
                <Text style={styles.licenseBadgeText}>{item.license}</Text>
              </View>
            </View>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Full license texts are available in each package's repository.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.dark,
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  intro: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  packageName: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.dark,
    marginLeft: 8,
    flex: 1,
  },
  licenseBadge: {
    backgroundColor: COLORS.primary + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  licenseBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
  description: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginLeft: 24,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.gray,
    textAlign: "center",
  },
});

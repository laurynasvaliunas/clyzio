import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Download, ShieldCheck, Clock } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../contexts/ToastContext";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  dark: "#006064",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  border: "#E5E7EB",
  light: "#E0F7FA",
};

export default function ExportDataScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const handleRequestData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "unknown";
      const userEmail = user?.email || "unknown";

      const subject = encodeURIComponent("GDPR Data Export Request");
      const body = encodeURIComponent(
        `Hello,\n\nI would like to request a copy of my personal data under GDPR Article 20 (Right to Data Portability).\n\nUser ID: ${userId}\nEmail: ${userEmail}\n\nPlease provide my data in a portable, machine-readable format.\n\nThank you.`
      );

      await Linking.openURL(`mailto:info@clyzio.com?subject=${subject}&body=${body}`);

      showToast({
        title: "Request Initiated",
        message: "Your data export request email has been prepared.",
        type: "success",
      });
    } catch (error: any) {
      showToast({
        title: "Error",
        message: "Could not open email client. Please email info@clyzio.com directly.",
        type: "error",
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Export My Data</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Info Card */}
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <ShieldCheck size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>Your Data, Your Rights</Text>
          <Text style={styles.cardBody}>
            Under GDPR Article 20, you have the right to receive your personal
            data in a portable format. This includes your profile information,
            trip history, and sustainability metrics.
          </Text>
        </View>

        {/* What's included */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What's Included</Text>
          <View style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>Profile and account information</Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>Commute trip history and routes</Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>CO2 savings and sustainability data</Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>Preferences and settings</Text>
          </View>
        </View>

        {/* Request Button */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={handleRequestData}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Download size={20} color={COLORS.white} style={{ marginRight: 8 }} />
            <Text style={styles.ctaText}>Request My Data</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Timeline note */}
        <View style={styles.noteCard}>
          <Clock size={18} color={COLORS.primary} />
          <Text style={styles.noteText}>
            We'll process your request within 30 days as required by GDPR. You
            will receive your data via the email associated with your account.
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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.dark,
    textAlign: "center",
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.dark,
    marginBottom: 12,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 10,
  },
  bulletText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    flex: 1,
  },
  ctaBtn: {
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 16,
  },
  ctaGradient: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.white,
  },
  noteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.light,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});

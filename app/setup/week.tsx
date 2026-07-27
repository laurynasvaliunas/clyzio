import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, ArrowRight, Leaf } from "lucide-react-native";

import { supabase } from "../../lib/supabase";
import { useToast } from "../../contexts/ToastContext";
import SetupProgress from "../../components/SetupProgress";
import CommuteMixEditor, {
  type CommuteHabit,
  computeBaseline,
  hasAnyDay,
} from "../../components/CommuteMixEditor";

/**
 * Stage 1.4 — "How do you usually get to work?"
 *
 * Captures the weekly commute mix and derives `baseline_co2` — the per-km
 * figure every CO₂ saving in the app is measured against.
 *
 * Before this screen existed the setup chain never collected a baseline, so
 * Profile displayed a hardcoded 0.192 kg/km (petrol car) labelled "Your Carbon
 * Baseline" for users who had never answered the question — a fabricated
 * number presented as measured.
 *
 * On Next → /setup/done.
 */

const COLORS = {
  bg: "#F7F9FA",
  surface: "#FFFFFF",
  ink: "#0B1A1F",
  inkSoft: "#5A6A6F",
  primary: "#00565A",
  primaryDark: "#003D40",
  border: "#EDF1F2",
  tint: "#E6F1F2",
};

export default function WeekSetupScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [habits, setHabits] = useState<CommuteHabit[]>([]);
  const [saving, setSaving] = useState(false);

  const baseline = computeBaseline(habits);
  const canProceed = hasAnyDay(habits);

  const handleNext = async () => {
    if (!canProceed || baseline === null) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/(auth)/login" as any);
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ commuting_habits: habits, baseline_co2: baseline } as never)
        .eq("id", user.id);
      if (error) throw error;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      router.push("/setup/done" as any);
    } catch (err: any) {
      showToast({
        title: "Couldn't save",
        message: err?.message ?? "Please try again.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={COLORS.ink} />
        </TouchableOpacity>
        <SetupProgress current={3} total={5} />
        <View style={styles.backBtnSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading} accessibilityRole="header">
          How do you usually get to work?
        </Text>
        <Text style={styles.subheading}>
          Pick the modes you use and tap the days. This sets the baseline every
          CO₂ saving is measured against — you can change it anytime.
        </Text>

        <CommuteMixEditor habits={habits} onChange={setHabits} />

        {baseline !== null && (
          <View style={styles.baselineCard}>
            <Leaf size={20} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.baselineLabel}>Your baseline</Text>
              <Text style={styles.baselineValue}>
                {baseline.toFixed(3)} <Text style={styles.baselineUnit}>kg CO₂ / km</Text>
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, !canProceed && styles.ctaDisabled]}
          onPress={handleNext}
          disabled={!canProceed || saving}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          {saving ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <>
              <Text style={styles.ctaText}>Next</Text>
              <ArrowRight size={18} color={COLORS.surface} />
            </>
          )}
        </TouchableOpacity>
        {!canProceed && (
          <Text style={styles.footerHint}>Select at least one day to continue</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnSpacer: { width: 44 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.ink,
    letterSpacing: -0.4,
  },
  subheading: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.inkSoft,
  },
  baselineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.tint,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  baselineLabel: { fontSize: 12, fontWeight: "600", color: COLORS.inkSoft },
  baselineValue: { fontSize: 20, fontWeight: "800", color: COLORS.primaryDark, marginTop: 2 },
  baselineUnit: { fontSize: 13, fontWeight: "600", color: COLORS.inkSoft },
  footer: { paddingHorizontal: 20, paddingBottom: 8 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 999,
    paddingVertical: 18,
    minHeight: 56,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: COLORS.surface, fontSize: 17, fontWeight: "700" },
  footerHint: {
    textAlign: "center",
    fontSize: 12,
    color: COLORS.inkSoft,
    marginTop: 8,
  },
});

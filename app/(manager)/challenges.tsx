import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Switch,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Plus, Target, X } from "lucide-react-native";
import { useManagerStore, NewChallenge } from "../../store/useManagerStore";
import { useToast } from "../../contexts/ToastContext";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  dark: "#006064",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  grayLight: "#F1F5F9",
  green: "#4CAF50",
};

const CHALLENGE_TYPES = [
  { value: "co2_reduction", label: "CO2 Reduction" },
  { value: "carpool_days", label: "Carpool Days" },
  { value: "green_trips", label: "Green Trips" },
  { value: "distance", label: "Distance (km)" },
] as const;

export default function ChallengesScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { challenges, fetchChallenges, createChallenge, toggleChallenge } =
    useManagerStore();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<Partial<NewChallenge>>({
    challenge_type: "co2_reduction",
    reward_xp: 100,
  });
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchChallenges();
    }, [])
  );

  const handleCreate = async () => {
    if (!form.title?.trim()) {
      showToast({ title: 'Required', message: 'Please enter a challenge title.', type: 'warning' });
      return;
    }
    if (!form.target_value || form.target_value <= 0) {
      showToast({ title: 'Required', message: 'Please enter a valid target value.', type: 'warning' });
      return;
    }

    setSaving(true);
    const success = await createChallenge(form as NewChallenge);
    setSaving(false);

    if (success) {
      setShowCreate(false);
      setForm({ challenge_type: "co2_reduction", reward_xp: 100 });
    } else {
      showToast({ title: 'Error', message: 'Could not create challenge. Please try again.', type: 'error' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Company Challenges</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowCreate(true)}
        >
          <Plus size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {challenges.length === 0 && (
          <View style={styles.emptyBox}>
            <Target size={40} color={COLORS.gray} />
            <Text style={styles.emptyTitle}>No challenges yet</Text>
            <Text style={styles.emptyText}>
              Create your first challenge to motivate employees to commute greener.
            </Text>
            <TouchableOpacity
              style={styles.createFirstBtn}
              onPress={() => setShowCreate(true)}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.createFirstGradient}
              >
                <Plus size={16} color={COLORS.white} />
                <Text style={styles.createFirstText}>Create Challenge</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {challenges.map((challenge) => {
          const pct =
            challenge.target_value > 0
              ? Math.min(100, (challenge.current_value / challenge.target_value) * 100)
              : 0;
          return (
            <View key={challenge.id} style={styles.challengeCard}>
              <View style={styles.challengeHeader}>
                <View style={styles.challengeInfo}>
                  <Text style={styles.challengeTitle}>{challenge.title}</Text>
                  <Text style={styles.challengeType}>{challenge.challenge_type}</Text>
                </View>
                <Switch
                  value={challenge.is_active}
                  onValueChange={(val) => toggleChallenge(challenge.id, val)}
                  trackColor={{ false: COLORS.grayLight, true: COLORS.primary + "60" }}
                  thumbColor={challenge.is_active ? COLORS.primary : COLORS.gray}
                />
              </View>

              {challenge.description ? (
                <Text style={styles.challengeDesc}>{challenge.description}</Text>
              ) : null}

              <View style={styles.progressRow}>
                <View style={styles.progressBg}>
                  <View
                    style={[styles.progressFill, { width: `${pct}%` as any }]}
                  />
                </View>
                <Text style={styles.progressPct}>{Math.round(pct)}%</Text>
              </View>

              <View style={styles.challengeMeta}>
                <Text style={styles.challengeMetaText}>
                  Target: {challenge.target_value}{" "}
                  {challenge.challenge_type === "co2_reduction" ? "kg CO2" : "trips"}
                </Text>
                <Text style={styles.challengeMetaText}>
                  Reward: +{challenge.reward_xp} XP
                </Text>
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create Challenge Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Challenge</Text>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <X size={22} color={COLORS.dark} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Go Car-Free Week"
              placeholderTextColor={COLORS.gray}
              value={form.title}
              onChangeText={(v) => setForm({ ...form, title: v })}
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Optional description for employees"
              placeholderTextColor={COLORS.gray}
              multiline
              numberOfLines={3}
              value={form.description}
              onChangeText={(v) => setForm({ ...form, description: v })}
            />

            <Text style={styles.fieldLabel}>Challenge Type *</Text>
            <View style={styles.typeRow}>
              {CHALLENGE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[
                    styles.typeBtn,
                    form.challenge_type === t.value && styles.typeBtnActive,
                  ]}
                  onPress={() => setForm({ ...form, challenge_type: t.value })}
                >
                  <Text
                    style={[
                      styles.typeText,
                      form.challenge_type === t.value && styles.typeTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Target Value *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 100"
              placeholderTextColor={COLORS.gray}
              keyboardType="numeric"
              value={form.target_value?.toString()}
              onChangeText={(v) =>
                setForm({ ...form, target_value: parseFloat(v) || 0 })
              }
            />

            <Text style={styles.fieldLabel}>XP Reward *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 200"
              placeholderTextColor={COLORS.gray}
              keyboardType="numeric"
              value={form.reward_xp?.toString()}
              onChangeText={(v) =>
                setForm({ ...form, reward_xp: parseInt(v) || 0 })
              }
            />

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleCreate}
              disabled={saving}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.saveGradient}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? "Creating…" : "Create Challenge"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  addBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.primary + "40",
  },
  scroll: { flex: 1, paddingHorizontal: 16 },

  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: COLORS.dark },
  emptyText: { fontSize: 14, color: COLORS.gray, textAlign: "center", paddingHorizontal: 24 },
  createFirstBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8 },
  createFirstGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, paddingHorizontal: 28, gap: 8,
  },
  createFirstText: { color: COLORS.white, fontWeight: "bold" },

  challengeCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  challengeHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  challengeInfo: { flex: 1 },
  challengeTitle: { fontSize: 15, fontWeight: "bold", color: COLORS.dark },
  challengeType: { fontSize: 12, color: COLORS.primary, fontWeight: "600", marginTop: 2 },
  challengeDesc: { fontSize: 13, color: COLORS.gray, marginBottom: 10 },
  progressRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8,
  },
  progressBg: {
    flex: 1, height: 6, backgroundColor: COLORS.grayLight, borderRadius: 3, overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  progressPct: { fontSize: 12, fontWeight: "bold", color: COLORS.primary, width: 36 },
  challengeMeta: { flexDirection: "row", justifyContent: "space-between" },
  challengeMetaText: { fontSize: 12, color: COLORS.gray },

  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.grayLight,
    backgroundColor: COLORS.white,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  modalScroll: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },

  fieldLabel: {
    fontSize: 13, fontWeight: "600", color: COLORS.dark,
    marginBottom: 8, marginTop: 4,
  },
  input: {
    backgroundColor: COLORS.white, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: COLORS.dark, marginBottom: 16,
    borderWidth: 1, borderColor: COLORS.grayLight,
  },
  multiline: { height: 80, textAlignVertical: "top" },

  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  typeBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.grayLight,
  },
  typeBtnActive: { backgroundColor: COLORS.primary + "15", borderColor: COLORS.primary },
  typeText: { fontSize: 13, color: COLORS.gray },
  typeTextActive: { color: COLORS.primary, fontWeight: "600" },

  saveBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8 },
  saveGradient: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: 16,
  },
  saveBtnText: { color: COLORS.white, fontWeight: "bold", fontSize: 16 },
});

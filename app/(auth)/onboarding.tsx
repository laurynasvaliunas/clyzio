import { useState, useEffect } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { Building2, Users, Check, ChevronRight } from "lucide-react-native";
import { supabase } from "../../lib/supabase";

// Brand Colors
const COLORS = {
  primary: "#26C6DA",  // Unified Cyan (Phase 27)
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
};

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
}

interface Department {
  id: string;
  name: string;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      // Get user's profile with company info
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(`
          company_id,
          department_id,
          is_solo_user,
          companies:company_id (
            id,
            name,
            logo_url,
            primary_color
          )
        `)
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("Profile error:", profileError);
        router.replace("/(tabs)");
        return;
      }

      // If solo user or already has department, skip onboarding
      if (profile?.is_solo_user || profile?.department_id) {
        router.replace("/(tabs)");
        return;
      }

      // If no company assigned, go to main app
      if (!profile?.company_id || !profile?.companies) {
        router.replace("/(tabs)");
        return;
      }

      setCompany(profile.companies as unknown as Company);
      setUserName(user.email?.split("@")[0] || "there");

      // Fetch departments for this company
      const { data: depts } = await supabase
        .from("departments")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("name");

      if (depts) {
        setDepartments(depts);
      }
    } catch (error) {
      console.error("Error loading onboarding data:", error);
      router.replace("/(tabs)");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDepartment = async () => {
    if (!selectedDepartment) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({ department_id: selectedDepartment })
        .eq("id", user.id);

      if (error) throw error;

      router.replace("/(tabs)");
    } catch (error) {
      console.error("Error saving department:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    router.replace("/(tabs)");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={[company?.primary_color || COLORS.primary, COLORS.primaryDark]}
            style={styles.logoContainer}
          >
            <Building2 size={40} color={COLORS.white} />
          </LinearGradient>
          
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.companyName}>{company?.name || "Your Company"}</Text>
          <Text style={styles.subtitle}>
            Hey {userName}! 👋 Let's get you set up with your team.
          </Text>
        </View>

        {/* Department Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Users size={20} color={COLORS.dark} />
            <Text style={styles.sectionTitle}>Select Your Team</Text>
          </View>

          <View style={styles.departmentList}>
            {departments.map((dept) => {
              const isSelected = selectedDepartment === dept.id;
              return (
                <TouchableOpacity
                  key={dept.id}
                  style={[styles.departmentCard, isSelected && styles.departmentCardSelected]}
                  onPress={() => setSelectedDepartment(dept.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                    {isSelected && <Check size={16} color={COLORS.white} />}
                  </View>
                  <Text style={[styles.departmentName, isSelected && styles.departmentNameSelected]}>
                    {dept.name}
                  </Text>
                  <ChevronRight size={18} color={isSelected ? COLORS.primary : COLORS.gray} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🏢 Why does this matter?</Text>
          <Text style={styles.infoText}>
            Joining a department helps you connect with colleagues who share similar commutes. 
            You'll also compete on the department leaderboard!
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.continueButton, !selectedDepartment && styles.continueButtonDisabled]}
            onPress={handleSelectDepartment}
            disabled={!selectedDepartment || saving}
          >
            <LinearGradient
              colors={selectedDepartment ? [COLORS.primary, COLORS.primaryDark] : [COLORS.gray, COLORS.gray]}
              style={styles.continueGradient}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.continueText}>Join Team</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 32 },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  welcomeText: { fontSize: 16, color: COLORS.gray, marginBottom: 4 },
  companyName: { fontSize: 32, fontWeight: "bold", color: COLORS.dark, marginBottom: 12 },
  subtitle: { fontSize: 15, color: COLORS.gray, textAlign: "center", lineHeight: 22 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  departmentList: { gap: 10 },
  departmentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  departmentCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.light,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.gray,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  checkCircleSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  departmentName: { flex: 1, fontSize: 16, color: COLORS.dark },
  departmentNameSelected: { fontWeight: "600", color: COLORS.primaryDark },
  infoCard: {
    backgroundColor: COLORS.accent + "20",
    borderRadius: 16,
    padding: 18,
    marginBottom: 32,
  },
  infoTitle: { fontSize: 15, fontWeight: "bold", color: COLORS.dark, marginBottom: 8 },
  infoText: { fontSize: 13, color: COLORS.dark, lineHeight: 20 },
  actions: { gap: 12 },
  continueButton: { borderRadius: 16, overflow: "hidden" },
  continueButtonDisabled: { opacity: 0.6 },
  continueGradient: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  continueText: { color: COLORS.white, fontSize: 18, fontWeight: "bold" },
  skipButton: { alignItems: "center", paddingVertical: 14 },
  skipText: { color: COLORS.gray, fontSize: 15, fontWeight: "500" },
});


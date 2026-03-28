import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "../../contexts/ThemeContext";
import { getThemeColors } from "../../lib/theme";
import { useToast } from "../../contexts/ToastContext";
import {
  ChevronLeft,
  User,
  Key,
  Bell,
  Moon,
  FileText,
  Shield,
  Trash2,
  ChevronRight,
  Building2,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";

const COLORS = {
  primary: "#26C6DA",  // Unified Cyan (Phase 27)
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  dark: "#006064",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  grayLight: "#F1F5F9",
  red: "#EF4444",
  green: "#4CAF50",
};

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, isDark, setTheme } = useTheme(); // Use theme context
  const TC = getThemeColors(isDark);
  const { showToast } = useToast();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const darkModeEnabled = isDark;
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    checkManagerRole();
  }, []);

  const checkManagerRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("is_manager")
      .eq("id", user.id)
      .single();
    setIsManager(!!data?.is_manager);
  };

  const handleEditProfile = () => {
    router.push("/settings/edit-profile");
  };

  const handleChangePassword = () => {
    Alert.alert(
      "Change Password",
      "You will receive an email to reset your password.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send Email",
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email) {
              const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: "clyzio://reset-password",
              });
              if (error) {
                showToast({ title: 'Error', message: error.message, type: 'error' });
              } else {
                showToast({ title: 'Email Sent', message: 'Password reset email sent!', type: 'success' });
              }
            }
          },
        },
      ]
    );
  };

  const handlePrivacyPolicy = () => {
    router.push("/legal/privacy");
  };

  const handleTermsOfService = () => {
    router.push("/legal/terms");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to permanently delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Secondary confirmation
            Alert.alert(
              "Final Confirmation",
              "This will permanently delete all your data, trips, and statistics. Are you absolutely sure?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        // Delete user profile
                        await supabase.from("profiles").delete().eq("id", user.id);
                        
                        // Sign out
                        await supabase.auth.signOut();
                        
                        showToast({ title: 'Account Deleted', message: 'Your account has been permanently deleted.', type: 'info' });
                        router.replace("/(auth)/login");
                      }
                    } catch (error: any) {
                      showToast({ title: 'Error', message: error.message, type: 'error' });
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: TC.surface, borderBottomColor: TC.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={TC.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: TC.text }]}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: TC.textSecondary }]}>Account</Text>

          <TouchableOpacity style={[styles.settingItem, { backgroundColor: TC.surface }]} onPress={handleEditProfile}>
            <View style={[styles.iconBox, { backgroundColor: COLORS.primary + "20" }]}>
              <User size={20} color={COLORS.primary} />
            </View>
            <Text style={[styles.settingLabel, { color: TC.text }]}>Edit Profile</Text>
            <ChevronRight size={20} color={TC.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, { backgroundColor: TC.surface }]} onPress={handleChangePassword}>
            <View style={[styles.iconBox, { backgroundColor: COLORS.accent + "20" }]}>
              <Key size={20} color={COLORS.accent} />
            </View>
            <Text style={[styles.settingLabel, { color: TC.text }]}>Change Password</Text>
            <ChevronRight size={20} color={TC.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Manager Section — only shown to managers */}
        {isManager && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: TC.textSecondary }]}>Management</Text>
            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: TC.surface }]}
              onPress={() => router.push("/(manager)/dashboard")}
            >
              <View style={[styles.iconBox, { backgroundColor: COLORS.primary + "20" }]}>
                <Building2 size={20} color={COLORS.primary} />
              </View>
              <Text style={[styles.settingLabel, { color: TC.text }]}>Sustainability Dashboard</Text>
              <ChevronRight size={20} color={TC.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: TC.textSecondary }]}>Preferences</Text>

          <View style={[styles.settingItem, { backgroundColor: TC.surface }]}>
            <View style={[styles.iconBox, { backgroundColor: COLORS.green + "20" }]}>
              <Bell size={20} color={COLORS.green} />
            </View>
            <Text style={[styles.settingLabel, { color: TC.text }]}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: COLORS.grayLight, true: COLORS.primary + "60" }}
              thumbColor={notificationsEnabled ? COLORS.primary : COLORS.gray}
            />
          </View>

          <View style={[styles.settingItem, { backgroundColor: TC.surface }]}>
            <View style={[styles.iconBox, { backgroundColor: COLORS.dark + "20" }]}>
              <Moon size={20} color={COLORS.dark} />
            </View>
            <Text style={[styles.settingLabel, { color: TC.text }]}>Dark Mode</Text>
            <Switch
              value={darkModeEnabled}
              onValueChange={async (value) => {
                // Toggle between dark and light (not system)
                await setTheme(value ? 'dark' : 'light');
              }}
              trackColor={{ false: COLORS.grayLight, true: COLORS.primary + "60" }}
              thumbColor={darkModeEnabled ? COLORS.primary : COLORS.gray}
            />
          </View>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: TC.textSecondary }]}>Legal</Text>

          <TouchableOpacity style={[styles.settingItem, { backgroundColor: TC.surface, borderColor: TC.border }]} onPress={handlePrivacyPolicy}>
            <View style={[styles.iconBox, { backgroundColor: COLORS.gray + "20" }]}>
              <Shield size={20} color={COLORS.gray} />
            </View>
            <Text style={[styles.settingLabel, { color: TC.text }]}>Privacy Policy</Text>
            <ChevronRight size={20} color={TC.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, { backgroundColor: TC.surface, borderColor: TC.border }]} onPress={handleTermsOfService}>
            <View style={[styles.iconBox, { backgroundColor: COLORS.gray + "20" }]}>
              <FileText size={20} color={COLORS.gray} />
            </View>
            <Text style={[styles.settingLabel, { color: TC.text }]}>Terms of Service</Text>
            <ChevronRight size={20} color={TC.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.red }]}>Danger Zone</Text>

          <TouchableOpacity
            style={[styles.settingItem, styles.dangerItem, { backgroundColor: TC.surface }]}
            onPress={handleDeleteAccount}
          >
            <View style={[styles.iconBox, { backgroundColor: COLORS.red + "20" }]}>
              <Trash2 size={20} color={COLORS.red} />
            </View>
            <Text style={[styles.settingLabel, { color: COLORS.red }]}>
              Delete Account
            </Text>
            <ChevronRight size={20} color={COLORS.red} />
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: TC.textSecondary }]}>Clyzio v1.0.0</Text>
          <Text style={[styles.versionSubtext, { color: TC.textSecondary }]}>Made with 🌱 for a greener future</Text>
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
    borderBottomColor: COLORS.grayLight,
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
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.gray,
    textTransform: "uppercase",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.dark,
  },
  dangerItem: {
    borderWidth: 1,
    borderColor: COLORS.red + "30",
  },
  versionContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  versionText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.gray,
  },
  versionSubtext: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
});


import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Mail, Lock, Eye, EyeOff, Leaf, Building2, Check } from "lucide-react-native";
import { supabase } from "../../lib/supabase";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  accent: "#FDD835",
  dark: "#006064",
  light: "#E0F7FA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  green: "#4CAF50",
  border: "#E5E7EB",
};

export default function LoginScreen() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const checkOnboardingNeeded = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, department_id, is_solo_user")
        .eq("id", userId)
        .single();
      if (profile?.company_id && !profile?.department_id && !profile?.is_solo_user) return true;
      return false;
    } catch {
      return false;
    }
  };

  const handleAuth = async () => {
    if (!email.trim()) { Alert.alert("Error", "Please enter your email address"); return; }
    if (!password.trim()) { Alert.alert("Error", "Please enter your password"); return; }
    if (password.length < 6) { Alert.alert("Error", "Password must be at least 6 characters"); return; }
    if (isSignUp && !termsAccepted) {
      Alert.alert("Agreement Required", "Please accept the Terms & Conditions and Privacy Policy to create an account.");
      return;
    }
    setIsLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) { Alert.alert("Sign Up Failed", error.message); return; }
        if (data.user) {
          // Record terms acceptance timestamp
          const now = new Date().toISOString();
          await supabase
            .from("profiles")
            .update({ terms_accepted_at: now, privacy_policy_accepted_at: now })
            .eq("id", data.user.id);

          const needsOnboarding = await checkOnboardingNeeded(data.user.id);
          router.replace(needsOnboarding ? "/(auth)/onboarding" : "/(tabs)");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { Alert.alert("Sign In Failed", error.message); return; }
        if (data.session && data.user) {
          const needsOnboarding = await checkOnboardingNeeded(data.user.id);
          router.replace(needsOnboarding ? "/(auth)/onboarding" : "/(tabs)");
        }
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const emailDomain = email.includes("@") ? email.split("@")[1]?.toLowerCase() : "";
  const isCorpEmail =
    !!emailDomain &&
    !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(emailDomain);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logoText}>CLYZIO</Text>
          <View style={styles.logoDot} />
        </View>

        {/* Welcome */}
        <Text style={styles.heading}>{isSignUp ? "Create account" : "Welcome back"}</Text>
        <Text style={styles.subheading}>
          {isSignUp ? "Join your company's eco team" : "Sign in to your eco commute"}
        </Text>

        {/* Email */}
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputWrap}>
          <Mail size={20} color={COLORS.gray} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="your.email@company.com"
            placeholderTextColor={COLORS.gray}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            testID="login-email"
          />
        </View>

        {/* Corporate detection banner */}
        {isCorpEmail && (
          <View style={styles.corpBanner}>
            <Building2 size={22} color={COLORS.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.corpBannerTitle}>Corporate Detected</Text>
              <Text style={styles.corpBannerSub}>
                {emailDomain} — You'll join your company's eco team!
              </Text>
            </View>
          </View>
        )}

        {/* Password */}
        <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
        <View style={styles.inputWrap}>
          <Lock size={20} color={COLORS.gray} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor={COLORS.gray}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            testID="login-password"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            {showPassword
              ? <EyeOff size={20} color={COLORS.gray} />
              : <Eye size={20} color={COLORS.gray} />
            }
          </TouchableOpacity>
        </View>

        {/* Terms acceptance checkbox — shown only during sign up */}
        {isSignUp && (
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Check size={12} color={COLORS.white} />}
            </View>
            <Text style={styles.checkLabel}>
              {"I agree to the "}
              <Text
                style={styles.checkLink}
                onPress={() => router.push("/legal/terms")}
              >
                Terms & Conditions
              </Text>
              {" and "}
              <Text
                style={styles.checkLink}
                onPress={() => router.push("/legal/privacy")}
              >
                Privacy Policy
              </Text>
            </Text>
          </TouchableOpacity>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaBtn, (isLoading || (isSignUp && !termsAccepted)) && { opacity: 0.5 }]}
          onPress={handleAuth}
          disabled={isLoading || (isSignUp && !termsAccepted)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            {isLoading
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.ctaText}>{isSignUp ? "Create Account" : "Sign In"}</Text>
            }
          </LinearGradient>
        </TouchableOpacity>

        {/* Toggle */}
        <Text style={styles.toggleRow}>
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
          <Text style={styles.toggleLink} onPress={() => { setIsSignUp(!isSignUp); setTermsAccepted(false); }}>
            {isSignUp ? "Sign In" : "Sign Up"}
          </Text>
        </Text>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Leaf size={22} color={COLORS.green} />
          <Text style={styles.infoText}>
            Use your work email to join your company's eco-team!
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 36,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 1,
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginLeft: 3,
    marginTop: 5,
  },

  heading: {
    fontSize: 30,
    fontWeight: "700",
    color: COLORS.dark,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 15,
    color: COLORS.gray,
    marginBottom: 28,
  },

  label: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 15,
    color: COLORS.dark,
  },
  eyeBtn: {
    padding: 4,
  },

  corpBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.light,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    padding: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  corpBannerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.dark,
    marginBottom: 2,
  },
  corpBannerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 20,
    marginBottom: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  checkLink: {
    color: COLORS.primary,
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  ctaBtn: {
    borderRadius: 28,
    overflow: "hidden",
    marginTop: 20,
    marginBottom: 16,
  },
  ctaGradient: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.white,
  },

  toggleRow: {
    textAlign: "center",
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 24,
  },
  toggleLink: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 13,
    color: COLORS.gray,
  },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.light,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});

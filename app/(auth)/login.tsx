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
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Mail, Lock } from "lucide-react-native";
import { supabase } from "../../lib/supabase";

// Brand Colors - UNIFIED (Phase 27)
const COLORS = {
  primary: "#26C6DA",     // Unified Cyan
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
};

// Logo image
let logoImage: any = null;
try {
  logoImage = require("../../assets/images/clyzio-logo.png");
} catch (e) {
  // Logo not found
}

export default function LoginScreen() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const checkOnboardingNeeded = async (userId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, department_id, is_solo_user")
        .eq("id", userId)
        .single();

      // If corporate user without department, show onboarding
      if (profile?.company_id && !profile?.department_id && !profile?.is_solo_user) {
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error checking onboarding:", error);
      return false;
    }
  };

  const handleAuth = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }
    if (!password.trim()) {
      Alert.alert("Error", "Please enter your password");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });

        if (error) {
          Alert.alert("Sign Up Failed", error.message);
          return;
        }

        if (data.user) {
          // Check if onboarding needed
          const needsOnboarding = await checkOnboardingNeeded(data.user.id);
          if (needsOnboarding) {
            router.replace("/(auth)/onboarding");
          } else {
            router.replace("/(tabs)");
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) {
          Alert.alert("Sign In Failed", error.message);
          return;
        }

        if (data.session && data.user) {
          // Check if onboarding needed
          const needsOnboarding = await checkOnboardingNeeded(data.user.id);
          if (needsOnboarding) {
            router.replace("/(auth)/onboarding");
          } else {
            router.replace("/(tabs)");
          }
        }
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Check domain for preview
  const emailDomain = email.includes("@") ? email.split("@")[1].toLowerCase() : "";
  const isCorpDomain = emailDomain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(emailDomain);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        {/* Logo - Using actual logo image */}
        {logoImage ? (
          <Image
            source={logoImage}
            style={styles.logoImage}
          />
        ) : (
          <View style={styles.fallbackLogo}>
            <Text style={styles.fallbackLogoText}>clyzio</Text>
            <View style={styles.sunDot} />
          </View>
        )}
        
        <Text style={styles.subtitle}>
          Corporate ride-sharing for a greener commute
        </Text>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Mail size={20} color={COLORS.gray} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor={COLORS.gray}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              testID="login-email"
            />
          </View>

          {/* Domain Preview */}
          {emailDomain && (
            <View style={[styles.domainPreview, isCorpDomain && styles.domainPreviewCorp]}>
              <Text style={[styles.domainText, isCorpDomain && styles.domainTextCorp]}>
                {isCorpDomain ? `🏢 Corporate: ${emailDomain}` : `👤 Personal account`}
              </Text>
            </View>
          )}

          <View style={styles.inputContainer}>
            <Lock size={20} color={COLORS.gray} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor={COLORS.gray}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              testID="login-password"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={isLoading}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              style={styles.buttonGradient}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>
                  {isSignUp ? "Create Account" : "Sign In"}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setIsSignUp(!isSignUp)}
          >
            <Text style={styles.toggleText}>
              {isSignUp
                ? "Already have an account? Sign In"
                : "Don't have an account? Sign Up"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            💡 Use your work email to join your company's eco-team!
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  // Logo image
  logoImage: {
    width: 180,
    height: 60,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 16,
  },
  // Fallback logo
  fallbackLogo: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "center",
    marginBottom: 16,
  },
  fallbackLogoText: {
    fontSize: 42,
    fontWeight: "bold",
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  sunDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.accent,
    marginLeft: 2,
    marginTop: -2,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: "center",
    marginBottom: 40,
  },
  form: { gap: 14 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.light,
    overflow: "hidden",
  },
  inputIcon: { marginLeft: 16 },
  input: {
    flex: 1,
    height: 56,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.dark,
  },
  domainPreview: {
    backgroundColor: COLORS.light,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: -4,
  },
  domainPreviewCorp: { backgroundColor: COLORS.primary + "20" },
  domainText: { fontSize: 13, color: COLORS.gray },
  domainTextCorp: { color: COLORS.primaryDark, fontWeight: "500" },
  button: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
  buttonDisabled: { opacity: 0.7 },
  buttonGradient: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: COLORS.white, fontSize: 18, fontWeight: "bold" },
  toggleButton: { alignItems: "center", marginTop: 8 },
  toggleText: { color: COLORS.gray, fontSize: 14 },
  infoCard: {
    backgroundColor: COLORS.accent + "20",
    borderRadius: 12,
    padding: 14,
    marginTop: 32,
  },
  infoText: { fontSize: 13, color: COLORS.dark, textAlign: "center" },
});

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Mail, Lock, Eye, EyeOff, Leaf, Building2, Check } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../contexts/ToastContext";
import { nextRouteAfterAuth } from "../../lib/permissionsPriming";

const FREE_MAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
];

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
  const { showToast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Corporate domain → real verified company lookup (drives a truthful banner).
  const [companyMatch, setCompanyMatch] = useState<string | null>(null);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "done">("idle");
  const domainCache = useRef<Map<string, string | null>>(new Map());

  // Debounced lookup: when a work-email domain is typed, ask the shared DB
  // whether it belongs to a registered+verified company. Pre-auth, so this
  // calls a SECURITY DEFINER RPC granted to `anon`. Any error (RPC not yet
  // deployed, offline) degrades silently to the "no match" nudge.
  useEffect(() => {
    const domain = email.includes("@") ? email.split("@")[1]?.toLowerCase() ?? "" : "";
    const looksCorporate =
      !!domain && domain.includes(".") && !FREE_MAIL_DOMAINS.includes(domain);

    if (!looksCorporate) {
      setCompanyMatch(null);
      setLookupStatus("idle");
      return;
    }

    if (domainCache.current.has(domain)) {
      setCompanyMatch(domainCache.current.get(domain) ?? null);
      setLookupStatus("done");
      return;
    }

    let cancelled = false;
    setLookupStatus("loading");
    const t = setTimeout(async () => {
      let name: string | null = null;
      try {
        const { data, error } = await supabase.rpc("lookup_company_by_email_domain", {
          p_email: email.trim(),
        });
        if (!error && typeof data === "string" && data.trim()) name = data;
      } catch {
        /* RPC missing / offline — fall through to the register nudge */
      }
      if (cancelled) return;
      domainCache.current.set(domain, name);
      setCompanyMatch(name);
      setLookupStatus("done");
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [email]);

  const handleAuth = async () => {
    if (!email.trim()) { showToast({ title: 'Error', message: 'Please enter your email address', type: 'error' }); return; }
    if (!password.trim()) { showToast({ title: 'Error', message: 'Please enter your password', type: 'error' }); return; }
    if (password.length < 6) { showToast({ title: 'Error', message: 'Password must be at least 6 characters', type: 'error' }); return; }
    if (isSignUp && !termsAccepted) {
      showToast({ title: 'Agreement Required', message: 'Please accept the Terms & Conditions and Privacy Policy to create an account.', type: 'warning' });
      return;
    }
    setIsLoading(true);
    try {
      if (isSignUp) {
        const now = new Date().toISOString();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          // Carry consent with the user so it survives email confirmation (when
          // the session is deferred past signup). _layout backfills it into the
          // profile on the first authenticated session.
          options: { data: { terms_accepted_at: now, privacy_policy_accepted_at: now } },
        });
        if (error) { showToast({ title: 'Sign Up Failed', message: error.message, type: 'error' }); return; }

        // Email confirmation ON → signUp returns a user but NO session. Don't
        // navigate into the app (it would be unauthenticated); prompt the user
        // to confirm their email, then sign in.
        if (data.user && !data.session) {
          setIsSignUp(false);
          setPassword("");
          setTermsAccepted(false);
          showToast({
            title: 'Confirm your email',
            message: `We sent a confirmation link to ${email.trim()}. Tap it, then sign in.`,
            type: 'success',
          });
          return;
        }

        // Immediate session (email confirmation off) → record consent now, send
        // the branded welcome email, and continue into onboarding.
        if (data.user && data.session) {
          await supabase
            .from("profiles")
            .update({ terms_accepted_at: now, privacy_policy_accepted_at: now })
            .eq("id", data.user.id);

          // Fire-and-forget branded welcome email (idempotent server-side).
          supabase.functions.invoke("welcome-self").catch(() => {});

          // Resolve onboarding → permissions → first-run commute setup → Map.
          const next = await nextRouteAfterAuth(data.user.id);
          router.replace(next as any);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { showToast({ title: 'Sign In Failed', message: error.message, type: 'error' }); return; }
        if (data.session && data.user) {
          const next = await nextRouteAfterAuth(data.user.id);
          router.replace(next as any);
        }
      }
    } catch (error: any) {
      showToast({ title: 'Error', message: error.message || 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const emailDomain = email.includes("@") ? email.split("@")[1]?.toLowerCase() : "";
  const isCorpEmail =
    !!emailDomain && emailDomain.includes(".") && !FREE_MAIL_DOMAINS.includes(emailDomain);

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
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Clyzio logo"
          />
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
            accessibilityLabel="Email address"
          />
        </View>

        {/* Corporate detection banner — truthful: names the real verified
            company, or nudges the user to have their admin register it. */}
        {isCorpEmail && (
          <View style={styles.corpBanner}>
            <Building2 size={22} color={COLORS.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              {companyMatch ? (
                <>
                  <Text style={styles.corpBannerTitle}>{companyMatch}</Text>
                  <Text style={styles.corpBannerSub}>
                    You'll join {companyMatch}'s eco team 🌱
                  </Text>
                </>
              ) : lookupStatus === "loading" ? (
                <>
                  <Text style={styles.corpBannerTitle}>Checking your company…</Text>
                  <Text style={styles.corpBannerSub}>{emailDomain}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.corpBannerTitle}>Using a work email?</Text>
                  <Text style={styles.corpBannerSub}>
                    Ask your admin to register {emailDomain} at clyzio.com to unlock team features.
                  </Text>
                </>
              )}
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
            accessibilityLabel="Password"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} accessibilityLabel={showPassword ? "Hide password" : "Show password"} accessibilityRole="button">
            {showPassword
              ? <EyeOff size={20} color={COLORS.gray} />
              : <Eye size={20} color={COLORS.gray} />
            }
          </TouchableOpacity>
        </View>

        {/* Forgot Password link — shown only during sign in */}
        {!isSignUp && (
          <TouchableOpacity
            onPress={async () => {
              if (!email.trim()) {
                showToast({ title: 'Warning', message: 'Enter your email first', type: 'warning' });
                return;
              }
              try {
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                  redirectTo: "clyzio://reset-password",
                });
                if (error) {
                  showToast({ title: 'Error', message: error.message, type: 'error' });
                } else {
                  showToast({ title: 'Success', message: 'Password reset email sent! Check your inbox.', type: 'success' });
                }
              } catch (err: any) {
                showToast({ title: 'Error', message: err.message || 'Something went wrong', type: 'error' });
              }
            }}
            activeOpacity={0.7}
            style={styles.forgotPasswordWrap}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        )}

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
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 20,
    shadowColor: "#09E0E8",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
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

  forgotPasswordWrap: {
    alignSelf: "flex-end",
    marginTop: 8,
    marginBottom: 4,
  },
  forgotPasswordText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
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

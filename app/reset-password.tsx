import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { Lock, Eye, EyeOff, ShieldCheck, Check } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { useToast } from "../contexts/ToastContext";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  accent: "#FDD835",
  dark: "#006064",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  white: "#FFFFFF",
  border: "#E5E7EB",
  red: "#C4623F",
};

/** Parse both query (?a=b) and fragment (#a=b) params from a URL. */
function parseParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sep of ["?", "#"]) {
    const idx = url.indexOf(sep);
    if (idx === -1) continue;
    const qs = url.slice(idx + 1);
    for (const pair of qs.split("&")) {
      const [k, v] = pair.split("=");
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
  }
  return out;
}

/**
 * Password recovery landing (deep link `clyzio://reset-password#…`).
 * Establishes the recovery session from the link tokens, then lets the user
 * set a new password via `supabase.auth.updateUser`.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [phase, setPhase] = useState<"verifying" | "ready" | "invalid">("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const establishSession = useCallback(async (url: string | null) => {
    try {
      // If a recovery session already exists (e.g. supabase parsed it), use it.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { setPhase("ready"); return; }

      if (!url) { setPhase("invalid"); return; }
      const p = parseParams(url);
      if (p.error_description) { setPhase("invalid"); return; }

      if (p.token_hash && p.type) {
        const { error } = await supabase.auth.verifyOtp({
          type: p.type as any, token_hash: p.token_hash,
        });
        setPhase(error ? "invalid" : "ready");
        return;
      }
      if (p.access_token && p.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: p.access_token, refresh_token: p.refresh_token,
        });
        setPhase(error ? "invalid" : "ready");
        return;
      }
      setPhase("invalid");
    } catch {
      setPhase("invalid");
    }
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(establishSession);
    const sub = Linking.addEventListener("url", (ev) => establishSession(ev.url));
    return () => sub.remove();
  }, [establishSession]);

  const handleSave = async () => {
    if (password.length < 6) {
      showToast({ title: "Weak password", message: "Use at least 6 characters.", type: "warning" });
      return;
    }
    if (password !== confirm) {
      showToast({ title: "Passwords don't match", message: "Please re-enter.", type: "warning" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        showToast({ title: "Could not reset", message: error.message, type: "error" });
        return;
      }
      showToast({ title: "Password updated", message: "You're all set — welcome back!", type: "success" });
      router.replace("/(tabs)");
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Something went wrong", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <ShieldCheck size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.heading}>Reset your password</Text>

          {phase === "verifying" && (
            <View style={{ alignItems: "center", marginTop: 32 }}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.sub}>Verifying your reset link…</Text>
            </View>
          )}

          {phase === "invalid" && (
            <>
              <Text style={styles.sub}>
                This reset link is invalid or has expired. Request a new one from the sign-in screen.
              </Text>
              <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace("/(auth)/login")} activeOpacity={0.85}>
                <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                  <Text style={styles.ctaText}>Back to Sign In</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {phase === "ready" && (
            <>
              <Text style={styles.sub}>Choose a new password for your Clyzio account.</Text>

              <Text style={styles.label}>New password</Text>
              <View style={styles.inputWrap}>
                <Lock size={20} color={COLORS.gray} style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.gray}
                  secureTextEntry={!showPw}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPw(!showPw)} hitSlop={8}>
                  {showPw ? <EyeOff size={20} color={COLORS.gray} /> : <Eye size={20} color={COLORS.gray} />}
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Confirm password</Text>
              <View style={styles.inputWrap}>
                <Lock size={20} color={COLORS.gray} style={{ marginRight: 10 }} />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  placeholderTextColor={COLORS.gray}
                  secureTextEntry={!showPw}
                  value={confirm}
                  onChangeText={setConfirm}
                  autoCapitalize="none"
                />
                {confirm.length > 0 && password === confirm && <Check size={20} color="#4CAF50" />}
              </View>

              <TouchableOpacity
                style={[styles.ctaBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                  {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.ctaText}>Update Password</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20, alignSelf: "center",
    backgroundColor: "#E0F7FA", alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  heading: { fontSize: 26, fontWeight: "700", color: COLORS.dark, textAlign: "center" },
  sub: { fontSize: 15, color: COLORS.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 8, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: "500", color: COLORS.textSecondary, marginBottom: 8, marginTop: 20 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.white,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, height: 52,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.dark },
  ctaBtn: { borderRadius: 28, overflow: "hidden", marginTop: 28 },
  ctaGradient: { height: 56, alignItems: "center", justifyContent: "center" },
  ctaText: { fontSize: 17, fontWeight: "700", color: COLORS.white },
});

import { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Building2, CheckCircle2, AlertCircle } from "lucide-react-native";
import { supabase } from "../lib/supabase";

const COLORS = {
  primary: "#00565A",
  primaryDark: "#003D40",
  dark: "#003D40",
  gray: "#8B989C",
  textSecondary: "#5A6A6F",
  white: "#FFFFFF",
  border: "#E5E7EB",
  green: "#059669",
  red: "#DC2626",
};

type Phase = "loading" | "joined" | "mismatch" | "invalid";

/**
 * Company-invite landing (deep link `clyzio://join/<token>` /
 * `clyzio.com/join?token=…`). Validation is invited-email-only and
 * domain-agnostic. Logged-out users are sent to sign-in/up with the invited
 * email pre-filled + locked (the signup trigger then links them). Logged-in
 * users redeem the invite here via the `accept_company_invite` RPC.
 */
export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? "");

  const [phase, setPhase] = useState<Phase>("loading");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!token) { setPhase("invalid"); return; }
    try {
      const { data, error } = await supabase.rpc("lookup_invite_by_token", { p_token: token });
      const inv = Array.isArray(data) ? data[0] : null;
      if (error || !inv) { setPhase("invalid"); return; }
      setCompanyName(inv.company_name ?? null);
      setInvitedEmail(inv.email ?? null);
      if (inv.expired || inv.status !== "pending") { setPhase("invalid"); return; }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Sign in / sign up with the invited email pre-filled + locked; the
        // signup trigger (accept_invite_on_signup) links them on email match.
        router.replace(
          `/(auth)/login?invite=${encodeURIComponent(token)}` +
          `&email=${encodeURIComponent(inv.email ?? "")}` +
          `&company=${encodeURIComponent(inv.company_name ?? "")}` as any
        );
        return;
      }

      // Logged in → redeem now (email-locked server-side).
      const { data: res, error: rpcErr } = await supabase.rpc("accept_company_invite", { p_token: token });
      const row = Array.isArray(res) ? res[0] : null;
      if (rpcErr || !row) { setPhase("invalid"); return; }
      if (row.status === "joined") {
        setCompanyName(row.company_name ?? inv.company_name ?? null);
        setPhase("joined");
      } else if (row.status === "email_mismatch") {
        setPhase("mismatch");
      } else {
        setPhase("invalid");
      }
    } catch {
      setPhase("invalid");
    }
  }, [token, router]);

  useEffect(() => { run(); }, [run]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          {phase === "joined" ? <CheckCircle2 size={40} color={COLORS.green} />
            : phase === "loading" ? <Building2 size={40} color={COLORS.primary} />
            : <AlertCircle size={40} color={COLORS.red} />}
        </View>

        {phase === "loading" && (
          <>
            <Text style={styles.heading}>Joining{companyName ? ` ${companyName}` : ""}…</Text>
            <View style={{ alignItems: "center", marginTop: 24 }}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          </>
        )}

        {phase === "joined" && (
          <>
            <Text style={styles.heading}>You're in! 🌱</Text>
            <Text style={styles.sub}>
              You've joined {companyName ?? "your company"}'s eco team. Your commutes now
              count toward their sustainability goals.
            </Text>
            <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace("/(tabs)")} activeOpacity={0.85}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <Text style={styles.ctaText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {phase === "mismatch" && (
          <>
            <Text style={styles.heading}>Wrong account</Text>
            <Text style={styles.sub}>
              This invite was sent to {invitedEmail ?? "a different email"}. Sign in with
              that email to accept it.
            </Text>
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={async () => { await supabase.auth.signOut(); router.replace("/(auth)/login"); }}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <Text style={styles.ctaText}>Switch account</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {phase === "invalid" && (
          <>
            <Text style={styles.heading}>Invite unavailable</Text>
            <Text style={styles.sub}>
              This invite link is invalid, has expired, or was already used. Ask your
              admin to send a new one.
            </Text>
            <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace("/(tabs)")} activeOpacity={0.85}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGradient}>
                <Text style={styles.ctaText}>Continue to app</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40, justifyContent: "center" },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20, alignSelf: "center",
    backgroundColor: "#E6F1F2", alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  heading: { fontSize: 26, fontWeight: "700", color: COLORS.dark, textAlign: "center" },
  sub: { fontSize: 15, color: COLORS.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 10 },
  ctaBtn: { borderRadius: 28, overflow: "hidden", marginTop: 28 },
  ctaGradient: { height: 56, alignItems: "center", justifyContent: "center" },
  ctaText: { fontSize: 17, fontWeight: "700", color: COLORS.white },
});

import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, Share, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "../lib/supabase";
import { buildWebLink } from "../lib/deepLinks";
import { REFERRAL_XP } from "../lib/gamification";
import { editorial } from "../lib/theme/tokens";
import { Eyebrow, Pill, Picto } from "./ui/editorial";

/**
 * Persistent "bring a colleague" nudge for the Impact screen.
 *
 * Always rendered (no permanent dismiss) so it keeps reminding even users
 * who already know — that's the point. Uses the existing referral_code +
 * invite deep link; the +250 XP is granted server-side by the
 * award_referral_on_first_trip trigger when the invitee takes their first
 * trip. Presentational + a Share action only — no gamification logic here.
 */
export default function InviteColleagueCard() {
  const [code, setCode] = useState<string | null>(null);
  const [joined, setJoined] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("referral_code")
          .eq("id", user.id)
          .single();

        const { count } = await supabase
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", user.id)
          .eq("status", "completed");

        if (!active) return;
        setCode(profile?.referral_code ?? null);
        setJoined(count ?? 0);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleInvite = useCallback(async () => {
    if (!code) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = buildWebLink({ type: "invite", code });
    try {
      await Share.share({
        message: `Join me on Clyzio — let's share commutes and cut CO₂ together. ${url}`,
        url,
      });
    } catch {
      /* user dismissed the share sheet — non-fatal */
    }
  }, [code]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Picto kind="carpool" size={20} color={editorial.teal} stroke={1.6} />
        </View>
        <View style={{ flex: 1 }}>
          <Eyebrow color="rgba(255,255,255,0.7)">Grow the movement</Eyebrow>
          <Text style={styles.title}>Bring a colleague</Text>
        </View>
        <Pill tone="cyan">+{REFERRAL_XP} XP</Pill>
      </View>

      <Text style={styles.body}>
        When they take their first trip, you get{" "}
        <Text style={styles.bodyStrong}>{REFERRAL_XP} XP</Text> — a head start
        on your next level.
      </Text>

      <Pressable
        style={styles.cta}
        onPress={handleInvite}
        disabled={loading || !code}
        accessibilityRole="button"
        accessibilityLabel="Invite a colleague"
      >
        {loading ? (
          <ActivityIndicator size="small" color={editorial.ink} />
        ) : (
          <>
            <Picto kind="arrow" size={16} color={editorial.ink} stroke={2} />
            <Text style={styles.ctaText}>Invite a colleague</Text>
          </>
        )}
      </Pressable>

      {joined > 0 && (
        <Text style={styles.footer}>
          {joined} joined so far · +{joined * REFERRAL_XP} XP earned
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: editorial.ink,
    borderRadius: 26,
    padding: 20,
    marginBottom: 16,
    shadowColor: editorial.ink,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: editorial.cyanFog,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: editorial.fonts.serif,
    fontSize: 22,
    color: editorial.paper,
    marginTop: 2,
  },
  body: {
    fontFamily: editorial.fonts.serif,
    fontSize: 16,
    lineHeight: 21,
    color: "rgba(255,255,255,0.78)",
    marginBottom: 16,
  },
  bodyStrong: {
    fontFamily: editorial.fonts.serifItalic,
    color: editorial.cyan,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: editorial.cyan,
    borderRadius: 999,
    paddingVertical: 15,
  },
  ctaText: {
    fontFamily: editorial.fonts.mono,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: editorial.ink,
  },
  footer: {
    fontFamily: editorial.fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 12,
  },
});

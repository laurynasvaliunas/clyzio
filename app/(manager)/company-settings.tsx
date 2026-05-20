import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Globe } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../contexts/ThemeContext";
import { getPalette, brand, spacing } from "../../lib/theme/tokens";
import { Text } from "../../components/ui";
import { useToast } from "../../contexts/ToastContext";

/**
 * Admin (is_manager) screen for company-level toggles. Backed by the
 * `companies` row that the signed-in user manages. RLS (Managers can
 * update own company) makes the update safe for any caller.
 */
export default function CompanySettingsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [crossOrg, setCrossOrg] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();
        if (!profile?.company_id) return;

        setCompanyId(profile.company_id);

        const { data: company } = await supabase
          .from("companies")
          .select("name, allow_cross_org_visibility")
          .eq("id", profile.company_id)
          .single();

        if (company) {
          setCompanyName(company.name ?? "");
          setCrossOrg(Boolean((company as any).allow_cross_org_visibility));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const onToggleCrossOrg = useCallback(
    async (value: boolean) => {
      if (!companyId) return;
      // Optimistic update so the Switch tracks the press immediately.
      const prev = crossOrg;
      setCrossOrg(value);
      setSaving(true);
      const { error } = await supabase
        .from("companies")
        .update({ allow_cross_org_visibility: value })
        .eq("id", companyId);
      setSaving(false);
      if (error) {
        setCrossOrg(prev);
        showToast({
          title: "Couldn't update",
          message: error.message,
          type: "error",
        });
        return;
      }
      showToast({
        title: "Saved",
        message: value
          ? "Cross-organization carpool visibility is ON."
          : "Cross-organization carpool visibility is OFF.",
        type: "success",
      });
    },
    [companyId, crossOrg, showToast],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
      <View
        style={[
          styles.header,
          { borderBottomColor: p.border, backgroundColor: p.surface },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <ChevronLeft size={24} color={p.text} />
        </TouchableOpacity>
        <Text variant="heading">Company settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color={brand.primary} />
          </View>
        ) : !companyId ? (
          <Text tone="secondary">
            You're not assigned to a company yet, so there's nothing to manage
            here.
          </Text>
        ) : (
          <>
            {companyName ? (
              <Text tone="secondary" style={{ marginBottom: spacing[3] }}>
                Managing {companyName}
              </Text>
            ) : null}

            <View
              style={[
                styles.card,
                { backgroundColor: p.surface, borderColor: p.border },
              ]}
            >
              <View style={styles.iconCircle}>
                <Globe size={20} color={brand.primary} />
              </View>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text variant="bodyStrong">
                  Allow cross-organization carpool visibility
                </Text>
                <Text tone="secondary" style={{ marginTop: 4 }}>
                  When ON, your employees can be matched with solo users and
                  with employees of other companies that have also enabled
                  this. Same-company carpooling is always available.
                </Text>
              </View>
              <Switch
                value={crossOrg}
                onValueChange={onToggleCrossOrg}
                disabled={saving}
                trackColor={{ false: p.border, true: brand.primary + "88" }}
                thumbColor={crossOrg ? brand.primary : p.surface2}
              />
            </View>

            <Text tone="muted" style={{ marginTop: spacing[3], fontSize: 12 }}>
              Individual employees can still hide themselves from cross-org
              matches by turning off "Visible on map" in their profile.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: brand.primary + "1A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
});

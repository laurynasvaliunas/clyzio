import { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Camera, User, ArrowRight } from "lucide-react-native";

import { supabase } from "../../lib/supabase";
import { useToast } from "../../contexts/ToastContext";
import SetupProgress from "../../components/SetupProgress";

/**
 * Stage 1.0 — "Tell us about you."
 *
 * First screen of the first-run setup chain (before Places). Signup only
 * collects email + password, so without this step `profiles.first_name`
 * stays NULL — and carpool match cards, leaderboards, and manager views
 * all show a faceless "Passenger"/"Driver". Collects:
 *   - first name (required) + last name (optional) → profiles
 *   - optional profile photo → avatars storage bucket (same path as
 *     settings/edit-profile: <uid>/avatar.<ext>, upsert)
 *
 * Prefills from the profile when values already exist (e.g. company-invited
 * users whose name came with the invite) so resuming mid-setup is one tap.
 * On Next → /setup/places.
 */

const COLORS = {
  bg: "#F1EDE4",         // paper
  surface: "#FAF7EF",    // ivory
  ink: "#0B1A1F",
  inkSoft: "#5A6A6F",
  primary: "#26C6DA",
  primaryDark: "#003D40",
  border: "#E8E3D7",
  avatarBg: "#EAF6F8",
};

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Prefill from the existing profile (invited users may already have a name).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/(auth)/login" as any);
          return;
        }
        if (cancelled) return;
        setUserId(user.id);
        const { data } = await supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled || !data) return;
        if (data.first_name) setFirstName(data.first_name);
        if (data.last_name) setLastName(data.last_name);
        if (data.avatar_url) setAvatarUrl(data.avatar_url);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const canProceed = useMemo(() => firstName.trim().length > 0, [firstName]);

  // Photo pick + upload — mirrors settings/edit-profile (avatars bucket,
  // <uid>/avatar.<ext>, upsert, blob fallback for platforms where FormData
  // uploads fail).
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showToast({ title: "Permission Required", message: "Please allow access to your photo library.", type: "warning" });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      uploadAvatar(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!userId) return;
    setUploading(true);
    try {
      const fileExt = uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${userId}/avatar.${fileExt}`;

      const formData = new FormData();
      formData.append("file", { uri, name: fileName, type: `image/${fileExt}` } as any);

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, formData, { upsert: true, contentType: `image/${fileExt}` });

      if (uploadError) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const { error: blobError } = await supabase.storage
          .from("avatars")
          .upload(fileName, blob, { upsert: true, contentType: `image/${fileExt}` });
        if (blobError) throw blobError;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const url = urlData.publicUrl + `?t=${Date.now()}`;
      setAvatarUrl(url);
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
    } catch (error: any) {
      showToast({ title: "Upload Failed", message: error?.message ?? "Please try again.", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleNext = async () => {
    if (!canProceed || !userId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
        })
        .eq("id", userId);
      if (error) throw error;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      router.push("/setup/places" as any);
    } catch (err: any) {
      showToast({ title: "Couldn't save", message: err?.message ?? "Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <SetupProgress current={0} total={4} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.heading} accessibilityRole="header">
              Tell us about you
            </Text>
            <Text style={styles.subheading}>
              This is how carpool partners and colleagues will see you.
            </Text>
          </View>

          {/* Optional photo */}
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={pickImage}
            disabled={uploading || loading}
            accessibilityRole="button"
            accessibilityLabel={avatarUrl ? "Change profile photo" : "Add profile photo (optional)"}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={40} color={COLORS.inkSoft} />
              </View>
            )}
            <View style={styles.avatarBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color={COLORS.surface} />
              ) : (
                <Camera size={14} color={COLORS.surface} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Add a photo (optional)</Text>

          <View style={styles.fields}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="e.g. Laura"
                placeholderTextColor={COLORS.inkSoft}
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="next"
                editable={!loading}
                accessibilityLabel="First name (required)"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Last name <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="e.g. Kazlauskaitė"
                placeholderTextColor={COLORS.inkSoft}
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
                returnKeyType="done"
                editable={!loading}
                onSubmitEditing={handleNext}
                accessibilityLabel="Last name (optional)"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cta, !canProceed && styles.ctaDisabled]}
            onPress={handleNext}
            disabled={!canProceed || saving || loading}
            accessibilityRole="button"
            accessibilityLabel="Continue to places setup"
          >
            {saving ? (
              <ActivityIndicator color={COLORS.surface} />
            ) : (
              <>
                <Text style={styles.ctaText}>Next</Text>
                <ArrowRight size={18} color={COLORS.surface} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 24, alignItems: "center" },
  header: { alignSelf: "stretch", marginBottom: 28 },
  heading: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.ink,
    textAlign: "center",
  },
  subheading: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.inkSoft,
    textAlign: "center",
  },
  avatarWrap: { width: 108, height: 108 },
  avatarImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  avatarPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: COLORS.avatarBg,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.bg,
  },
  avatarHint: { marginTop: 10, marginBottom: 28, fontSize: 13, color: COLORS.inkSoft },
  fields: { alignSelf: "stretch", gap: 16 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: COLORS.ink },
  optional: { fontWeight: "400", color: COLORS.inkSoft },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 16,
    color: COLORS.ink,
  },
  footer: { paddingHorizontal: 24, paddingBottom: 8 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primaryDark,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: COLORS.surface, fontSize: 16, fontWeight: "800" },
});

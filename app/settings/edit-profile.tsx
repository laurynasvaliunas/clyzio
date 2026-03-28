import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Camera,
  User,
  Phone,
  Car,
  Palette,
  CreditCard,
  Save,
  Building2,
  MapPin,
  Briefcase,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import AddressInput from "../../components/AddressInput";
import { useToast } from "../../contexts/ToastContext";

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
  grayLight: "#F1F5F9",
};

interface ProfileData {
  first_name: string;
  last_name: string;
  phone: string;
  department: string;
  avatar_url: string | null;
  car_make: string;
  car_model: string;
  car_color: string;
  car_plate: string;
  home_address: string;
  home_lat: number | null;
  home_long: number | null;
  work_address: string;
  work_lat: number | null;
  work_long: number | null;
  is_public: boolean;
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData>({
    first_name: "",
    last_name: "",
    phone: "",
    department: "",
    avatar_url: null,
    car_make: "",
    car_model: "",
    car_color: "",
    car_plate: "",
    home_address: "",
    home_lat: null,
    home_long: null,
    work_address: "",
    work_lat: null,
    work_long: null,
    is_public: false,
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }
      setUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone, department, avatar_url, car_make, car_model, car_color, car_plate, home_address, home_lat, home_long, work_address, work_lat, work_long, is_public")
        .eq("id", user.id)
        .single();

      if (data) {
        setProfile({
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          phone: data.phone || "",
          department: data.department || "",
          avatar_url: data.avatar_url,
          car_make: data.car_make || "",
          car_model: data.car_model || "",
          car_color: data.car_color || "",
          car_plate: data.car_plate || "",
          home_address: data.home_address || "",
          home_lat: data.home_lat ?? null,
          home_long: data.home_long ?? null,
          work_address: data.work_address || "",
          work_lat: data.work_lat ?? null,
          work_long: data.work_long ?? null,
          is_public: data.is_public ?? false,
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showToast({ title: 'Permission Required', message: 'Please allow access to your photo library.', type: 'warning' });
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

      // Create form data
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: fileName,
        type: `image/${fileExt}`,
      } as any);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, formData, {
          upsert: true,
          contentType: `image/${fileExt}`,
        });

      if (uploadError) {
        // Try alternative upload method
        const response = await fetch(uri);
        const blob = await response.blob();
        
        const { error: blobError } = await supabase.storage
          .from("avatars")
          .upload(fileName, blob, {
            upsert: true,
            contentType: `image/${fileExt}`,
          });
        
        if (blobError) throw blobError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`;

      // Update profile
      setProfile({ ...profile, avatar_url: avatarUrl });

      // Save to database
      await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId);

      showToast({ title: 'Photo Updated', message: 'Your avatar has been saved.', type: 'success' });
    } catch (error: any) {
      console.error("Upload error:", error);
      showToast({ title: 'Upload Failed', message: error.message, type: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          department: profile.department,
          car_make: profile.car_make,
          car_model: profile.car_model,
          car_color: profile.car_color,
          car_plate: profile.car_plate,
          home_address: profile.home_address || null,
          home_lat: profile.home_lat,
          home_long: profile.home_long,
          work_address: profile.work_address || null,
          work_lat: profile.work_lat,
          work_long: profile.work_long,
          is_public: profile.is_public,
        })
        .eq("id", userId);

      if (error) throw error;

      showToast({ title: 'Saved!', message: 'Your profile has been updated.', type: 'success' });
      router.back();
    } catch (error: any) {
      showToast({ title: 'Error', message: error.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof ProfileData, value: string) => {
    setProfile({ ...profile, [field]: value });
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={pickImage} disabled={uploading}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.avatarPlaceholder}>
                <User size={40} color={COLORS.white} />
              </LinearGradient>
            )}
            <View style={styles.cameraButton}>
              {uploading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Camera size={18} color={COLORS.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        {/* Personal Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <User size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Personal Details</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First Name</Text>
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor={COLORS.gray}
              value={profile.first_name}
              onChangeText={(v) => updateField("first_name", v)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Last Name</Text>
            <TextInput
              style={styles.input}
              placeholder=""
              placeholderTextColor={COLORS.gray}
              value={profile.last_name}
              onChangeText={(v) => updateField("last_name", v)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Phone</Text>
            <View style={styles.inputWithIcon}>
              <Phone size={18} color={COLORS.gray} />
              <TextInput
                style={styles.inputInner}
                placeholder=""
                placeholderTextColor={COLORS.gray}
                keyboardType="phone-pad"
                value={profile.phone}
                onChangeText={(v) => updateField("phone", v)}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Department</Text>
            <View style={styles.inputWithIcon}>
              <Building2 size={18} color={COLORS.gray} />
              <TextInput
                style={styles.inputInner}
                placeholder=""
                placeholderTextColor={COLORS.gray}
                value={profile.department}
                onChangeText={(v) => updateField("department", v)}
              />
            </View>
          </View>
        </View>

        {/* Vehicle Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Car size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>My Green Vehicle</Text>
          </View>
          <Text style={styles.sectionSubtitle}>For drivers offering rides</Text>

          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Make</Text>
              <TextInput
                style={styles.input}
                placeholder=""
                placeholderTextColor={COLORS.gray}
                value={profile.car_make}
                onChangeText={(v) => updateField("car_make", v)}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Model</Text>
              <TextInput
                style={styles.input}
                placeholder=""
                placeholderTextColor={COLORS.gray}
                value={profile.car_model}
                onChangeText={(v) => updateField("car_model", v)}
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Color</Text>
              <View style={styles.inputWithIcon}>
                <Palette size={18} color={COLORS.gray} />
                <TextInput
                  style={styles.inputInner}
                  placeholder=""
                  placeholderTextColor={COLORS.gray}
                  value={profile.car_color}
                  onChangeText={(v) => updateField("car_color", v)}
                />
              </View>
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Plate</Text>
              <View style={styles.inputWithIcon}>
                <CreditCard size={18} color={COLORS.gray} />
                <TextInput
                  style={styles.inputInner}
                  placeholder=""
                  placeholderTextColor={COLORS.gray}
                  autoCapitalize="characters"
                  value={profile.car_plate}
                  onChangeText={(v) => updateField("car_plate", v)}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Commute Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MapPin size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Commute Details</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Used by your AI Commute Coach to suggest personalised green routes
          </Text>

          <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Home Address</Text>
          <View style={{ zIndex: 200, marginBottom: 16 }}>
            <AddressInput
              placeholder={profile.home_address || "Enter your home address"}
              value={profile.home_address}
              icon={<MapPin size={16} color={COLORS.gray} />}
              zIndex={200}
              onPress={(_, details) => {
                if (details?.geometry?.location) {
                  setProfile((prev) => ({
                    ...prev,
                    home_address: details.formatted_address || _.description,
                    home_lat: details.geometry.location.lat,
                    home_long: details.geometry.location.lng,
                  }));
                }
              }}
              onClear={() =>
                setProfile((prev) => ({
                  ...prev,
                  home_address: "",
                  home_lat: null,
                  home_long: null,
                }))
              }
              showClearButton
            />
          </View>

          <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Work Address</Text>
          <View style={{ zIndex: 100, marginBottom: 4 }}>
            <AddressInput
              placeholder={profile.work_address || "Enter your office address"}
              value={profile.work_address}
              icon={<Briefcase size={16} color={COLORS.gray} />}
              zIndex={100}
              onPress={(_, details) => {
                if (details?.geometry?.location) {
                  setProfile((prev) => ({
                    ...prev,
                    work_address: details.formatted_address || _.description,
                    work_lat: details.geometry.location.lat,
                    work_long: details.geometry.location.lng,
                  }));
                }
              }}
              onClear={() =>
                setProfile((prev) => ({
                  ...prev,
                  work_address: "",
                  work_lat: null,
                  work_long: null,
                }))
              }
              showClearButton
            />
          </View>
        </View>

        {/* Map Visibility Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Visible on map</Text>
              <Text style={styles.toggleSub}>Others can see your commute activity and offer carpools</Text>
            </View>
            <Switch
              value={profile.is_public}
              onValueChange={(val) => setProfile((prev) => ({ ...prev, is_public: val }))}
              trackColor={{ false: COLORS.grayLight, true: COLORS.primary + "80" }}
              thumbColor={profile.is_public ? COLORS.primary : COLORS.gray}
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveProfile}
          disabled={saving}
        >
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.saveGradient}>
            {saving ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Save size={20} color={COLORS.white} />
                <Text style={styles.saveText}>Save Changes</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  scroll: { flex: 1, paddingHorizontal: 16 },
  avatarSection: { alignItems: "center", paddingVertical: 24 },
  avatarWrapper: { position: "relative" },
  avatar: { width: 120, height: 120, borderRadius: 40 },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  cameraButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  avatarHint: { fontSize: 13, color: COLORS.gray, marginTop: 12 },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.dark },
  sectionSubtitle: { fontSize: 12, color: COLORS.gray, marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 8, fontWeight: "500" },
  input: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.dark,
  },
  inputWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.grayLight,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  inputInner: {
    flex: 1,
    fontSize: 15,
    color: COLORS.dark,
    padding: 0,
  },
  inputRow: { flexDirection: "row", gap: 12 },
  saveButton: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
  saveButtonDisabled: { opacity: 0.7 },
  saveGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 10,
  },
  saveText: { color: COLORS.white, fontSize: 17, fontWeight: "bold" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  toggleLabel: { fontSize: 15, fontWeight: "600", color: COLORS.dark, marginBottom: 2 },
  toggleSub: { fontSize: 12, color: COLORS.gray, lineHeight: 16 },
});


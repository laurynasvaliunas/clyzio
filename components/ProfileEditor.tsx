import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import {
  Camera,
  User,
  Phone,
  Car,
  Save,
  Building2,
  MapPin,
  Briefcase,
  ShieldCheck,
} from "lucide-react-native";
import { supabase } from "../lib/supabase";
import AddressInput from "./AddressInput";
import { useToast } from "../contexts/ToastContext";
import { deriveProfileCarFields, getPrimaryVehicle } from "../lib/commuteUtils";
import { Vehicle, parseVehicles, makeVehicle } from "../lib/vehicles";
import GarageEditor from "./GarageEditor";

/**
 * ProfileEditor — the full profile editing experience (avatar, personal
 * details, garage, commute addresses, privacy toggles, save), extracted from
 * app/settings/edit-profile.tsx so it can be BOTH:
 *   - the primary content of the Profile tab (embedded, no route chrome), and
 *   - the /settings/edit-profile route (thin wrapper adds header + scroll).
 *
 * Renders WITHOUT its own ScrollView — the parent supplies one (the Profile
 * tab already scrolls; nesting ScrollViews breaks the address dropdowns).
 * Logic is verbatim from the original screen; only navigation left the
 * component: `onSaved` fires after a successful save so each host decides
 * where to go (settings route: back / setup → Map; tab: stay put).
 */

// Brand Colors
const COLORS = {
  textMuted: "#5A6A6F",   // WCAG-AA muted text (#8B989C is 2.97:1 on white)
  primary: "#00565A",
  primaryDark: "#003D40",
  accent: "#F59E0B",
  dark: "#003D40",
  light: "#E6F1F2",
  background: "#F7F9FA",
  white: "#FFFFFF",
  gray: "#8B989C",
  inkSoft: "#5A6A6F",
  grayLight: "#EDF1F2",
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
  car_fuel_type: string;
  home_address: string;
  home_lat: number | null;
  home_long: number | null;
  work_address: string;
  work_lat: number | null;
  work_long: number | null;
  is_public: boolean;
  share_pickup_address: boolean;
  vehicles: Vehicle[];
  primary_vehicle_id: string | null;
}

export interface ProfileEditorProps {
  /** First-run mode: saving also flips profiles.commute_setup_done. */
  setupMode?: boolean;
  /** Called after a successful save (host decides navigation). */
  onSaved?: () => void;
  /**
   * Extra host-owned sections rendered directly above the Save button, so the
   * screen has exactly ONE save action. The Profile tab injects its weekly
   * commute-mix / baseline UI here.
   */
  extraSections?: React.ReactNode;
  /**
   * Persisted as part of the same Save. Runs after the profile row update
   * succeeds; throwing surfaces the error and keeps the toast honest.
   */
  onExtraSave?: () => Promise<void>;
  /** Overrides the save button label. */
  saveLabel?: string;
}

export default function ProfileEditor({
  setupMode = false,
  onSaved,
  extraSections,
  onExtraSave,
  saveLabel,
}: ProfileEditorProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // DATA-LOSS GUARD: if the profile read fails (offline, RLS hiccup, schema
  // drift) the form would otherwise render as empty strings and a Save would
  // null out the user's real first_name / phone / department / car / home /
  // work columns. We only ever allow a save after a confirmed successful load.
  const [loadFailed, setLoadFailed] = useState(false);
  const loadedOnceRef = useRef(false);
  // True once we've confirmed the prod schema has the garage / address-privacy
  // columns (migration 20260520_014). Until then, save omits those keys so the
  // update doesn't fail against a pre-migration database.
  const hasGarageColsRef = useRef<boolean>(false);
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
    car_fuel_type: "",
    home_address: "",
    home_lat: null,
    home_long: null,
    work_address: "",
    work_lat: null,
    work_long: null,
    is_public: false,
    share_pickup_address: true,
    vehicles: [],
    primary_vehicle_id: null,
  });

  // Reload whenever the host screen regains focus. The Profile tab never
  // unmounts, so without this an edit made in /settings/edit-profile would be
  // overwritten by this component's stale copy on the next Save.
  useFocusEffect(
    useCallback(() => {
      loadProfile();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }
      setUserId(user.id);

      // Pre-submission resilience: if the prod Supabase project hasn't had the
      // garage/privacy migration (20260520_014) applied yet, the new columns
      // don't exist and the full select errors. Fall back to the legacy
      // columns so the editor still loads the user's real data.
      const LEGACY_COLUMNS =
        "first_name, last_name, phone, department, avatar_url, car_make, car_model, car_color, car_plate, car_fuel_type, home_address, home_lat, home_long, work_address, work_lat, work_long, is_public";
      const FULL_COLUMNS =
        LEGACY_COLUMNS + ", share_pickup_address, vehicles, primary_vehicle_id";

      let resp = await supabase
        .from("profiles")
        .select(FULL_COLUMNS)
        .eq("id", user.id)
        .maybeSingle();

      // Only retry on "column does not exist" (42703). Previously ANY error
      // (offline, RLS, timeout) was treated as "schema is old", which silently
      // downgraded the save path and dropped the garage columns.
      if (resp.error?.code === "42703") {
        hasGarageColsRef.current = false;
        resp = await supabase
          .from("profiles")
          .select(LEGACY_COLUMNS)
          .eq("id", user.id)
          .maybeSingle();
      } else if (!resp.error) {
        hasGarageColsRef.current = true;
      }

      if (resp.error || !resp.data) {
        // Real failure (or no row): do NOT show an empty form that a Save
        // would flush to the database.
        setLoadFailed(true);
        return;
      }

      // Cast: select() with a dynamic column string can't be statically typed
      // by the supabase client; we validate fields defensively below.
      const data = resp.data as any;

      if (data) {
        // Garage: prefer stored vehicles; otherwise synthesize one from the
        // legacy flat car_* columns so existing users see their car.
        let vehicles = parseVehicles((data as any).vehicles);
        let primaryId: string | null = (data as any).primary_vehicle_id ?? null;
        if (vehicles.length === 0 && (data.car_make || data.car_model)) {
          const legacy: Vehicle = {
            ...makeVehicle("car"),
            make: data.car_make || "",
            model: data.car_model || "",
            color: data.car_color || "",
            plate: data.car_plate || "",
            fuel_type: data.car_fuel_type || "petrol",
          };
          vehicles = [legacy];
          primaryId = legacy.id;
        }
        if (vehicles.length > 0 && !vehicles.some((v) => v.id === primaryId)) {
          primaryId = vehicles[0].id;
        }

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
          car_fuel_type: data.car_fuel_type || "",
          home_address: data.home_address || "",
          home_lat: data.home_lat ?? null,
          home_long: data.home_long ?? null,
          work_address: data.work_address || "",
          work_lat: data.work_lat ?? null,
          work_long: data.work_long ?? null,
          is_public: data.is_public ?? false,
          share_pickup_address: (data as any).share_pickup_address ?? true,
          vehicles,
          primary_vehicle_id: primaryId,
        });
        loadedOnceRef.current = true;
        setLoadFailed(false);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const retryLoad = () => {
    setLoading(true);
    setLoadFailed(false);
    loadProfile();
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

  // Per-vehicle Save from the Garage: persist the garage immediately (and keep
  // the synced car_* fields in step) so a saved vehicle isn't lost if the user
  // leaves before tapping the screen-level Save. Throws on error so the
  // GarageEditor keeps the card expanded for a retry.
  //
  // NOTE: `baseline_co2` is deliberately NOT written here. The Profile
  // commute-mix screen owns that column (it's a weighted per-km factor across
  // weekly modes incl. WFH), and overwriting it with a fuel-only number would
  // silently clobber the user's real baseline.
  const persistGarage = async (
    vehicles: Vehicle[],
    primaryVehicleId: string | null,
  ) => {
    setProfile((prev) => ({ ...prev, vehicles, primary_vehicle_id: primaryVehicleId }));
    if (!userId) return;

    const primary = getPrimaryVehicle(vehicles, primaryVehicleId);
    const derived = deriveProfileCarFields(primary);

    const { error } = await supabase
      .from("profiles")
      .update({
        vehicles,
        primary_vehicle_id: primary?.id ?? null,
        car_make: derived.car_make,
        car_model: derived.car_model,
        car_color: derived.car_color,
        car_plate: derived.car_plate,
        car_fuel_type: derived.car_fuel_type,
      })
      .eq("id", userId);

    if (error) {
      showToast({ title: "Couldn't save", message: error.message, type: "error" });
      throw error;
    }
    showToast({ title: "Vehicle saved", message: "Your garage is up to date.", type: "success" });
  };

  const saveProfile = async () => {
    if (!userId) return;
    // DATA-LOSS GUARD: never write a form we never successfully populated —
    // that would null out the user's real values.
    if (!loadedOnceRef.current || loadFailed) {
      showToast({
        title: "Can't save yet",
        message: "Your profile hasn't loaded. Pull to retry, then save.",
        type: "warning",
      });
      return;
    }
    setSaving(true);

    try {
      // Keep the legacy flat car_* columns synced from the primary garage
      // vehicle so TripPlanner / useTripStore / ai-planner / the
      // ai-commute-planner edge fn keep working with no changes.
      //
      // NOTE: `baseline_co2` is deliberately NOT written here. The Profile
      // commute-mix section owns it (weighted per-km factor across weekly
      // modes incl. WFH).
      const primary = getPrimaryVehicle(profile.vehicles, profile.primary_vehicle_id);
      const derived = deriveProfileCarFields(primary);

      // Always-safe legacy payload (works against any deployed schema).
      const payload: Record<string, unknown> = {
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        department: profile.department,
        car_make: derived.car_make,
        car_model: derived.car_model,
        car_color: derived.car_color,
        car_plate: derived.car_plate,
        car_fuel_type: derived.car_fuel_type,
        home_address: profile.home_address || null,
        home_lat: profile.home_lat,
        home_long: profile.home_long,
        work_address: profile.work_address || null,
        work_lat: profile.work_lat,
        work_long: profile.work_long,
        is_public: profile.is_public,
      };

      // Only include the new garage/privacy columns when the schema has them
      // (migration 20260520_014 applied).
      if (hasGarageColsRef.current) {
        payload.vehicles = profile.vehicles;
        payload.primary_vehicle_id = primary?.id ?? null;
        payload.share_pickup_address = profile.share_pickup_address;
      }

      // First-run gate: when finishing setup mode, also flip
      // `commute_setup_done = true` so `nextRouteAfterAuth` stops gating the
      // user on subsequent launches.
      if (setupMode) {
        (payload as Record<string, unknown>).commute_setup_done = true;
      }

      const { error } = await supabase
        .from("profiles")
        .update(payload as never)
        .eq("id", userId);

      if (error) throw error;

      // Host-owned extras (e.g. the Profile tab's weekly commute mix +
      // baseline) persist as part of the same Save, so the screen has one
      // button and one success state.
      await onExtraSave?.();

      showToast({ title: 'Saved!', message: 'Your profile has been updated.', type: 'success' });
      onSaved?.();
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Load failed → show a retry instead of an empty form (which a Save would
  // have written over the user's real data).
  if (loadFailed) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Couldn&apos;t load your profile</Text>
        <Text style={styles.errorBody}>
          Check your connection and try again. Your saved details are safe.
        </Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={retryLoad}
          accessibilityRole="button"
          accessibilityLabel="Retry loading your profile"
        >
          <Text style={styles.retryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
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

      {/* My Garage */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Car size={18} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>My Garage</Text>
        </View>
        <Text style={styles.sectionSubtitle}>Cars, motorbikes, scooters, bikes. Add any you use.</Text>

        <GarageEditor
          vehicles={profile.vehicles}
          primaryVehicleId={profile.primary_vehicle_id}
          onChange={(vehicles, primaryVehicleId) =>
            setProfile((prev) => ({ ...prev, vehicles, primary_vehicle_id: primaryVehicleId }))
          }
          onSaveVehicle={persistGarage}
        />
      </View>

      {/* Commute Details */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MapPin size={18} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Commute Details</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Used to calculate smarter, lower-CO₂ routes for you.
        </Text>

        <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Home Address</Text>
        <View style={{ zIndex: 200, marginBottom: 16 }}>
          <AddressInput
            placeholder="Enter your home address"
            value={profile.home_address}
            icon={<MapPin size={16} color={COLORS.gray} />}
            zIndex={200}
            onChangeText={(text) =>
              setProfile((prev) => ({
                ...prev,
                home_address: text,
                // Typed text invalidates the previously-geocoded coords;
                // a fresh Mapbox selection (onPress below) will re-fill them.
                home_lat: null,
                home_long: null,
              }))
            }
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

        <View style={styles.assuranceRow}>
          <ShieldCheck size={14} color={COLORS.primary} />
          <Text style={styles.toggleSub}>Your location data stays secure and private</Text>
        </View>

        <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Work Address</Text>
        <View style={{ zIndex: 100, marginBottom: 4 }}>
          <AddressInput
            placeholder="Enter your office address"
            value={profile.work_address}
            icon={<Briefcase size={16} color={COLORS.gray} />}
            zIndex={100}
            onChangeText={(text) =>
              setProfile((prev) => ({
                ...prev,
                work_address: text,
                work_lat: null,
                work_long: null,
              }))
            }
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
            <Text style={styles.toggleLabel}>Share rides with others</Text>
            <Text style={styles.toggleSub}>Let colleagues and other Clyzio users see your planned rides on the map and offer carpools. You can turn this off anytime.</Text>
          </View>
          <Switch
            value={profile.is_public}
            onValueChange={(val) => setProfile((prev) => ({ ...prev, is_public: val }))}
            trackColor={{ false: COLORS.grayLight, true: COLORS.primary + "80" }}
            thumbColor={profile.is_public ? COLORS.primary : COLORS.gray}
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Share pickup address with drivers</Text>
            <Text style={styles.toggleSub}>Default for new ride requests. You can change it per trip.</Text>
          </View>
          <Switch
            value={profile.share_pickup_address}
            onValueChange={(val) => setProfile((prev) => ({ ...prev, share_pickup_address: val }))}
            trackColor={{ false: COLORS.grayLight, true: COLORS.primary + "80" }}
            thumbColor={profile.share_pickup_address ? COLORS.primary : COLORS.gray}
          />
        </View>
      </View>

      {/* Host-injected sections (Profile tab: weekly commute mix + baseline).
          Rendered here so everything on the screen is covered by the single
          Save below. */}
      {extraSections}

      {/* Save Button — the ONLY save action on the screen */}
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
              <Text style={styles.saveText}>{saveLabel ?? "Save Changes"}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { paddingVertical: 64, alignItems: "center", justifyContent: "center" },
  errorContainer: { paddingVertical: 56, paddingHorizontal: 8, alignItems: "center" },
  errorTitle: { fontSize: 17, fontWeight: "700", color: COLORS.dark, textAlign: "center" },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.inkSoft,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  retryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
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
  avatarHint: { fontSize: 13, color: COLORS.textMuted, marginTop: 12 },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 3,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: COLORS.dark },
  sectionSubtitle: { fontSize: 12, color: COLORS.textMuted, marginBottom: 16 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 8, fontWeight: "500" },
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
  saveButton: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
  saveButtonDisabled: { opacity: 0.7 },
  saveGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 10,
  },
  saveText: { color: COLORS.white, fontSize: 17, fontWeight: "700" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  toggleLabel: { fontSize: 15, fontWeight: "600", color: COLORS.dark, marginBottom: 2 },
  toggleSub: { fontSize: 12, color: COLORS.textMuted, lineHeight: 16 },
  assuranceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
});

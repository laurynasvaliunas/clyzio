import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Mapbox, { MapView, Camera, PointAnnotation } from "@rnmapbox/maps";
import { Home, Briefcase, X, Check, MapPin, ArrowRight } from "lucide-react-native";

import { supabase } from "../../lib/supabase";
import { MAPBOX_TOKEN, IS_MAPBOX_TOKEN_VALID } from "../../lib/config";
import { useToast } from "../../contexts/ToastContext";
import AddressInput from "../../components/AddressInput";
import SetupProgress from "../../components/SetupProgress";

if (IS_MAPBOX_TOKEN_VALID) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
}

/**
 * Stage 1.1 — "Where do you start and end your day?"
 *
 * Single Mapbox map with two pins (home + work), dual search bars below.
 * If the user has already granted location permission (permissions screen
 * runs before setup), we reverse-geocode their current location and show
 * a floating "Is this your home?" prompt; tapping Yes autofills home.
 *
 * On Next → writes addresses + lat/lng to `profiles`, then routes to
 * `/setup/garage`. The lat/lng values come from Mapbox suggestion picks
 * (canonical) or are cleared when the user types freely (matches the
 * recently-fixed AddressInput behaviour).
 */

const COLORS = {
  bg: "#F1EDE4",         // paper
  surface: "#FAF7EF",    // ivory
  ink: "#0B1A1F",
  inkSoft: "#5A6A6F",
  primary: "#26C6DA",
  primaryDark: "#003D40",
  accent: "#F2C744",
  border: "#E8E3D7",
  homePin: "#26C6DA",    // cyan
  workPin: "#5B8F5B",    // leaf
  promptBg: "#003D40",
};

const PROMPT_MIN_DISTANCE_METERS = 50; // don't prompt if we already accepted home within 50m

type Pin = { lat: number; lng: number; address: string } | null;

export default function PlacesScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const cameraRef = useRef<Camera>(null);

  const [home, setHome] = useState<Pin>(null);
  const [work, setWork] = useState<Pin>(null);
  const [detected, setDetected] = useState<Pin>(null);     // current-location reverse-geocoded
  const [promptVisible, setPromptVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  // Hide the (preview-only) map while the keyboard is up, so both address
  // fields + their autocomplete dropdowns clear the keyboard.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Detect current location on mount; reverse-geocode to a friendly address
  // and show the "Is this home?" prompt if we get a clean hit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const { latitude, longitude } = pos.coords;
        // Reverse-geocode with Mapbox so we have an address to show, not a coord.
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=address`;
        const res = await fetch(url);
        const json = await res.json();
        const feature = json.features?.[0];
        if (!feature) return;
        if (cancelled) return;
        setDetected({
          lat: latitude,
          lng: longitude,
          address: feature.place_name as string,
        });
        setPromptVisible(true);
      } catch {
        /* non-fatal — user can type addresses manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fit camera to both pins (or one, or fall back to detected location).
  const fitCamera = useCallback(() => {
    if (!cameraRef.current) return;
    const pts: Array<[number, number]> = [];
    if (home) pts.push([home.lng, home.lat]);
    if (work) pts.push([work.lng, work.lat]);
    if (pts.length === 0 && detected) pts.push([detected.lng, detected.lat]);
    if (pts.length === 0) return;

    if (pts.length === 1) {
      cameraRef.current.setCamera({
        centerCoordinate: pts[0],
        zoomLevel: 13,
        animationDuration: 600,
      });
      return;
    }
    // Two pins: compute bounds + nice padding
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    cameraRef.current.fitBounds(ne, sw, 80, 600);
  }, [home, work, detected]);

  useEffect(() => {
    fitCamera();
  }, [fitCamera]);

  const acceptDetectedAsHome = () => {
    if (!detected) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setHome({ ...detected });
    setPromptVisible(false);
  };

  const dismissPrompt = () => {
    setPromptVisible(false);
  };

  const canProceed = useMemo(
    () => !!(home?.address?.trim() && work?.address?.trim()),
    [home, work],
  );

  const handleNext = async () => {
    if (!canProceed) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast({ title: "Please sign in first", message: "We couldn't find your session.", type: "error" });
        router.replace("/(auth)/login" as any);
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          home_address: home!.address,
          home_lat: home!.lat,
          home_long: home!.lng,
          work_address: work!.address,
          work_lat: work!.lat,
          work_long: work!.lng,
        })
        .eq("id", user.id);
      if (error) throw error;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      router.push("/setup/garage" as any);
    } catch (err: any) {
      showToast({ title: "Couldn't save", message: err?.message ?? "Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // AddressInput callbacks: pick = lat/lng known; type = lat/lng wiped.
  const onHomePick = (_: any, details: any) => {
    if (!details?.geometry?.location) return;
    setHome({
      address: details.formatted_address || _.description,
      lat: details.geometry.location.lat,
      lng: details.geometry.location.lng,
    });
  };
  const onHomeText = (text: string) => {
    setHome((prev) => ({
      address: text,
      lat: prev?.lat ?? 0,
      lng: prev?.lng ?? 0,
    }));
  };

  const onWorkPick = (_: any, details: any) => {
    if (!details?.geometry?.location) return;
    setWork({
      address: details.formatted_address || _.description,
      lat: details.geometry.location.lat,
      lng: details.geometry.location.lng,
    });
  };
  const onWorkText = (text: string) => {
    setWork((prev) => ({
      address: text,
      lat: prev?.lat ?? 0,
      lng: prev?.lng ?? 0,
    }));
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <SetupProgress current={1} total={4} />

      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          Where do you start and end your day?
        </Text>
      </View>

      {/* Map — hidden while typing so the fields clear the keyboard. */}
      {!keyboardOpen && (
      <View style={styles.mapWrap}>
        {IS_MAPBOX_TOKEN_VALID ? (
          <MapView
            style={styles.map}
            styleURL={Mapbox.StyleURL.Street}
            logoEnabled={false}
            attributionEnabled={false}
            scaleBarEnabled={false}
            compassEnabled={false}
          >
            <Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: detected ? [detected.lng, detected.lat] : [25.2797, 54.6872], // Vilnius fallback
                zoomLevel: 11,
              }}
            />
            {home && home.lat !== 0 && (
              <PointAnnotation id="home-pin" coordinate={[home.lng, home.lat]}>
                <View style={[styles.pin, { backgroundColor: COLORS.homePin }]}>
                  <Home size={16} color={COLORS.surface} />
                </View>
              </PointAnnotation>
            )}
            {work && work.lat !== 0 && (
              <PointAnnotation id="work-pin" coordinate={[work.lng, work.lat]}>
                <View style={[styles.pin, { backgroundColor: COLORS.workPin }]}>
                  <Briefcase size={16} color={COLORS.surface} />
                </View>
              </PointAnnotation>
            )}
          </MapView>
        ) : (
          <View style={[styles.map, styles.mapFallback]}>
            <MapPin size={32} color={COLORS.inkSoft} />
            <Text style={styles.mapFallbackText}>Map unavailable — search to set your places.</Text>
          </View>
        )}

        {/* "Is this your home?" floating prompt */}
        {promptVisible && detected && !home && (
          <View style={styles.prompt} accessibilityRole="alert">
            <View style={styles.promptHeader}>
              <Text style={styles.promptTitle}>Is this your home?</Text>
              <TouchableOpacity
                onPress={dismissPrompt}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss home suggestion"
              >
                <X size={16} color={COLORS.surface} />
              </TouchableOpacity>
            </View>
            <Text style={styles.promptAddress} numberOfLines={2}>{detected.address}</Text>
            <View style={styles.promptActions}>
              <TouchableOpacity
                style={styles.promptDeny}
                onPress={dismissPrompt}
                accessibilityRole="button"
                accessibilityLabel="No, that's not my home"
              >
                <Text style={styles.promptDenyText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.promptConfirm}
                onPress={acceptDetectedAsHome}
                accessibilityRole="button"
                accessibilityLabel="Yes, set this as my home"
              >
                <Check size={16} color={COLORS.ink} />
                <Text style={styles.promptConfirmText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      )}

      {/* Search bars */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.formWrap}
      >
        <View style={[styles.field, { zIndex: 200 }]}>
          <View style={styles.fieldLabelRow}>
            <View style={[styles.fieldDot, { backgroundColor: COLORS.homePin }]} />
            <Text style={styles.fieldLabel}>Home</Text>
          </View>
          <AddressInput
            placeholder="Search for your home address"
            value={home?.address ?? ""}
            icon={<Home size={16} color={COLORS.inkSoft} />}
            zIndex={200}
            onPress={onHomePick}
            onChangeText={onHomeText}
            onClear={() => setHome(null)}
            showClearButton
          />
        </View>

        <View style={[styles.field, { zIndex: 100 }]}>
          <View style={styles.fieldLabelRow}>
            <View style={[styles.fieldDot, { backgroundColor: COLORS.workPin }]} />
            <Text style={styles.fieldLabel}>Work</Text>
          </View>
          <AddressInput
            placeholder="Search for your office address"
            value={work?.address ?? ""}
            icon={<Briefcase size={16} color={COLORS.inkSoft} />}
            zIndex={100}
            onPress={onWorkPick}
            onChangeText={onWorkText}
            onClear={() => setWork(null)}
            showClearButton
          />
        </View>

        <Text style={styles.helper}>You can change these anytime in Settings.</Text>

        <TouchableOpacity
          style={[styles.next, !canProceed && styles.nextDisabled]}
          onPress={handleNext}
          disabled={!canProceed || saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canProceed || saving }}
          accessibilityLabel="Next, continue to garage setup"
        >
          {saving ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <>
              <Text style={styles.nextText}>Next</Text>
              <ArrowRight size={18} color={COLORS.surface} />
            </>
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  heading: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: COLORS.ink,
  },
  mapWrap: {
    height: 240,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.border,
    position: "relative",
  },
  map: { flex: 1 },
  mapFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  mapFallbackText: {
    color: COLORS.inkSoft,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: COLORS.surface,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  prompt: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: COLORS.promptBg,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  promptHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  promptTitle: {
    color: COLORS.surface,
    fontWeight: "700",
    fontSize: 15,
  },
  promptAddress: {
    color: COLORS.surface,
    opacity: 0.85,
    fontSize: 13,
    lineHeight: 18,
  },
  promptActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  promptDeny: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(250,247,239,0.12)",
  },
  promptDenyText: {
    color: COLORS.surface,
    fontWeight: "600",
    fontSize: 13,
  },
  promptConfirm: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  promptConfirmText: {
    color: COLORS.ink,
    fontWeight: "700",
    fontSize: 13,
  },
  formWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  field: {
    gap: 6,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  fieldDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.inkSoft,
    letterSpacing: 0.2,
  },
  helper: {
    fontSize: 12,
    color: COLORS.inkSoft,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  next: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.ink,
    paddingVertical: 18,
    borderRadius: 999,
    minHeight: 56,
  },
  nextDisabled: {
    opacity: 0.4,
  },
  nextText: {
    color: COLORS.surface,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});

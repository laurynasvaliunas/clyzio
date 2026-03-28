import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { User, LogOut, Save, Leaf, Check, Settings, ChevronRight, Camera } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../contexts/ThemeContext";
import { getThemeColors } from "../../lib/theme";
import { useToast } from "../../contexts/ToastContext";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  black: "#000000",
  red: "#EF4444",
  redLight: "#FEE2E2",
  transparent: "transparent",
};

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

interface TransportMode {
  id: string;
  name: string;
  co2: number;
  emoji: string;
}

const TRANSPORT_OPTIONS: TransportMode[] = [
  { id: "walking", name: "Walking", co2: 0, emoji: "🚶" },
  { id: "bike", name: "Bike/Scooter", co2: 0, emoji: "🚴" },
  { id: "ebike", name: "E-Bike/Scooter", co2: 0.023, emoji: "⚡" },
  { id: "moto_gas", name: "Motorbike", co2: 0.09, emoji: "🏍️" },
  { id: "car_gas", name: "Car (Gasoline)", co2: 0.192, emoji: "🚗" },
  { id: "car_diesel", name: "Car (Diesel)", co2: 0.171, emoji: "🚙" },
  { id: "car_hybrid", name: "Car (Hybrid)", co2: 0.12, emoji: "🔋" },
  { id: "car_hydrogen", name: "Car (Hydrogen)", co2: 0.02, emoji: "💧" },
  { id: "car_electric", name: "Car (Electric)", co2: 0.032, emoji: "⚡" },
  { id: "public", name: "Public Transport", co2: 0.04, emoji: "🚌" },
];

interface CommuteHabit {
  modeId: string;
  days: boolean[];
}

/**
 * Get eco level badge based on baseline CO2
 */
function getEcoLevel(baseline: number) {
  if (baseline === 0) return { label: "Zero Hero! 🌟", color: COLORS.accent };
  if (baseline < 0.04) return { label: "Eco Champion!", color: COLORS.accent };
  if (baseline < 0.08) return { label: "Green Warrior!", color: COLORS.primary };
  if (baseline < 0.12) return { label: "Good Progress!", color: COLORS.primary };
  return { label: "Getting Started", color: COLORS.gray };
}

/**
 * UserCard - Displays user profile card with avatar and info
 */
interface UserCardProps {
  userName: string;
  userEmail: string;
  userAvatar: string | null;
  uploading: boolean;
  onPress: () => void;
  onPickImage: () => void;
  TC: ReturnType<typeof getThemeColors>;
}

function UserCard({ userName, userEmail, userAvatar, uploading, onPress, onPickImage, TC }: UserCardProps) {
  return (
    <TouchableOpacity style={[styles.userCard, { backgroundColor: TC.surface }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.avatarContainer}>
        {userAvatar ? (
          <Image source={{ uri: userAvatar }} style={styles.userAvatar} />
        ) : (
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.userAvatarPlaceholder}>
            <User size={28} color={COLORS.white} />
          </LinearGradient>
        )}
        <TouchableOpacity
          style={styles.cameraButton}
          onPress={(e) => {
            e.stopPropagation();
            onPickImage();
          }}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Camera size={16} color={COLORS.white} />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.userInfo}>
        <Text style={[styles.userName, { color: TC.text }]}>{userName || "Set up your profile"}</Text>
        <Text style={[styles.userEmail, { color: TC.textSecondary }]}>{userEmail}</Text>
      </View>
      <ChevronRight size={20} color={TC.textSecondary} />
    </TouchableOpacity>
  );
}

/**
 * ScoreCard - Displays CO2 baseline score with glow effect
 */
interface ScoreCardProps {
  baseline: number;
  scaleAnim: Animated.Value;
  glowOpacity: Animated.AnimatedInterpolation<string | number>;
  ecoLevel: { label: string; color: string };
}

function ScoreCard({ baseline, scaleAnim, glowOpacity, ecoLevel }: ScoreCardProps) {
  return (
    <View style={styles.scoreCardContainer}>
      <Animated.View style={[styles.scoreGlow, { opacity: glowOpacity }]} />
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.scoreCard}
      >
        <Leaf size={24} color={COLORS.white} style={{ opacity: 0.8 }} />
        <Text style={styles.scoreLabel}>Your Carbon Baseline</Text>
        <Animated.Text style={[styles.scoreValue, { transform: [{ scale: scaleAnim }] }]}>
          {baseline.toFixed(3)}
        </Animated.Text>
        <Text style={styles.scoreUnit}>kg CO₂ per km</Text>
        <View style={[styles.levelBadge, { backgroundColor: ecoLevel.color }]}>
          <Text style={styles.levelText}>{ecoLevel.label}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

/**
 * ModeCard - Displays a single transport mode card
 */
interface ModeCardProps {
  mode: TransportMode;
  isSelected: boolean;
  daysCount: number;
  onPress: () => void;
  TC: ReturnType<typeof getThemeColors>;
}

function ModeCard({ mode, isSelected, daysCount, onPress, TC }: ModeCardProps) {
  const hasData = daysCount > 0;

  return (
    <TouchableOpacity
      style={[styles.modeCard, { backgroundColor: TC.surface }, isSelected && styles.modeCardSelected, hasData && !isSelected && styles.modeCardHasData]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {hasData && (
        <View style={[styles.daysBadge, isSelected && styles.daysBadgeSelected]}>
          <Text style={[styles.daysBadgeText, isSelected && styles.daysBadgeTextSelected]}>{daysCount}</Text>
        </View>
      )}
      <Text style={styles.modeEmoji}>{mode.emoji}</Text>
      <Text style={[styles.modeName, { color: TC.text }, isSelected && styles.modeNameSelected]}>{mode.name}</Text>
      <Text style={[styles.modeCo2, { color: TC.textSecondary }, isSelected && styles.modeCo2Selected]}>{mode.co2} kg</Text>
    </TouchableOpacity>
  );
}

/**
 * DaySelector - Day selection UI for a transport mode
 */
interface DaySelectorProps {
  modeName: string;
  selectedDays: boolean[];
  onToggleDay: (index: number) => void;
  TC: ReturnType<typeof getThemeColors>;
}

function DaySelector({ modeName, selectedDays, onToggleDay, TC }: DaySelectorProps) {
  return (
    <View style={[styles.daySelector, { backgroundColor: TC.surface }]}>
      <Text style={[styles.daySelectorTitle, { color: TC.text }]}>
        Tap the days you use {modeName}:
      </Text>
      <View style={styles.dayBubbles}>
        {DAYS.map((day, index) => {
          const isActive = selectedDays[index];
          return (
            <TouchableOpacity
              key={index}
              style={[styles.dayBubble, isActive && styles.dayBubbleActive]}
              onPress={() => onToggleDay(index)}
            >
              {isActive ? (
                <Check size={18} color={COLORS.white} />
              ) : (
                <Text style={styles.dayText}>{day}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/**
 * ProfileScreen - User profile and commute baseline configuration
 * Allows users to set their weekly commute habits and calculate CO2 baseline
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const TC = getThemeColors(isDark);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const [habits, setHabits] = useState<CommuteHabit[]>([]);
  const [baseline, setBaseline] = useState(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  /**
   * Animate pulse effect on baseline value
   */
  const animatePulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.08, duration: 150, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
  }, [scaleAnim]);

  /**
   * Load user profile data from Supabase
   */
  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email || "");
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("commuting_habits, baseline_co2, first_name, last_name, avatar_url")
          .eq("id", user.id)
          .single();

        if (profile) {
          if (profile.commuting_habits && Array.isArray(profile.commuting_habits)) {
            setHabits(profile.commuting_habits);
          }
          if (profile.baseline_co2) {
            setBaseline(profile.baseline_co2);
          }
          const name = profile.first_name 
            ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`
            : user.email?.split("@")[0] || "";
          setUserName(name);
          setUserAvatar(profile.avatar_url);
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Start glow animation loop on mount
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ])
    ).start();
  }, [glowAnim]);

  // Recalculate baseline and animate when habits change
  useEffect(() => {
    calculateWeightedBaseline();
    animatePulse();
  }, [habits, animatePulse]);

  /**
   * Pick and upload avatar image
   */
  const handlePickImage = useCallback(async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast({ title: 'Permission Required', message: 'Please allow access to your photo library.', type: 'warning' });
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showToast({ title: 'Error', message: 'Failed to pick image', type: 'error' });
    }
  }, [userId]);

  /**
   * Upload avatar to Supabase Storage
   */
  const uploadAvatar = useCallback(async (uri: string) => {
    if (!userId) return;
    
    setUploading(true);
    try {
      // Create file name
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${userId}/avatar.${fileExt}`;

      // Convert URI to blob
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Convert blob to ArrayBuffer for Supabase
      const arrayBuffer = await new Response(blob).arrayBuffer();

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const avatarUrl = urlData.publicUrl + `?t=${Date.now()}`;

      // Update database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Update local state
      setUserAvatar(avatarUrl);
      
      showToast({ title: 'Photo Updated', message: 'Your profile photo has been saved.', type: 'success' });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      showToast({ title: 'Upload Failed', message: error.message || 'Failed to upload photo', type: 'error' });
    } finally {
      setUploading(false);
    }
  }, [userId]);

  /**
   * Calculate weighted baseline CO2 based on habits
   */
  const calculateWeightedBaseline = useCallback(() => {
    let totalDays = 0;
    let weightedSum = 0;

    habits.forEach((habit) => {
      const mode = TRANSPORT_OPTIONS.find((m) => m.id === habit.modeId);
      if (mode) {
        const daysUsed = habit.days.filter(Boolean).length;
        totalDays += daysUsed;
        weightedSum += mode.co2 * daysUsed;
      }
    });

    setBaseline(totalDays > 0 ? weightedSum / totalDays : 0.192);
  }, [habits]);

  /**
   * Handle transport mode selection
   */
  const handleModeSelect = useCallback((modeId: string) => {
    if (selectedModeId === modeId) {
      setSelectedModeId(null);
      return;
    }
    setSelectedModeId(modeId);
    
    if (!habits.find((h) => h.modeId === modeId)) {
      setHabits([...habits, { modeId, days: [false, false, false, false, false, false, false] }]);
    }
  }, [selectedModeId, habits]);

  /**
   * Toggle day selection for a transport mode
   */
  const toggleDay = useCallback((modeId: string, dayIndex: number) => {
    setHabits((prev) => {
      const existing = prev.find((h) => h.modeId === modeId);
      if (existing) {
        return prev.map((h) =>
          h.modeId === modeId
            ? { ...h, days: h.days.map((d, i) => (i === dayIndex ? !d : d)) }
            : h
        );
      }
      const newDays = [false, false, false, false, false, false, false];
      newDays[dayIndex] = true;
      return [...prev, { modeId, days: newDays }];
    });
  }, []);

  /**
   * Get habit days for a mode
   */
  const getHabitDays = useCallback((modeId: string) => {
    return habits.find((h) => h.modeId === modeId)?.days || [false, false, false, false, false, false, false];
  }, [habits]);

  /**
   * Get count of days for a mode
   */
  const getDaysCount = useCallback((modeId: string) => {
    return getHabitDays(modeId).filter(Boolean).length;
  }, [getHabitDays]);

  /**
   * Save profile data to Supabase
   */
  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast({ title: 'Error', message: 'Please sign in first', type: 'error' });
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ commuting_habits: habits, baseline_co2: baseline })
        .eq("id", user.id);

      if (error) throw error;
      showToast({ title: 'Saved!', message: `Your baseline is ${baseline.toFixed(3)} kg/km`, type: 'success' });
    } catch (error: any) {
      showToast({ title: 'Error', message: error.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [habits, baseline]);

  /**
   * Sign out user and redirect to login
   */
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  }, [router]);

  // Memoize derived values
  const ecoLevel = useMemo(() => getEcoLevel(baseline), [baseline]);
  const glowOpacity = useMemo(() => glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }), [glowAnim]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header with Settings */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: TC.text }]}>Profile</Text>
          <TouchableOpacity
            style={[styles.settingsButton, { backgroundColor: TC.surface }]}
            onPress={() => router.push("/settings")}
          >
            <Settings size={22} color={TC.text} />
          </TouchableOpacity>
        </View>

        {/* User Card */}
        <UserCard
          userName={userName}
          userEmail={userEmail}
          userAvatar={userAvatar}
          uploading={uploading}
          onPress={() => router.push("/settings/edit-profile")}
          onPickImage={handlePickImage}
          TC={TC}
        />

        {/* Score Card */}
        <ScoreCard
          baseline={baseline}
          scaleAnim={scaleAnim}
          glowOpacity={glowOpacity}
          ecoLevel={ecoLevel}
        />

        {/* Commute Setup */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: TC.text }]}>🚀 Weekly Commute Mix</Text>
          <Text style={[styles.sectionSubtitle, { color: TC.textSecondary }]}>Select modes and tap the days you use them</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeCardsContainer}
          >
            {TRANSPORT_OPTIONS.map((mode) => (
              <ModeCard
                key={mode.id}
                mode={mode}
                isSelected={selectedModeId === mode.id}
                daysCount={getDaysCount(mode.id)}
                onPress={() => handleModeSelect(mode.id)}
                TC={TC}
              />
            ))}
          </ScrollView>

          {selectedModeId && (
            <DaySelector
              modeName={TRANSPORT_OPTIONS.find((m) => m.id === selectedModeId)?.name || ""}
              selectedDays={getHabitDays(selectedModeId)}
              onToggleDay={(index) => toggleDay(selectedModeId, index)}
              TC={TC}
            />
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveProfile}
          disabled={saving}
        >
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.saveButtonGradient}>
            {saving ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Save size={20} color={COLORS.white} />
                <Text style={styles.saveButtonText}>Save Baseline</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={18} color={COLORS.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ===== CONTAINER & SCROLL =====
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  
  // ===== HEADER =====
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 28, fontWeight: "bold", color: COLORS.dark },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  
  // ===== USER CARD =====
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 16,
    borderRadius: 20,
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarContainer: {
    position: "relative",
  },
  userAvatar: { width: 64, height: 64, borderRadius: 14 },
  userAvatarPlaceholder: { width: 64, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cameraButton: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  userInfo: { flex: 1, marginLeft: 14 },
  userName: { fontSize: 17, fontWeight: "bold", color: COLORS.dark },
  userEmail: { fontSize: 13, color: COLORS.gray, marginTop: 2 },
  
  // ===== SCORE CARD =====
  scoreCardContainer: { marginHorizontal: 16, marginBottom: 20, position: "relative" },
  scoreGlow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    bottom: -10,
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    zIndex: -1,
  },
  scoreCard: { borderRadius: 24, padding: 24, alignItems: "center" },
  scoreLabel: { fontSize: 14, color: COLORS.white, opacity: 0.9, marginTop: 8 },
  scoreValue: { fontSize: 56, fontWeight: "bold", color: COLORS.white, marginVertical: 4 },
  scoreUnit: { fontSize: 14, color: COLORS.white, opacity: 0.8 },
  levelBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 12 },
  levelText: { color: COLORS.dark, fontWeight: "bold", fontSize: 14 },
  
  // ===== COMMUTE SECTION =====
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  sectionSubtitle: { fontSize: 13, color: COLORS.gray, marginTop: 4, marginBottom: 16 },
  modeCardsContainer: { paddingVertical: 8, gap: 12 },
  
  // ===== MODE CARDS =====
  modeCard: {
    width: 100,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 14,
    alignItems: "center",
    marginRight: 12,
    shadowColor: COLORS.black,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 2,
    borderColor: COLORS.transparent,
    position: "relative",
  },
  modeCardSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryDark, shadowColor: COLORS.primary, shadowOpacity: 0.3, elevation: 8 },
  modeCardHasData: { borderColor: COLORS.primary },
  daysBadge: { position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  daysBadgeSelected: { backgroundColor: COLORS.white },
  daysBadgeText: { fontSize: 12, fontWeight: "bold", color: COLORS.white },
  daysBadgeTextSelected: { color: COLORS.primary },
  modeEmoji: { fontSize: 32, marginBottom: 8 },
  modeName: { fontSize: 13, fontWeight: "600", color: COLORS.dark },
  modeNameSelected: { color: COLORS.white },
  modeCo2: { fontSize: 11, color: COLORS.gray, marginTop: 4 },
  modeCo2Selected: { color: COLORS.white, opacity: 0.8 },
  
  // ===== DAY SELECTOR =====
  daySelector: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  daySelectorTitle: { fontSize: 14, color: COLORS.dark, marginBottom: 16, textAlign: "center" },
  dayBubbles: { flexDirection: "row", justifyContent: "center", gap: 10 },
  dayBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.transparent,
  },
  dayBubbleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryDark },
  dayText: { fontSize: 14, fontWeight: "600", color: COLORS.gray },
  
  // ===== SAVE BUTTON =====
  saveButton: { marginHorizontal: 16, marginBottom: 12, borderRadius: 28, overflow: "hidden" },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 18, gap: 10 },
  saveButtonText: { color: COLORS.white, fontSize: 17, fontWeight: "bold" },

  // ===== SIGN OUT BUTTON =====
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.transparent,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: COLORS.red,
    paddingVertical: 14,
    marginHorizontal: 16,
  },
  signOutText: { color: COLORS.red, fontSize: 15, fontWeight: "600" },
});

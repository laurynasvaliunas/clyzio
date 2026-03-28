import React, { useEffect, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Trophy, Leaf, X, Zap, TrendingUp } from "lucide-react-native";
import * as Haptics from "expo-haptics";

const COLORS = {
  primary: "#26C6DA",
  accent: "#FDD835",
  dark: "#006064",
  white: "#FFFFFF",
  green: "#4CAF50",
  black: "#000000",
  whiteTransparent15: "rgba(255, 255, 255, 0.15)",
  whiteTransparent20: "rgba(255, 255, 255, 0.2)",
  blackTransparent70: "rgba(0, 0, 0, 0.7)",
};

interface TripCompletionModalProps {
  visible: boolean;
  onClose: () => void;
  xpEarned: number;
  co2Saved: number;
  distance: number;
  leveledUp?: boolean;
  newLevel?: number;
}

/**
 * StatCard - Displays a single stat (XP or CO2) in the completion modal
 */
interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
}

function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * TripCompletionModal - Celebratory modal shown after completing a trip
 * Shows XP earned, CO2 saved, and special message if user leveled up
 */
export default function TripCompletionModal({
  visible,
  onClose,
  xpEarned,
  co2Saved,
  distance,
  leveledUp = false,
  newLevel,
}: TripCompletionModalProps) {
  // Animation references
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  /**
   * Handle modal close with haptic feedback
   */
  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  /**
   * Animation Effect
   * Triggers entrance animations when modal becomes visible
   * Resets animations when modal is hidden
   */
  useEffect(() => {
    if (visible) {
      // Trigger success haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Start entrance animations in parallel
      Animated.parallel([
        // Scale up the modal
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        // Fade in the modal
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        // Slide up the stats cards
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();

      // Start rotating confetti animation (continuous loop)
      Animated.loop(
        Animated.sequence([
          Animated.timing(confettiAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(confettiAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Reset all animations when modal closes
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
      confettiAnim.setValue(0);
    }
  }, [visible, scaleAnim, fadeAnim, slideAnim, confettiAnim]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.dark]}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Close Button */}
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <X size={24} color={COLORS.white} />
            </TouchableOpacity>

            {/* Success Icon */}
            <Animated.View
              style={[
                styles.iconContainer,
                {
                  transform: [
                    {
                      rotate: confettiAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ["0deg", "360deg"],
                      }),
                    },
                  ],
                },
              ]}
            >
              {leveledUp ? (
                <Trophy size={80} color={COLORS.accent} />
              ) : (
                <Zap size={80} color={COLORS.accent} />
              )}
            </Animated.View>

            {/* Title */}
            <Text style={styles.title}>
              {leveledUp ? "🎉 Level Up!" : "Trip Completed!"}
            </Text>
            {leveledUp && newLevel != null && (
              <Text style={styles.levelUpText}>
                You reached Level {newLevel}!
              </Text>
            )}

            {/* Stats Cards */}
            <Animated.View
              style={[
                styles.statsContainer,
                { transform: [{ translateY: slideAnim }] },
              ]}
            >
              <StatCard
                icon={<Trophy size={28} color={COLORS.accent} />}
                value={`+${xpEarned}`}
                label="XP Earned"
              />
              <StatCard
                icon={<Leaf size={28} color={COLORS.green} />}
                value={co2Saved.toFixed(2)}
                label="kg CO₂ Saved"
              />
            </Animated.View>

            {/* Distance Badge */}
            <View style={styles.distanceBadge}>
              <TrendingUp size={16} color={COLORS.white} />
              <Text style={styles.distanceText}>
                {distance.toFixed(1)} km traveled
              </Text>
            </View>

            {/* Action Button */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Text style={styles.actionBtnText}>
                {leveledUp ? "Awesome!" : "Great!"}
              </Text>
            </TouchableOpacity>

            {/* Footer Message */}
            <Text style={styles.footerText}>
              Keep it up! Every trip makes a difference. 🌍
            </Text>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ===== MODAL CONTAINER =====
  overlay: {
    flex: 1,
    backgroundColor: COLORS.blackTransparent70,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 32,
    overflow: "hidden",
  },
  gradient: {
    padding: 32,
    alignItems: "center",
  },
  
  // ===== CLOSE BUTTON =====
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.whiteTransparent20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  
  // ===== SUCCESS ICON =====
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.whiteTransparent20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  
  // ===== TITLE & TEXT =====
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 8,
    textAlign: "center",
  },
  levelUpText: {
    fontSize: 18,
    color: COLORS.accent,
    marginBottom: 24,
    fontWeight: "600",
  },
  
  // ===== STATS CARDS =====
  statsContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
    width: "100%",
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.whiteTransparent15,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.whiteTransparent20,
  },
  statIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.whiteTransparent20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.white,
    opacity: 0.8,
    textAlign: "center",
  },
  
  // ===== DISTANCE BADGE =====
  distanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.whiteTransparent15,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 24,
  },
  distanceText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: "600",
  },
  
  // ===== ACTION BUTTON =====
  actionBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 28,
    width: "100%",
    alignItems: "center",
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 16,
  },
  actionBtnText: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.dark,
  },
  
  // ===== FOOTER =====
  footerText: {
    fontSize: 13,
    color: COLORS.white,
    opacity: 0.7,
    textAlign: "center",
    fontStyle: "italic",
  },
});


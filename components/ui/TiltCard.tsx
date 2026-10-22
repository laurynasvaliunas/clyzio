import React from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { motion } from '../../lib/theme/tokens';
import { useReducedMotion } from './useReducedMotion';

export interface TiltCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Max tilt in degrees at the card's edges. */
  maxTilt?: number;
  /** Moving light reflection across the surface. */
  glare?: boolean;
  /** Corner radius for the glare layer (match the card's). */
  radius?: number;
}

/**
 * A hero surface that tilts toward the finger in 3D and catches a moving
 * highlight, then springs flat on release.
 *
 * Uses raw View touch events (it never claims the responder), so a ScrollView
 * around it still scrolls and buttons inside it still press normally.
 */
export function TiltCard({ children, style, maxTilt = 7, glare = true, radius = 24 }: TiltCardProps) {
  const reduce = useReducedMotion();
  const w = useSharedValue(1);
  const h = useSharedValue(1);
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);
  const lit = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    w.value = Math.max(1, e.nativeEvent.layout.width);
    h.value = Math.max(1, e.nativeEvent.layout.height);
  };

  const follow = (e: GestureResponderEvent) => {
    if (reduce) return;
    const { locationX, locationY } = e.nativeEvent;
    const nx = Math.min(1, Math.max(0, locationX / w.value)) - 0.5;
    const ny = Math.min(1, Math.max(0, locationY / h.value)) - 0.5;
    rx.value = withSpring(-ny * 2 * maxTilt, motion.spring.snappy);
    ry.value = withSpring(nx * 2 * maxTilt, motion.spring.snappy);
    lit.value = withSpring(1, motion.spring.snappy);
  };

  const settle = () => {
    rx.value = withSpring(0, motion.spring.gentle);
    ry.value = withSpring(0, motion.spring.gentle);
    lit.value = withSpring(0, motion.spring.gentle);
  };

  const tilt = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { rotateX: `${rx.value}deg` },
      { rotateY: `${ry.value}deg` },
      { scale: 1 - lit.value * 0.01 },
    ],
  }));

  // The reflection slides opposite to the tilt, like light on glass.
  const shine = useAnimatedStyle(() => ({
    opacity: lit.value * 0.55,
    transform: [{ translateX: (-ry.value / Math.max(1, maxTilt)) * 60 }, { translateY: (rx.value / Math.max(1, maxTilt)) * 40 }],
  }));

  return (
    <Animated.View
      style={[style, tilt]}
      onLayout={onLayout}
      onTouchStart={follow}
      onTouchMove={follow}
      onTouchEnd={settle}
      onTouchCancel={settle}
    >
      {children}
      {glare && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
          <Animated.View style={[styles.glare, shine]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glare: {
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    width: '200%',
    height: '200%',
  },
});

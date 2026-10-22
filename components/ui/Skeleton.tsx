import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getPalette, radii } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useReducedMotion } from './useReducedMotion';

export interface SkeletonProps {
  width?: ViewStyle['width'];
  height?: ViewStyle['height'];
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Placeholder with a light band sweeping across it. Uses the plain `Animated`
 * API (works outside the Reanimated worklet context). Under Reduce Motion it
 * stays a still block.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = radii.sm, style }: SkeletonProps) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const reduce = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    if (reduce || w === 0) return;
    const anim = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [sweep, reduce, w]);

  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-w, w] });
  const band = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)';

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[styles.base, { width, height, borderRadius, backgroundColor: p.surface2 }, style]}
    >
      {!reduce && w > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', band, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
});

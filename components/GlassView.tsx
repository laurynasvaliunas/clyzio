import React from 'react';
import { StyleSheet, ViewStyle, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { getGlass } from '../lib/theme/tokens';
import { useTheme } from '../contexts/ThemeContext';

interface GlassViewProps {
  children: React.ReactNode;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  style?: ViewStyle;
}

/** Frosted surface with a lit top edge; follows the theme unless `tint` is set. */
export default function GlassView({ children, intensity, tint, style }: GlassViewProps) {
  const { isDark } = useTheme();
  const g = getGlass(isDark);
  const radius = (StyleSheet.flatten(style)?.borderRadius as number | undefined) ?? 0;
  return (
    <View style={[styles.container, style]}>
      <BlurView intensity={intensity ?? g.intensity} tint={tint ?? g.tint} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]} />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: g.stroke, borderTopColor: g.highlight },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

import React, { useId } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { glows } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

type GlowColor = 'teal' | 'mint' | 'sun';

interface Spot {
  cx: number;
  cy: number;
  r: number;
  color: GlowColor;
}

/** Glow layouts, in the box's 0–1 coordinates. */
const LAYOUTS: Record<'brand' | 'eco' | 'reward' | 'subtle', Spot[]> = {
  brand: [
    { cx: 0.05, cy: 0.0, r: 0.75, color: 'teal' },
    { cx: 1.0, cy: 0.15, r: 0.6, color: 'mint' },
  ],
  eco: [
    { cx: 0.5, cy: 0.05, r: 0.8, color: 'mint' },
    { cx: 0.0, cy: 0.35, r: 0.55, color: 'teal' },
  ],
  reward: [
    { cx: 0.5, cy: 0.1, r: 0.7, color: 'sun' },
    { cx: 0.95, cy: 0.4, r: 0.5, color: 'teal' },
  ],
  subtle: [{ cx: 0.0, cy: 0.0, r: 0.7, color: 'teal' }],
};

export interface GlowBackdropProps {
  variant?: keyof typeof LAYOUTS;
  style?: StyleProp<ViewStyle>;
}

/**
 * Soft radial light behind a screen or hero — gives flat white screens the
 * sense of a lit space. Decorative only: absolute, non-interactive, hidden
 * from accessibility.
 */
export function GlowBackdrop({ variant = 'brand', style }: GlowBackdropProps) {
  const { isDark } = useTheme();
  const palette = isDark ? glows.dark : glows.light;
  const id = useId().replace(/:/g, '');
  const spots = LAYOUTS[variant];

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%">
        <Defs>
          {spots.map((s, i) => (
            <RadialGradient key={i} id={`${id}g${i}`} cx={s.cx} cy={s.cy} rx={s.r} ry={s.r} fx={s.cx} fy={s.cy}>
              <Stop offset="0" stopColor={palette[s.color].color} stopOpacity={palette[s.color].opacity} />
              <Stop offset="1" stopColor={palette[s.color].color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {spots.map((_, i) => (
          <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#${id}g${i})`} />
        ))}
      </Svg>
    </View>
  );
}

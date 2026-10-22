import React from 'react';
import { View, ViewProps, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ElevationLevel,
  getElevation,
  getGlass,
  getPalette,
  gradients,
  radii,
  spacing,
} from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export type CardVariant = 'solid' | 'glass' | 'hero';

export interface CardProps extends ViewProps {
  elevation?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /**
   * solid = white surface (default); glass = frosted, for cards over maps or
   * glows; hero = brand-gradient surface with light text (set your own).
   */
  variant?: CardVariant;
  padded?: boolean;
  style?: ViewStyle;
}

const LEVEL: Record<Exclude<NonNullable<CardProps['elevation']>, 'none'>, ElevationLevel> = {
  sm: 'e1',
  md: 'e2',
  lg: 'e3',
  xl: 'e4',
};

/** Theme-aware surface container used for list rows, panels, sheets, etc. */
export function Card({
  elevation = 'sm',
  variant = 'solid',
  padded = true,
  style,
  children,
  ...rest
}: CardProps) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const g = getGlass(isDark);
  const shadow = elevation === 'none' ? null : getElevation(isDark, LEVEL[elevation]);
  const radius = (StyleSheet.flatten(style)?.borderRadius as number | undefined) ?? radii.xl;

  if (variant === 'solid') {
    return (
      <View
        style={[
          styles.base,
          { backgroundColor: p.surface, borderColor: p.border },
          padded && { padding: spacing[4] },
          shadow,
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  // glass / hero: the shadow sits on an outer view; the clipped inner view
  // holds the blur or gradient so corners stay crisp.
  return (
    <View style={[{ borderRadius: radius }, shadow, style, { padding: 0 }]} {...rest}>
      <View style={[styles.clip, { borderRadius: radius }]}>
        {variant === 'glass' ? (
          <>
            <BlurView intensity={g.intensity} tint={g.tint} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]} />
          </>
        ) : (
          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: variant === 'glass' ? g.stroke : 'rgba(255,255,255,0.14)',
              borderTopColor: variant === 'glass' ? g.highlight : 'rgba(255,255,255,0.28)',
            },
          ]}
        />
        <View style={[padded && { padding: spacing[4] }, flattenPadding(style)]}>{children}</View>
      </View>
    </View>
  );
}

/** Keep caller-supplied padding on the content layer (the outer view is a frame). */
function flattenPadding(style?: ViewStyle): ViewStyle | null {
  const s = StyleSheet.flatten(style);
  if (!s) return null;
  const keys = [
    'padding',
    'paddingHorizontal',
    'paddingVertical',
    'paddingTop',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'gap',
    'flexDirection',
    'alignItems',
    'justifyContent',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (s[k] != null) out[k] = s[k];
  return Object.keys(out).length ? (out as ViewStyle) : null;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clip: {
    overflow: 'hidden',
  },
});

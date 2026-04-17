import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { typography, getPalette } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

type Variant = keyof typeof typography;
type Tone = 'default' | 'secondary' | 'muted' | 'brand' | 'danger' | 'success' | 'inverse';

export interface TxtProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

/**
 * Theme- and variant-aware text primitive. Use this instead of raw `<Text>`
 * so typography stays consistent and dark mode Just Works.
 *
 * Caps font scaling at 1.6x (accessible but prevents layout breakage from
 * system-level XXXL type sizes).
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TxtProps) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const color = toneColor(tone, p, isDark);
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color }, style]}
      {...rest}
    />
  );
}

function toneColor(
  tone: Tone,
  p: ReturnType<typeof getPalette>,
  isDark: boolean,
) {
  switch (tone) {
    case 'secondary': return p.textSecondary;
    case 'muted': return p.textMuted;
    case 'brand': return '#26C6DA';
    case 'danger': return '#EF4444';
    case 'success': return '#4CAF50';
    case 'inverse': return isDark ? '#0F172A' : '#FFFFFF';
    default: return p.text;
  }
}

// Convenience pre-bound aliases — less typing at call-sites.
export const Display = (p: Omit<TxtProps, 'variant'>) => <Text {...p} variant="display" />;
export const Title = (p: Omit<TxtProps, 'variant'>) => <Text {...p} variant="title" />;
export const Heading = (p: Omit<TxtProps, 'variant'>) => <Text {...p} variant="heading" />;
export const Body = (p: Omit<TxtProps, 'variant'>) => <Text {...p} variant="body" />;
export const Caption = (p: Omit<TxtProps, 'variant'>) => <Text {...p} variant="caption" />;
export const Label = (p: Omit<TxtProps, 'variant'>) => <Text {...p} variant="label" />;

// Ensure StyleSheet is referenced so TS doesn't tree-shake it if anyone
// extends the style prop with spread only.
void StyleSheet;

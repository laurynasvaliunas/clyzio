/**
 * Clyzio design tokens — single source of truth.
 *
 * Everything the app renders (StyleSheet, NativeWind, Tailwind themes) is
 * derived from this file. Do NOT redefine hex values in components.
 *
 * Brand identity is Cyan (#26C6DA) with Deep Teal (#006064) accents — this was
 * drifted across screens before the overhaul (some places used Emerald
 * #10B981). If anything references another brand hex, migrate it here.
 */

export const brand = {
  primary: '#26C6DA',
  primaryDark: '#00ACC1',
  primaryDarker: '#006064',
  accent: '#FDD835',
} as const;

export const semantic = {
  success: '#4CAF50',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#0EA5E9',
} as const;

export const neutral = {
  black: '#000000',
  white: '#FFFFFF',
  gray50: '#F9FAFB',
  gray100: '#F1F5F9',
  gray200: '#E5E7EB',
  gray300: '#CBD5E1',
  gray400: '#9CA3AF',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1F2937',
  gray900: '#0F172A',
} as const;

export const palette = {
  light: {
    background: '#F5FAFA',
    surface: neutral.white,
    surface2: '#F0F4F5',
    surfaceElevated: neutral.white,
    text: neutral.gray900,
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    border: 'rgba(0,0,0,0.06)',
    borderStrong: 'rgba(0,0,0,0.12)',
    inputBg: '#F0F9FA',
    placeholder: '#94A3B8',
    overlay: 'rgba(15, 23, 42, 0.32)',
  },
  dark: {
    background: '#000000',
    surface: '#1C1C1E',
    surface2: '#2C2C2E',
    surfaceElevated: '#2C2C2E',
    text: neutral.white,
    textSecondary: 'rgba(255,255,255,0.65)',
    textMuted: 'rgba(255,255,255,0.45)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
    inputBg: '#2C2C2E',
    placeholder: 'rgba(255,255,255,0.35)',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type ColorScheme = 'light' | 'dark';

/** Get the resolved palette for a given scheme. */
export const getPalette = (isDark: boolean) =>
  isDark ? palette.dark : palette.light;

// ─── Geometry ────────────────────────────────────────────────────────────────

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  subheading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.4 },
} as const;

export const motion = {
  // Durations (ms) — align with Material spec + Apple HIG recommendations.
  fast: 150,
  base: 220,
  slow: 320,
  // Reanimated easing names consumable as strings or from react-native-reanimated
  easing: {
    standard: 'ease-in-out',
    decelerate: 'ease-out',
    accelerate: 'ease-in',
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

export type Palette = ReturnType<typeof getPalette>;

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
  primaryDark: '#00565A',
  primaryDarker: '#003D40',
  accent: '#F2C744',
} as const;

export const semantic = {
  success: '#5B8F5B',
  warning: '#C4623F',
  danger: '#C4623F',
  info: '#0EA5E9',
} as const;

/**
 * Editorial design system ("magazine-grade" reskin, Edition 02 / 2026).
 * Warm paper surfaces, ink type, muted accents + JetBrains Mono / Instrument
 * Serif families. Screens reference these directly for the editorial look;
 * the light/dark palettes below are re-pointed onto this system so the base
 * theme propagates to every existing `useThemeColors` consumer.
 */
// App-wide typography uses the platform system font (SF Pro / Roboto) — no
// custom family is set; weight carries the hierarchy.
export const weights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

export const editorial = {
  // Surfaces
  paper: '#F1EDE4',
  paper2: '#E8E3D7',
  paper3: '#DCD6C7',
  ivory: '#FAF7EF',
  white: '#FFFFFF',
  // Ink
  ink: '#0B1A1F',
  ink2: '#243439',
  ink3: '#5A6A6F',
  ink4: '#8B989C',
  hairline: 'rgba(11,26,31,0.10)',
  hairline2: 'rgba(11,26,31,0.05)',
  // Brand
  cyan: '#26C6DA',
  cyan2: '#2DD4E4',
  teal: '#003D40',
  teal2: '#00565A',
  cyanMist: '#DCF1F4',
  cyanFog: '#EAF6F8',
  // Accents
  sun: '#F2C744',
  leaf: '#5B8F5B',
  clay: '#C4623F',
  // Night (active-ride scene)
  night: '#0E1F23',
  night2: '#15282C',
  nightLine: 'rgba(255,255,255,0.07)',
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
  // Light = warm "paper" editorial surface.
  light: {
    background: editorial.paper,
    surface: editorial.ivory,
    surface2: editorial.paper2,
    surfaceElevated: editorial.ivory,
    text: editorial.ink,
    textSecondary: editorial.ink3,
    textMuted: editorial.ink4,
    border: editorial.hairline,
    borderStrong: 'rgba(11,26,31,0.18)',
    inputBg: editorial.paper2,
    placeholder: editorial.ink4,
    overlay: 'rgba(11,26,31,0.32)',
  },
  // Dark = "night" editorial surface (active-ride scene tone).
  dark: {
    background: editorial.night,
    surface: editorial.night2,
    surface2: '#1B3035',
    surfaceElevated: editorial.night2,
    text: neutral.white,
    textSecondary: 'rgba(255,255,255,0.65)',
    textMuted: 'rgba(255,255,255,0.45)',
    border: editorial.nightLine,
    borderStrong: 'rgba(255,255,255,0.16)',
    inputBg: '#1B3035',
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
  // ─── Editorial type scale (system font; weight carries the hierarchy) ──────
  displayHero: { fontWeight: weights.heavy, fontSize: 80, lineHeight: 94, letterSpacing: -2 },
  displayXL: { fontWeight: weights.heavy, fontSize: 50, lineHeight: 60, letterSpacing: -1 },
  serifTitle: { fontWeight: weights.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  serifLg: { fontWeight: weights.bold, fontSize: 21, lineHeight: 25 },
  serifNum: { fontWeight: weights.heavy, fontSize: 44, lineHeight: 52, letterSpacing: -1 },
  eyebrow: {
    fontWeight: weights.semibold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  pillText: {
    fontWeight: weights.semibold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  monoMeta: { fontWeight: weights.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 0.4 },
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

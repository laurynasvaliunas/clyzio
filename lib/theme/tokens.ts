/**
 * Clyzio design tokens — single source of truth.
 *
 * Everything the app renders (StyleSheet, NativeWind, Tailwind themes) is
 * derived from this file. Do NOT redefine hex values in components.
 *
 * Brand identity is Deep Teal (#00565A) on white — the "pro app" re-theme
 * (2026-07). One brand hue + sharp semantic colors; the earlier warm-paper /
 * cyan editorial palette was consolidated into this set. If anything
 * references another brand hex, migrate it here.
 */

export const brand = {
  primary: '#00565A',
  primaryDark: '#003D40',
  primaryDarker: '#002B2E',
  accent: '#F59E0B',
} as const;

export const semantic = {
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626',
  info: '#00565A',
} as const;

/** Light backgrounds / borders / dark text for status banners and pills. */
export const semanticTint = {
  successBg: '#ECFDF5',
  successBorder: '#D1FAE5',
  successInk: '#047857',
  warningBg: '#FFFBEB',
  warningInk: '#92400E',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerInk: '#B91C1C',
} as const;

/**
 * Editorial design system — re-themed to "pro white" (2026-07).
 * White/near-white surfaces, ink type, one deep-teal brand hue + sharp
 * semantic accents. Key names are kept from the earlier warm-paper edition
 * (paper/ivory/cyan/sun/leaf/clay) so the ~40 screens referencing them keep
 * compiling; only the VALUES changed. The light/dark palettes below are
 * re-pointed onto this system so the base theme propagates to every existing
 * `useThemeColors` consumer.
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
  // Surfaces — screen bg reads white; cards are true white on top of it.
  paper: '#F7F9FA',
  paper2: '#EDF1F2',
  paper3: '#E2E8EA',
  ivory: '#FFFFFF',
  white: '#FFFFFF',
  // Ink
  ink: '#0B1A1F',
  ink2: '#243439',
  ink3: '#5A6A6F',
  ink4: '#8B989C',
  hairline: 'rgba(11,26,31,0.10)',
  hairline2: 'rgba(11,26,31,0.05)',
  // Brand — one deep-teal hue (keys kept from the cyan era for compat)
  cyan: '#00565A',
  cyan2: '#00676D',
  teal: '#003D40',
  teal2: '#00565A',
  cyanMist: '#E6F1F2',
  cyanFog: '#E6F1F2',
  // Accents — sharp semantic set
  sun: '#F59E0B',
  leaf: '#059669',
  clay: '#DC2626',
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

/**
 * The bottom tab bar floats over the tab screens (position: absolute in
 * app/(tabs)/_layout.tsx), so a tab screen's scroll content must end at least
 * this far above the screen edge — otherwise its last items (e.g. Sign Out)
 * sit behind the bar and can't be scrolled into view.
 */
export const TAB_BAR_HEIGHT = 88;
/** Bottom padding for a tab screen's scroll content: clears the bar + 16 pt. */
export const TAB_SCREEN_BOTTOM_PADDING = TAB_BAR_HEIGHT + 16;

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
  // Reanimated `withSpring` configs. snappy = presses / toggles, gentle =
  // cards settling, bouncy = celebratory pops.
  spring: {
    snappy: { damping: 18, stiffness: 320, mass: 0.6 },
    gentle: { damping: 16, stiffness: 140, mass: 1 },
    bouncy: { damping: 10, stiffness: 180, mass: 0.8 },
  },
  /** Delay between list items entering, ms. */
  stagger: 55,
} as const;

// ─── Depth system (2026-10 "premium light" redesign) ─────────────────────────
//
// Layered shadows: a tight ambient contact shadow + a soft key-light shadow,
// via RN's `boxShadow` (new architecture). The deepest level is tinted with the
// brand teal so floating surfaces read as lit by the brand, not grey.

export type ElevationLevel = 'e1' | 'e2' | 'e3' | 'e4';

export const elevation = {
  light: {
    e1: '0px 1px 2px rgba(11,26,31,0.06), 0px 2px 6px rgba(11,26,31,0.04)',
    e2: '0px 1px 2px rgba(11,26,31,0.05), 0px 8px 20px rgba(11,26,31,0.07)',
    e3: '0px 2px 4px rgba(11,26,31,0.05), 0px 14px 34px rgba(11,26,31,0.10)',
    e4: '0px 4px 10px rgba(0,61,64,0.08), 0px 26px 60px rgba(0,61,64,0.20)',
    /** Bottom sheets / docked bars: light falls upward. */
    up: '0px -1px 0px rgba(11,26,31,0.04), 0px -10px 30px rgba(11,26,31,0.10)',
  },
  dark: {
    e1: '0px 1px 2px rgba(0,0,0,0.30)',
    e2: '0px 8px 20px rgba(0,0,0,0.36)',
    e3: '0px 14px 34px rgba(0,0,0,0.44)',
    e4: '0px 26px 60px rgba(0,0,0,0.55)',
    up: '0px -10px 30px rgba(0,0,0,0.45)',
  },
} as const;

/** `boxShadow` style for an elevation level in the current scheme. */
export const getElevation = (isDark: boolean, level: ElevationLevel) => ({
  boxShadow: (isDark ? elevation.dark : elevation.light)[level],
});

/** Frosted-glass surfaces (expo-blur + a translucent fill + a lit top edge). */
export const glass = {
  light: {
    tint: 'light' as const,
    intensity: 55,
    fill: 'rgba(255,255,255,0.74)',
    highlight: 'rgba(255,255,255,0.95)',
    stroke: 'rgba(11,26,31,0.07)',
  },
  dark: {
    tint: 'dark' as const,
    intensity: 45,
    fill: 'rgba(21,40,44,0.74)',
    highlight: 'rgba(255,255,255,0.10)',
    stroke: 'rgba(255,255,255,0.08)',
  },
} as const;

export const getGlass = (isDark: boolean) => (isDark ? glass.dark : glass.light);

/** Gradient stops (expo-linear-gradient `colors`). */
export const gradients = {
  /** Brand surface — buttons, hero cards. */
  brand: ['#00767C', '#00565A', '#003D40'] as const,
  /** Pale brand wash for light hero backgrounds. */
  brandMist: ['#E8F4F4', '#F7F9FA'] as const,
  /** Positive impact (CO₂ saved, completion). */
  eco: ['#34D399', '#059669'] as const,
  /** XP / rewards. */
  sun: ['#FCD34D', '#F59E0B'] as const,
  /** Night scene (active ride, dark heroes). */
  night: ['#1B3035', '#0E1F23'] as const,
} as const;

/**
 * Soft background glows (GlowBackdrop), per scheme: hex colour + opacity kept
 * separate — react-native-svg ignores the alpha of rgba() stop colours.
 */
export const glows = {
  light: {
    teal: { color: '#00767C', opacity: 0.16 },
    mint: { color: '#10B981', opacity: 0.13 },
    sun: { color: '#F59E0B', opacity: 0.1 },
  },
  dark: {
    teal: { color: '#00969E', opacity: 0.2 },
    mint: { color: '#10B981', opacity: 0.14 },
    sun: { color: '#F59E0B', opacity: 0.1 },
  },
} as const;

/** Recurring depth recipes (boxShadow strings) used across screens. */
export const depth = {
  /** Brand-filled hero tiles / logo blocks: lit top edge + teal drop shadow. */
  emboss: 'inset 0px 2px 3px rgba(255,255,255,0.32), inset 0px -3px 6px rgba(0,0,0,0.12), 0px 14px 30px rgba(0,61,64,0.28)',
  /** Light tiles / chips: subtle raised coin. */
  embossLight:
    'inset 0px 2px 3px rgba(255,255,255,0.9), inset 0px -3px 6px rgba(11,26,31,0.08), 0px 8px 18px rgba(11,26,31,0.10)',
  /** Primary call-to-action underglow. */
  ctaGlow: '0px 2px 4px rgba(0,61,64,0.18), 0px 12px 28px rgba(0,86,90,0.30)',
  /** Selected option halo (pair with a brand border). */
  selected: '0px 0px 0px 4px rgba(0,86,90,0.10), 0px 10px 24px rgba(0,86,90,0.16)',
} as const;

/** Numbers that update in place (stats, timers) keep their width. */
export const numeric = { fontVariant: ['tabular-nums' as const] };

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

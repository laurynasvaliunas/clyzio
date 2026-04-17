import { brand, semantic, neutral, getPalette } from './theme/tokens';

/**
 * Back-compat shim. The design system now lives in `lib/theme/tokens.ts`;
 * this file is kept so the many screens that import `getThemeColors` from
 * `lib/theme` keep working during the progressive migration. New code should
 * import from `lib/theme/tokens` (or the `useTokens` hook).
 */
export const getThemeColors = (isDark: boolean) => {
  const p = getPalette(isDark);
  return {
    background: p.background,
    surface: p.surface,
    surface2: p.surface2,
    text: p.text,
    textSecondary: p.textSecondary,
    border: p.border,
    primary: brand.primary,
    accent: brand.accent,
    dark: brand.primaryDarker,
    green: semantic.success,
    red: semantic.danger,
    white: neutral.white,
    inputBg: p.inputBg,
    placeholder: p.placeholder,
  };
};

export { brand, semantic, neutral, getPalette };
export * from './theme/tokens';

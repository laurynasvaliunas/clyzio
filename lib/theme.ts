export const getThemeColors = (isDark: boolean) => ({
  background: isDark ? '#000000' : '#F5FAFA',
  surface: isDark ? '#1C1C1E' : '#FFFFFF',
  surface2: isDark ? '#2C2C2E' : '#F0F4F5',
  text: isDark ? '#FFFFFF' : '#0F172A',
  textSecondary: isDark ? 'rgba(255,255,255,0.5)' : '#90A4AE',
  border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  // Brand — same in both modes
  primary: '#26C6DA',
  accent: '#FDD835',
  dark: '#006064',
  green: '#4CAF50',
  red: '#EF4444',
  white: '#FFFFFF',
  inputBg: isDark ? '#2C2C2E' : '#F0F9FA',
  placeholder: isDark ? 'rgba(255,255,255,0.3)' : '#90A4AE',
});

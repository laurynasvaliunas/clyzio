import React from 'react';
import { Pressable, PressableProps, StyleSheet, ViewStyle } from 'react-native';
import { getPalette, radii } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export interface IconButtonProps extends Omit<PressableProps, 'style'> {
  accessibilityLabel: string; // required for a11y
  children: React.ReactNode;
  size?: number;
  variant?: 'ghost' | 'surface';
  style?: ViewStyle;
}

/** Icon-only button. `accessibilityLabel` is REQUIRED (TS enforced). */
export function IconButton({
  accessibilityLabel,
  children,
  size = 40,
  variant = 'ghost',
  onPress,
  style,
  ...rest
}: IconButtonProps) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          backgroundColor: variant === 'surface' ? p.surface2 : 'transparent',
        },
        pressed && { opacity: 0.6 },
        style,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
  },
});

import React from 'react';
import { View, ViewProps, StyleSheet, ViewStyle } from 'react-native';
import { getPalette, radii, shadows, spacing } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export interface CardProps extends ViewProps {
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  padded?: boolean;
  style?: ViewStyle;
}

/** Theme-aware surface container used for list rows, panels, sheets, etc. */
export function Card({
  elevation = 'sm',
  padded = true,
  style,
  children,
  ...rest
}: CardProps) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const shadow = elevation === 'none' ? null : shadows[elevation];
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

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

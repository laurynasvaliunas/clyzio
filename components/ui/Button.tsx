import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { brand, semantic, radii, spacing, getPalette } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

/**
 * Accessible, theme-aware button primitive.
 *
 * - Uses `Pressable` with a hit slop of 8 — fixes hard-to-tap 40px buttons.
 * - Fires haptic feedback on primary/destructive press.
 * - Disables itself while `loading`.
 * - Exposes proper `accessibilityRole`, `accessibilityState`, and label.
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  fullWidth,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { isDark } = useTheme();
  const palette = getPalette(isDark);
  const v = useMemo(() => variantStyles(variant, isDark, palette), [variant, isDark, palette]);
  const s = sizeStyles[size];

  const effectiveDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!effectiveDisabled, busy: loading }}
      hitSlop={8}
      disabled={effectiveDisabled}
      onPress={(e) => {
        if (variant === 'primary' || variant === 'destructive') {
          Haptics.selectionAsync().catch(() => undefined);
        }
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        s.container,
        v.container,
        fullWidth && { alignSelf: 'stretch' },
        pressed && !effectiveDisabled && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        effectiveDisabled && { opacity: 0.55 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.labelColor} />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <View style={{ marginRight: spacing[2] }}>{leftIcon}</View> : null}
          <Text variant={s.text} style={{ color: v.labelColor }}>
            {title}
          </Text>
          {rightIcon ? <View style={{ marginLeft: spacing[2] }}>{rightIcon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const sizeStyles = {
  sm: {
    container: { paddingVertical: spacing[2], paddingHorizontal: spacing[3], minHeight: 36 } as ViewStyle,
    text: 'caption' as const,
  },
  md: {
    container: { paddingVertical: spacing[3], paddingHorizontal: spacing[5], minHeight: 48 } as ViewStyle,
    text: 'bodyStrong' as const,
  },
  lg: {
    container: { paddingVertical: spacing[4], paddingHorizontal: spacing[6], minHeight: 56 } as ViewStyle,
    text: 'subheading' as const,
  },
} as const;

function variantStyles(
  v: ButtonVariant,
  isDark: boolean,
  p: ReturnType<typeof getPalette>,
): { container: ViewStyle; labelColor: string } {
  switch (v) {
    case 'primary':
      return {
        container: { backgroundColor: brand.primary },
        labelColor: '#FFFFFF',
      };
    case 'destructive':
      return {
        container: { backgroundColor: semantic.danger },
        labelColor: '#FFFFFF',
      };
    case 'secondary':
      return {
        container: {
          backgroundColor: p.surface2,
          borderWidth: 1,
          borderColor: p.border,
        },
        labelColor: p.text,
      };
    case 'ghost':
    default:
      return {
        container: { backgroundColor: 'transparent' },
        labelColor: brand.primary,
      };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

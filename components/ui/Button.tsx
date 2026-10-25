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
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Text';
import { brand, semantic, spacing, getPalette, gradients, motion, fun, depth } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useReducedMotion } from './useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
 * - Friendly look: pill shape, the logo's bright cyan with navy extra-bold
 *   text, and a chunky bottom edge like a toy button.
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
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const filled = variant === 'primary' || variant === 'destructive';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!effectiveDisabled, busy: loading }}
      hitSlop={8}
      disabled={effectiveDisabled}
      onPressIn={() => {
        if (!reduce) scale.value = withSpring(0.96, motion.spring.snappy);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      onPress={(e) => {
        if (variant === 'primary' || variant === 'destructive') {
          Haptics.selectionAsync().catch(() => undefined);
        }
        onPress?.(e);
      }}
      style={[
        styles.base,
        s.container,
        v.container,
        fullWidth && { alignSelf: 'stretch' },
        effectiveDisabled && { opacity: 0.55 },
        style,
        pressStyle,
      ]}
      {...rest}
    >
      {variant === 'primary' && (
        <LinearGradient
          colors={gradients.bright}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.fill]}
        />
      )}
      {filled && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fill, styles.sheen]} />}
      {loading ? (
        <ActivityIndicator color={v.labelColor} />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <View style={{ marginRight: spacing[2] }}>{leftIcon}</View> : null}
          <Text variant={s.text} style={{ color: v.labelColor, fontWeight: '800' }}>
            {title}
          </Text>
          {rightIcon ? <View style={{ marginLeft: spacing[2] }}>{rightIcon}</View> : null}
        </View>
      )}
    </AnimatedPressable>
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
        // Gradient fill is layered on top; the solid colour is its fallback.
        // Bright cyan always carries navy text (9.5:1).
        container: {
          backgroundColor: fun.cyan,
          boxShadow: isDark ? '0px 8px 20px rgba(0,0,0,0.40)' : depth.ctaGlow,
        },
        labelColor: fun.navy,
      };
    case 'destructive':
      return {
        container: {
          backgroundColor: semantic.danger,
          boxShadow: isDark
            ? '0px 8px 20px rgba(0,0,0,0.40)'
            : 'inset 0px -4px 0px rgba(0,0,0,0.16), 0px 8px 20px rgba(220,38,38,0.24)',
        },
        labelColor: '#FFFFFF',
      };
    case 'secondary':
      return {
        container: {
          backgroundColor: p.surface,
          borderWidth: 2,
          borderColor: fun.cyan,
          boxShadow: 'inset 0px -3px 0px rgba(11,37,64,0.06)',
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
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    borderRadius: 999,
  },
  // Lit top edge on filled buttons.
  sheen: {
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.45)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

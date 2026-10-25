import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { KeyboardScroll } from './KeyboardScroll';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPalette } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { GlowBackdrop, GlowBackdropProps } from './GlowBackdrop';

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  keyboardAvoiding?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  /** Soft ambient light behind the content (GlowBackdrop variant). */
  glow?: GlowBackdropProps['variant'];
}

/**
 * Root-level wrapper every screen should use. Picks up the current theme
 * background, applies safe-area insets, optionally scrolls / handles
 * keyboard avoidance, and sets the screen content inset by default.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top', 'bottom'],
  keyboardAvoiding = true,
  style,
  contentContainerStyle,
  glow,
}: ScreenProps) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const Wrap = keyboardAvoiding ? KeyboardAvoidingView : View;

  const body = scroll ? (
    <KeyboardScroll
      contentContainerStyle={[
        padded && styles.padded,
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </KeyboardScroll>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: p.background }, style]}>
      {glow ? <GlowBackdrop variant={glow} /> : null}
      <Wrap
        behavior="padding"
        style={styles.flex}
      >
        {body}
      </Wrap>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: 16 },
});

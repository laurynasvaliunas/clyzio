import React, { forwardRef } from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { getPalette, radii, semantic, spacing } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  errorText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

/** Accessible text field with label, helper text, and error state. */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    helperText,
    errorText,
    leftIcon,
    rightIcon,
    containerStyle,
    style,
    editable = true,
    ...rest
  },
  ref,
) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const hasError = !!errorText;
  const borderColor = hasError ? semantic.danger : p.borderStrong;

  return (
    <View style={[{ marginBottom: spacing[4] }, containerStyle]}>
      {label ? (
        <Text variant="label" tone="secondary" style={{ marginBottom: spacing[2] }}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={[
          styles.row,
          {
            backgroundColor: p.inputBg,
            borderColor,
          },
        ]}
      >
        {leftIcon ? <View style={{ marginRight: spacing[2] }}>{leftIcon}</View> : null}
        <TextInput
          ref={ref}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={helperText}
          placeholderTextColor={p.placeholder}
          style={[
            styles.input,
            { color: p.text },
            !editable && { opacity: 0.55 },
            style,
          ]}
          maxFontSizeMultiplier={1.6}
          {...rest}
        />
        {rightIcon ? <View style={{ marginLeft: spacing[2] }}>{rightIcon}</View> : null}
      </View>
      {hasError ? (
        <Text variant="caption" tone="danger" style={{ marginTop: spacing[1] }}>
          {errorText}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="muted" style={{ marginTop: spacing[1] }}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
});

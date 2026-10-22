import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from './Text';
import { Button, ButtonProps } from './Button';
import { getElevation, getPalette, spacing } from '../../lib/theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string } & Partial<Omit<ButtonProps, 'title'>>;
  style?: ViewStyle;
}

/** Friendly empty/placeholder state with optional CTA. */
export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  return (
    <View style={[styles.wrap, style]}>
      {icon ? (
        <View
          style={[
            styles.disc,
            { backgroundColor: p.surface, borderColor: p.border },
            getElevation(isDark, 'e3'),
          ]}
        >
          {icon}
        </View>
      ) : null}
      <Text variant="heading" style={{ textAlign: 'center', marginBottom: spacing[2] }}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="secondary" style={{ textAlign: 'center' }}>
          {description}
        </Text>
      ) : null}
      {action ? (
        <Button
          {...action}
          title={action.label}
          style={{ marginTop: spacing[6] }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing[5],
  },
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[6],
  },
});

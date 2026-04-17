import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from './Text';
import { Button, ButtonProps } from './Button';
import { spacing } from '../../lib/theme/tokens';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string } & Partial<Omit<ButtonProps, 'title'>>;
  style?: ViewStyle;
}

/** Friendly empty/placeholder state with optional CTA. */
export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      {icon ? <View style={{ marginBottom: spacing[4] }}>{icon}</View> : null}
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
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[10],
    paddingHorizontal: spacing[6],
  },
});

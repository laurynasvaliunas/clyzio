import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Text } from './Text';
import { brand, radii, semantic, spacing } from '../../lib/theme/tokens';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
}

/** Small pill used for statuses, counts, category markers. */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const { bg, fg } = toneMap(tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      <Text variant="label" style={{ color: fg }}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

function toneMap(t: BadgeTone) {
  switch (t) {
    case 'brand': return { bg: brand.primary + '22', fg: brand.primaryDarker };
    case 'success': return { bg: semantic.success + '22', fg: '#137333' };
    case 'warning': return { bg: semantic.warning + '22', fg: '#92400E' };
    case 'danger': return { bg: semantic.danger + '22', fg: '#B91C1C' };
    default: return { bg: 'rgba(0,0,0,0.06)', fg: '#334155' };
  }
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2] + 2,
    borderRadius: radii.full,
  },
});

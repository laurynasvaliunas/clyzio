import React, { useState } from 'react';
import { Modal, View, StyleSheet, Pressable, TextInput, Alert } from 'react-native';
import { Star } from 'lucide-react-native';
import { Text, Button, Badge, Card } from './ui';
import { brand, getPalette, spacing } from '../lib/theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';

const TAGS = [
  'rating.tag.punctual',
  'rating.tag.friendly',
  'rating.tag.clean',
  'rating.tag.safe',
  'rating.tag.smooth',
  'rating.tag.chatty',
] as const;

interface Props {
  visible: boolean;
  rideId: string;
  ratedId: string;
  partnerName: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

/**
 * Bottom-sheet rating collector shown after a ride is completed.
 * Posts directly to the `ratings` table — RLS ensures the caller must be
 * a trip participant and cannot self-rate (see migration 011).
 */
export default function RatingSheet({
  visible,
  rideId,
  ratedId,
  partnerName,
  onClose,
  onSubmitted,
}: Props) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const [score, setScore] = useState<number>(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (key: string) =>
    setTags((curr) => (curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key]));

  const submit = async () => {
    if (score === 0) {
      Alert.alert('Choose a rating', 'Tap a star to select 1–5.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('ratings').insert({
        ride_id: rideId,
        rated_id: ratedId,
        score,
        tags,
        comment: comment.trim() || null,
      });
      if (error) throw error;
      onSubmitted?.();
      onClose();
    } catch (err: any) {
      Alert.alert('Could not submit rating', err?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: p.overlay }]}>
        <Card style={styles.sheet} elevation="lg">
          <Text variant="title">{t('rating.title')}</Text>
          <Text variant="body" tone="secondary" style={{ marginTop: spacing[2] }}>
            {t('rating.subtitle', { name: partnerName })}
          </Text>

          <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="score">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                hitSlop={8}
                onPress={() => setScore(n)}
                accessibilityRole="radio"
                accessibilityLabel={`${n} stars`}
                accessibilityState={{ selected: n === score }}
                style={{ marginHorizontal: 4 }}
              >
                <Star
                  size={40}
                  color={n <= score ? brand.accent : p.borderStrong}
                  fill={n <= score ? brand.accent : 'transparent'}
                />
              </Pressable>
            ))}
          </View>

          <View style={styles.tags}>
            {TAGS.map((k) => {
              const active = tags.includes(k);
              return (
                <Pressable key={k} onPress={() => toggleTag(k)} hitSlop={4}>
                  <Badge label={t(k as any)} tone={active ? 'brand' : 'neutral'} />
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={t('rating.comment.placeholder')}
            placeholderTextColor={p.placeholder}
            maxLength={500}
            multiline
            style={[
              styles.comment,
              { backgroundColor: p.inputBg, color: p.text, borderColor: p.border },
            ]}
          />

          <Button
            title={t('rating.submit')}
            loading={submitting}
            onPress={submit}
            style={{ marginTop: spacing[6] }}
            fullWidth
          />
          <Button
            title={t('common.cancel')}
            variant="ghost"
            onPress={onClose}
            style={{ marginTop: spacing[2] }}
            fullWidth
          />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 24,
    paddingBottom: 40,
  },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 28,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  comment: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
});

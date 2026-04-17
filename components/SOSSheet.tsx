import React from 'react';
import { Modal, View, StyleSheet, Linking, Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import { Phone, Share2, X } from 'lucide-react-native';
import { Text, Button, Card } from './ui';
import { getPalette, semantic, spacing } from '../lib/theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { t } from '../lib/i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  rideId?: string;
}

/**
 * Locale-aware SOS sheet.
 *
 * The previous implementation hard-coded "911" regardless of region. This
 * resolves the user's country from the OS locale and picks the correct
 * emergency number (US 911, UK 999, EU 112, default 112). It also:
 *   - asks for the current location permission (if missing) then shares a
 *     snapshot link to emergency contacts via the system share sheet;
 *   - records a `safety_incidents` row so the team can follow up.
 */
export default function SOSSheet({ visible, onClose, rideId }: Props) {
  const { isDark } = useTheme();
  const p = getPalette(isDark);

  const emergencyNumber = resolveEmergencyNumber();

  const logIncident = async (lat?: number, lng?: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('safety_incidents').insert({
        user_id: user.id,
        ride_id: rideId ?? null,
        kind: 'sos',
        latitude: lat ?? null,
        longitude: lng ?? null,
      });
    } catch {
      /* never block the call on logging */
    }
  };

  const handleCall = async () => {
    await logIncident();
    const url = Platform.OS === 'ios' ? `telprompt:${emergencyNumber}` : `tel:${emergencyNumber}`;
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url);
    else Alert.alert('Call failed', `Dial ${emergencyNumber} manually.`);
  };

  const handleShareLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission required', 'Enable location access to share your position.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const { latitude, longitude } = loc.coords;
      await logIncident(latitude, longitude);
      const url = `https://maps.google.com/?q=${latitude},${longitude}`;
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(url, { dialogTitle: 'My live location' });
      } else {
        await Linking.openURL(url);
      }
    } catch (e: any) {
      Alert.alert('Could not share location', e?.message ?? 'Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: p.overlay }]}>
        <Card style={styles.sheet} elevation="lg">
          <View style={styles.headerRow}>
            <Text variant="title" tone="danger">
              {t('sos.title')}
            </Text>
            <Button title="" variant="ghost" onPress={onClose} leftIcon={<X size={20} color={p.text} />} />
          </View>
          <Text variant="body" tone="secondary" style={{ marginBottom: spacing[6] }}>
            {t('sos.subtitle')}
          </Text>
          <Button
            title={t('sos.call', { number: emergencyNumber })}
            variant="destructive"
            size="lg"
            leftIcon={<Phone size={20} color="#fff" />}
            onPress={handleCall}
            fullWidth
          />
          <Button
            title={t('sos.share')}
            variant="secondary"
            size="lg"
            leftIcon={<Share2 size={20} color={p.text} />}
            onPress={handleShareLocation}
            style={{ marginTop: spacing[3] }}
            fullWidth
          />
          <Button
            title={t('sos.cancel')}
            variant="ghost"
            onPress={onClose}
            style={{ marginTop: spacing[2] }}
            fullWidth
          />
          <View style={[styles.hint, { borderColor: semantic.danger + '33' }]}>
            <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
              If you're in immediate danger, call emergency services first.
            </Text>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

function resolveEmergencyNumber(): string {
  try {
    // Prefer expo-localization's region code, fall back to "XX" → 112.
    const { getLocales } = require('expo-localization');
    const region: string | undefined = getLocales()?.[0]?.regionCode?.toUpperCase();
    if (!region) return '112';
    if (['US', 'CA', 'MX'].includes(region)) return '911';
    if (region === 'GB') return '999';
    return '112';
  } catch {
    return '112';
  }
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { marginTop: 18, paddingVertical: 10, borderTopWidth: 1 },
});

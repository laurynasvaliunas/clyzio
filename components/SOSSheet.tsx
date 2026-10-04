import React from 'react';
import { Modal, View, StyleSheet, Linking, Alert, Platform, Share } from 'react-native';
import * as Location from 'expo-location';
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
 *   - dials immediately — logging never delays the call;
 *   - asks for the current location permission (if missing) then opens the
 *     system share sheet with a map link the user can send to anyone;
 *   - records a `safety_incidents` row (in the background) so the team can
 *     follow up.
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
    // Dial first. The incident row is written in the background so a slow or
    // offline network can never hold up an emergency call.
    void logIncident();
    const url = Platform.OS === 'ios' ? `telprompt:${emergencyNumber}` : `tel:${emergencyNumber}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Call failed', `Dial ${emergencyNumber} manually.`);
    }
  };

  const handleShareLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission required', 'Enable location access to share your position.');
        return;
      }
      // A recent fix is good enough and instant; only wait for GPS without one.
      const loc =
        (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      const { latitude, longitude } = loc.coords;
      void logIncident(latitude, longitude);
      const url = `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
      // expo-sharing only shares local files; a URL needs the RN share sheet.
      await Share.share({ message: `I need help. My location: ${url}` });
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

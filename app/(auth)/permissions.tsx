import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Bell, Camera, Check, ChevronRight } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { PERMISSIONS_PRIMED_KEY, nextRouteAfterAuth } from '../../lib/permissionsPriming';
import { supabase } from '../../lib/supabase';

// After priming, continue the post-auth chain (→ first-run commute setup or Map).
async function routeOnward(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return await nextRouteAfterAuth(user.id);
  } catch {
    /* fall through */
  }
  return '/(tabs)';
}

/**
 * 1.1 — Permission priming screen.
 *
 * Shown once per device, after signup / first login (and after onboarding if
 * applicable). Replaces the previous flow where the OS-level prompts fired
 * silently from background code (push) or mid-trip (location), which Apple's
 * HIG explicitly discourages and which leaves the user without context if
 * they tap Don't Allow.
 *
 * Each card explains *why* we need the permission before triggering the OS
 * prompt. The user can `Skip` any card; permissions can always be granted
 * later from the system Settings, and the UI surfaces a small inline
 * indicator on screens that need a permission they don't have.
 *
 * Persistence: a `clyzio.permissionsPrimed` SecureStore key prevents this
 * screen from re-appearing on subsequent launches. Bump the key suffix
 * (e.g. `permissionsPrimed.v2`) to re-prompt all users on a major release.
 */

const COLORS = {
  primary: '#00565A',
  primaryDark: '#00565A',
  accent: '#F59E0B',
  dark: '#003D40',
  light: '#E6F1F2',
  background: '#F7F9FA',
  white: '#FFFFFF',
  gray: '#8B989C',
  grayDark: '#5A6A6F',
  green: '#059669',
};

type Status = 'idle' | 'granted' | 'denied';

type Step = 'location' | 'notifications' | 'camera';

const STEPS: Step[] = ['location', 'notifications', 'camera'];

export default function PermissionsScreen() {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [working, setWorking] = useState(false);
  const [statuses, setStatuses] = useState<Record<Step, Status>>({
    location: 'idle',
    notifications: 'idle',
    camera: 'idle',
  });

  // If a user somehow lands here after already priming (deep link, hard
  // refresh, etc.), bounce them to the tabs immediately. Cheap to check.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await SecureStore.getItemAsync(PERMISSIONS_PRIMED_KEY);
        if (!cancelled && v === '1') {
          router.replace((await routeOnward()) as any);
        }
      } catch {
        /* ignore — render the screen, worst case is one extra prime */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = async () => {
    try {
      await SecureStore.setItemAsync(PERMISSIONS_PRIMED_KEY, '1');
    } catch {
      /* non-fatal — user just sees the screen one more time */
    }
    router.replace((await routeOnward()) as any);
  };

  const advance = (nextStatus: Status) => {
    setStatuses((s) => ({ ...s, [STEPS[stepIdx]]: nextStatus }));
    if (stepIdx >= STEPS.length - 1) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  };

  const requestCurrent = async () => {
    if (working) return;
    setWorking(true);
    try {
      const step = STEPS[stepIdx];
      let status: Status = 'denied';
      if (step === 'location') {
        const res = await Location.requestForegroundPermissionsAsync();
        status = res.status === 'granted' ? 'granted' : 'denied';
      } else if (step === 'notifications') {
        // On Android the notifications permission only matters on 13+. We
        // still call this — Expo handles the version gate internally.
        const res = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        status = res.granted ? 'granted' : 'denied';
        if (status === 'granted' && Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#00565A',
          });
        }
      } else if (step === 'camera') {
        const res = await ImagePicker.requestCameraPermissionsAsync();
        status = res.status === 'granted' ? 'granted' : 'denied';
      }
      advance(status);
    } catch {
      // If any prompt errors we don't want to trap the user — treat it as
      // skipped and keep moving.
      advance('denied');
    } finally {
      setWorking(false);
    }
  };

  const skipCurrent = () => {
    if (working) return;
    advance('denied');
  };

  const skipAll = () => {
    if (working) return;
    finish();
  };

  const step = STEPS[stepIdx];
  const card = CARDS[step];
  const Icon = card.icon;

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.white]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.eyebrow}>How Clyzio works</Text>
        <Text style={styles.headline}>A few quick permissions</Text>
        <Text style={styles.subhead}>
          We&apos;ll only ask for what we need, and you can change your mind anytime from Settings.
        </Text>

        {/* Progress dots */}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === stepIdx && styles.dotActive, i < stepIdx && styles.dotDone]}
            />
          ))}
        </View>
      </View>

      {/* Card */}
      <View style={styles.cardWrap}>
        <View
          style={styles.card}
          accessibilityRole="summary"
          accessibilityLabel={`${card.title}. ${card.body}`}
        >
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.cardIcon}>
            <Icon size={32} color={COLORS.white} />
          </LinearGradient>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardBody}>{card.body}</Text>

          {/* Status chip if already decided this round */}
          {statuses[step] === 'granted' && (
            <View style={[styles.chip, styles.chipGranted]}>
              <Check size={14} color={COLORS.white} />
              <Text style={styles.chipText}>Granted</Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, working && { opacity: 0.6 }]}
          onPress={requestCurrent}
          activeOpacity={0.85}
          disabled={working}
          accessibilityRole="button"
          accessibilityLabel={`Allow ${card.title}`}
        >
          {working ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>{card.cta}</Text>
              <ChevronRight size={18} color={COLORS.white} />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={skipCurrent}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel={`Skip ${card.title} for now`}
        >
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={skipAll}
          style={styles.skipAllBtn}
          accessibilityRole="button"
          accessibilityLabel="Skip all permissions"
        >
          <Text style={styles.skipAllBtnText}>Skip all</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const CARDS: Record<Step, { title: string; body: string; cta: string; icon: typeof MapPin }> = {
  location: {
    title: 'Location',
    body: 'We use your location to find rides nearby and show your route on the map. We never sell or share location data.',
    cta: 'Enable location',
    icon: MapPin,
  },
  notifications: {
    title: 'Notifications',
    body: 'Get a heads-up when a match is found, when your ride is confirmed, or when your driver is on the way. You can fine-tune these later.',
    cta: 'Enable notifications',
    icon: Bell,
  },
  camera: {
    title: 'Camera',
    body: 'Add a profile photo so your matches can recognise you at the pickup point. Optional. You can use a default avatar instead.',
    cta: 'Enable camera',
    icon: Camera,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.dark,
    marginTop: 6,
  },
  subhead: {
    fontSize: 14,
    color: COLORS.grayDark,
    marginTop: 8,
    lineHeight: 20,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
  },
  dot: {
    height: 6,
    width: 28,
    borderRadius: 3,
    backgroundColor: 'rgba(38,198,218,0.18)',
  },
  dotActive: {
    backgroundColor: COLORS.primary,
  },
  dotDone: {
    backgroundColor: COLORS.green,
  },
  cardWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  cardIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.dark,
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 15,
    color: COLORS.grayDark,
    lineHeight: 22,
    textAlign: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 14,
  },
  chipGranted: {
    backgroundColor: COLORS.green,
  },
  chipText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    color: COLORS.grayDark,
    fontSize: 14,
    fontWeight: '600',
  },
  skipAllBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  skipAllBtnText: {
    color: COLORS.gray,
    fontSize: 12,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});

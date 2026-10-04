import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getPalette, brand, spacing } from '../../lib/theme/tokens';
import { supabase } from '../../lib/supabase';
import { Text } from '../../components/ui';
import { t } from '../../lib/i18n';
import { useToast } from '../../contexts/ToastContext';

type Prefs = {
  matches: boolean;
  chat: boolean;
  weekly_digest: boolean;
  marketing: boolean;
};

const DEFAULTS: Prefs = {
  matches: true,
  chat: true,
  weekly_digest: true,
  marketing: false,
};

/** Per-channel notification preferences — persisted to `profiles.notification_prefs`. */
export default function NotificationPrefsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const p = getPalette(isDark);
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  // DATA-LOSS GUARD: toggles stay hidden until the stored prefs have loaded.
  // Otherwise a failed read showed DEFAULTS and the first toggle wrote all of
  // them over the user's real choices.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadFailed(true);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user.id)
        .maybeSingle();
      if (error || !data) {
        setLoadFailed(true);
        return;
      }
      setPrefs({ ...DEFAULTS, ...(data.notification_prefs ?? {}) });
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (key: keyof Prefs, value: boolean) => {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = user
      ? await supabase.from('profiles').update({ notification_prefs: next }).eq('id', user.id)
      : { error: new Error('Not signed in') };
    if (error) {
      setPrefs(previous);
      showToast({
        title: "Couldn't save",
        message: 'Check your connection and try again.',
        type: 'error',
      });
    }
  };

  const rows: { key: keyof Prefs; labelKey: any }[] = [
    { key: 'matches', labelKey: 'settings.notifications.matches' },
    { key: 'chat', labelKey: 'settings.notifications.chat' },
    { key: 'weekly_digest', labelKey: 'settings.notifications.weekly' },
    { key: 'marketing', labelKey: 'settings.notifications.marketing' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.background }}>
      <View style={[styles.header, { borderBottomColor: p.border, backgroundColor: p.surface }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel={t('common.back')} hitSlop={8}>
          <ChevronLeft size={24} color={p.text} />
        </TouchableOpacity>
        <Text variant="heading">{t('settings.notifications')}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing[4] }}>
        {loading ? (
          <Text tone="secondary">{t('common.loading')}</Text>
        ) : loadFailed ? (
          <View style={[styles.row, { backgroundColor: p.surface, borderColor: p.border }]}>
            <Text style={{ flex: 1 }} tone="secondary">
              Couldn&apos;t load your notification settings.
            </Text>
            <TouchableOpacity
              onPress={load}
              accessibilityRole="button"
              accessibilityLabel="Retry loading notification settings"
              style={styles.retry}
            >
              <Text style={{ color: brand.primary, fontWeight: '700' }}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          rows.map((r) => (
            <View
              key={r.key}
              style={[styles.row, { backgroundColor: p.surface, borderColor: p.border }]}
            >
              <Text style={{ flex: 1 }}>{t(r.labelKey)}</Text>
              <Switch
                value={prefs[r.key]}
                onValueChange={(v) => update(r.key, v)}
                trackColor={{ false: p.border, true: brand.primary + '88' }}
                thumbColor={prefs[r.key] ? brand.primary : p.surface2}
              />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
});

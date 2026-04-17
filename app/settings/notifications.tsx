import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { getPalette, brand, spacing } from '../../lib/theme/tokens';
import { supabase } from '../../lib/supabase';
import { Text } from '../../components/ui';
import { t } from '../../lib/i18n';

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
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('id', user.id)
        .single();
      if (data?.notification_prefs) {
        setPrefs({ ...DEFAULTS, ...data.notification_prefs });
      }
      setLoading(false);
    })();
  }, []);

  const update = async (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('profiles').update({ notification_prefs: next }).eq('id', user.id);
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
});

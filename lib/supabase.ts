import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Hybrid storage adapter:
 *   - On native iOS/Android we persist the Supabase auth session in the device
 *     Keychain / Keystore via `expo-secure-store`. This keeps the refresh token
 *     out of plain-text `AsyncStorage` (which is readable on jailbroken /
 *     rooted devices and by device-level backups).
 *   - SecureStore has a ~2KB per-item limit; Supabase tokens are well under
 *     that, but we fall back to `AsyncStorage` if a write fails for any reason
 *     so the user does not get silently signed out.
 *   - On web (Expo web / storybook), SecureStore is unavailable, so we reuse
 *     `AsyncStorage` (localStorage under the hood).
 */
const isWeb = Platform.OS === 'web';

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return AsyncStorage.getItem(key);
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v !== null) return v;
      // migration: fall through to legacy AsyncStorage copy if present
      return AsyncStorage.getItem(key);
    } catch {
      return AsyncStorage.getItem(key);
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) return AsyncStorage.setItem(key, value);
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
      // clean up legacy copy so we don't keep two sources of truth
      AsyncStorage.removeItem(key).catch(() => undefined);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string): Promise<void> {
    if (isWeb) return AsyncStorage.removeItem(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {/* ignore */}
    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing — check .env file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

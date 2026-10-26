import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Storage for the Supabase auth session:
 *   - On native iOS/Android it lives in the device Keychain / Keystore via
 *     `expo-secure-store`, keeping the refresh token out of plain-text
 *     `AsyncStorage` (readable on jailbroken / rooted devices and in device
 *     backups).
 *   - SecureStore holds about 2 KB per item and the session (tokens + user)
 *     is larger, so it's split into chunks: `<key>.n` holds the count and
 *     `<key>.0`, `<key>.1`, … the parts. Earlier builds stored it whole under
 *     `<key>` (or in AsyncStorage when that failed); both are still read once
 *     and replaced on the next write.
 *   - If SecureStore fails we fall back to `AsyncStorage` rather than signing
 *     the user out silently.
 *   - On web (Expo web / storybook) SecureStore is unavailable, so it's
 *     `AsyncStorage` (localStorage under the hood).
 */

const CHUNK = 1800; // characters per item, under SecureStore's 2048-byte limit
const isWeb = Platform.OS === 'web';
const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function removeChunks(key: string): Promise<void> {
  const n = Number(await SecureStore.getItemAsync(`${key}.n`).catch(() => null));
  for (let i = 0; i < (Number.isFinite(n) ? n : 0); i++) {
    await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => undefined);
  }
  await SecureStore.deleteItemAsync(`${key}.n`).catch(() => undefined);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return AsyncStorage.getItem(key);
    try {
      const n = await SecureStore.getItemAsync(`${key}.n`);
      if (n !== null) {
        const parts: string[] = [];
        for (let i = 0; i < Number(n); i++) {
          const part = await SecureStore.getItemAsync(`${key}.${i}`);
          if (part === null) return null; // incomplete write: treat as signed out
          parts.push(part);
        }
        return parts.join('');
      }
      // Earlier builds: the whole value under the key, or in AsyncStorage.
      const whole = await SecureStore.getItemAsync(key);
      if (whole !== null) return whole;
      return AsyncStorage.getItem(key);
    } catch {
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) return AsyncStorage.setItem(key, value);
    try {
      await removeChunks(key);
      const count = Math.max(1, Math.ceil(value.length / CHUNK));
      for (let i = 0; i < count; i++) {
        await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), opts);
      }
      // The count goes last, so a half-finished write is never read back.
      await SecureStore.setItemAsync(`${key}.n`, String(count), opts);
      // Drop the older single-item and AsyncStorage copies.
      SecureStore.deleteItemAsync(key).catch(() => undefined);
      AsyncStorage.removeItem(key).catch(() => undefined);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) return AsyncStorage.removeItem(key);
    try {
      await removeChunks(key);
      await SecureStore.deleteItemAsync(key);
    } catch {/* ignore */}
    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { secureSessionStorage } from './secureSessionStorage';

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing - check .env file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keychain / Keystore, chunked (lib/secureSessionStorage).
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

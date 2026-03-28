import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Read from environment — .env must define EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl
  || process.env.EXPO_PUBLIC_SUPABASE_URL
  || '';

const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey
  || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing — check .env file');
}

// CRITICAL: Configure AsyncStorage for session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Expo environment variables
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl 
  || process.env.EXPO_PUBLIC_SUPABASE_URL 
  || 'https://qvevbbqcrizfywqexlkw.supabase.co';

const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey 
  || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY 
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2ZXZiYnFjcml6Znl3cWV4bGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDA4MDMsImV4cCI6MjA4MDI3NjgwM30.xxUFjg3RGvAcYkVvZzKxbWTG8MuAl0pX72fgTvaLhWI';

// CRITICAL: Configure AsyncStorage for session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

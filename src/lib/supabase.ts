import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { getSupabasePublicEnv } from '@/lib/supabase-env';

function createSupabaseClient(): SupabaseClient | null {
  const env = getSupabasePublicEnv();
  if (!env) {
    return null;
  }

  return createClient(env.url, env.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });
}

/**
 * Lazily-safe singleton. Null when EXPO_PUBLIC_SUPABASE_* is missing/malformed
 * so screens can fall back to the "not configured" placeholder without crashing.
 */
export const supabase = createSupabaseClient();

// Keep the session fresh while the app is foregrounded (native only).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

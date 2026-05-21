/**
 * Permission priming gate (1.1).
 *
 * Decides whether a user just past the login / onboarding flow should
 * land on the permissions priming screen (`/(auth)/permissions`) or skip
 * straight to the tabs. The flag is persisted in SecureStore so we only
 * prime once per device — we don't want to nag returning users every
 * time they reinstall the app or wipe storage less aggressively.
 *
 * Bumping the suffix on `PERMISSIONS_PRIMED_KEY` (e.g. `…v2`) is the
 * intentional way to re-prompt all users on a major release, e.g. when
 * we add a new permission category.
 */

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

export const PERMISSIONS_PRIMED_KEY = 'clyzio.permissionsPrimed.v1';

/** Where a brand-new user must finish setup before reaching the Map. */
export const COMMUTE_SETUP_ROUTE = '/(tabs)/profile?setup=1';

export async function hasPrimedPermissions(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(PERMISSIONS_PRIMED_KEY);
    return v === '1';
  } catch {
    // SecureStore failure → treat as not primed; worst case we show
    // the screen one extra time.
    return false;
  }
}

/**
 * First-run check: has this account completed the commute-baseline setup?
 * Reads the `profiles.commute_setup_done` flag. Tolerates the column being
 * absent (pre-migration) — returns `true` (i.e. "no gate") so the app never
 * blocks if the migration hasn't been applied yet.
 */
export async function hasCompletedCommuteSetup(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('commute_setup_done')
      .eq('id', userId)
      .single();
    if (error) return true; // column missing / query error → don't gate
    return (data as { commute_setup_done?: boolean } | null)?.commute_setup_done !== false;
  } catch {
    return true;
  }
}

/**
 * Single source of truth for where a just-authenticated user should go.
 * Returns the FIRST unsatisfied step, so every screen can call this when it
 * finishes and the chain advances:
 *   1. corporate onboarding (pick department)
 *   2. permission priming (first device)
 *   3. first-run commute setup (Profile, set baseline)  ← new
 *   4. the Map (tabs)
 *
 * Returning users (setup done, primed, dept set) resolve straight to `/(tabs)`.
 */
export async function nextRouteAfterAuth(userId: string): Promise<string> {
  // 1. Corporate onboarding — kept independent so a missing setup column can't
  //    break department routing.
  try {
    const { data } = await supabase
      .from('profiles')
      .select('company_id, department_id, is_solo_user')
      .eq('id', userId)
      .single();
    if (data?.company_id && !data?.department_id && !data?.is_solo_user) {
      return '/(auth)/onboarding';
    }
  } catch {
    /* fall through */
  }

  // 2. Permission priming (device-local).
  if (!(await hasPrimedPermissions())) return '/(auth)/permissions';

  // 3. First-run commute setup (account-level DB flag).
  if (!(await hasCompletedCommuteSetup(userId))) return COMMUTE_SETUP_ROUTE;

  // 4. Map.
  return '/(tabs)';
}

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

export const PERMISSIONS_PRIMED_KEY = 'clyzio.permissionsPrimed.v1';

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
 * Resolve the destination route after a successful login / onboarding step.
 * Pass the route the caller would normally use (`/(tabs)` or
 * `/(auth)/onboarding`) and we'll insert the priming step ahead of it
 * if appropriate.
 *
 * Onboarding always wins over priming — corporate users still need to
 * pick their team first; permissions get primed right after.
 */
export async function nextRouteAfterAuth(opts: {
  needsOnboarding: boolean;
}): Promise<'/(auth)/onboarding' | '/(auth)/permissions' | '/(tabs)'> {
  if (opts.needsOnboarding) return '/(auth)/onboarding';
  const primed = await hasPrimedPermissions();
  return primed ? '/(tabs)' : '/(auth)/permissions';
}

/**
 * Deep-link helpers.
 *
 * Canonical URL shapes:
 *   clyzio://ride/<id>        → opens a specific ride detail
 *   clyzio://profile/<id>     → opens a public profile
 *   clyzio://invite/<code>    → opens signup prefilled with a referral code
 *   https://clyzio.app/<…>    → universal link equivalent (same routes)
 *
 * Keep this module pure: no React imports — it's consumed by
 * `app/_layout.tsx` which handles the `Linking` event and routes accordingly.
 */

import * as Linking from 'expo-linking';

export type DeepLinkTarget =
  | { type: 'ride'; id: string }
  | { type: 'profile'; id: string }
  | { type: 'invite'; code: string }
  | { type: 'unknown'; url: string };

const APP_SCHEME = 'clyzio://';
const WEB_HOST = 'clyzio.app';

export function buildLink(t: Exclude<DeepLinkTarget, { type: 'unknown' }>): string {
  switch (t.type) {
    case 'ride': return `${APP_SCHEME}ride/${t.id}`;
    case 'profile': return `${APP_SCHEME}profile/${t.id}`;
    case 'invite': return `${APP_SCHEME}invite/${t.code}`;
  }
}

export function buildWebLink(t: Exclude<DeepLinkTarget, { type: 'unknown' }>): string {
  switch (t.type) {
    case 'ride': return `https://${WEB_HOST}/ride/${t.id}`;
    case 'profile': return `https://${WEB_HOST}/profile/${t.id}`;
    case 'invite': return `https://${WEB_HOST}/invite/${t.code}`;
  }
}

export function parseLink(url: string): DeepLinkTarget {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? '';
    const [head, tail] = path.split('/');
    if (!head || !tail) return { type: 'unknown', url };
    if (head === 'ride') return { type: 'ride', id: tail };
    if (head === 'profile') return { type: 'profile', id: tail };
    if (head === 'invite') return { type: 'invite', code: tail };
    return { type: 'unknown', url };
  } catch {
    return { type: 'unknown', url };
  }
}

/** Expo-router pathname for a deep-link target. */
export function toRoutePath(t: DeepLinkTarget): string | null {
  switch (t.type) {
    case 'ride': return `/trip/${t.id}`;
    case 'profile': return `/profile/${t.id}`;
    case 'invite': return `/(auth)/onboarding?ref=${encodeURIComponent(t.code)}`;
    default: return null;
  }
}

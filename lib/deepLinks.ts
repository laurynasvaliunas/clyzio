/**
 * Deep-link helpers.
 *
 * Canonical URL shapes:
 *   clyzio://ride/<id>        → opens a specific ride detail
 *   clyzio://profile/<id>     → opens a public profile
 *   clyzio://invite/<code>    → opens signup prefilled with a referral code
 *   clyzio://join/<token>     → company invite (also clyzio.com/join?token=…)
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
  | { type: 'join'; token: string }
  | { type: 'reset' }
  | { type: 'unknown'; url: string };

const APP_SCHEME = 'clyzio://';
const WEB_HOST = 'clyzio.app';

type ShareTarget = Extract<DeepLinkTarget, { type: 'ride' | 'profile' | 'invite' }>;

export function buildLink(t: ShareTarget): string {
  switch (t.type) {
    case 'ride':
      return `${APP_SCHEME}ride/${t.id}`;
    case 'profile':
      return `${APP_SCHEME}profile/${t.id}`;
    case 'invite':
      return `${APP_SCHEME}invite/${t.code}`;
  }
}

export function buildWebLink(t: ShareTarget): string {
  switch (t.type) {
    case 'ride':
      return `https://${WEB_HOST}/ride/${t.id}`;
    case 'profile':
      return `https://${WEB_HOST}/profile/${t.id}`;
    case 'invite':
      return `https://${WEB_HOST}/invite/${t.code}`;
  }
}

export function parseLink(url: string): DeepLinkTarget {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? '';
    const qp = (parsed.queryParams ?? {}) as Record<string, unknown>;
    const [head, tail] = path.split('/');
    // Password-recovery deep link has no tail (clyzio://reset-password#tokens…).
    if (head === 'reset-password') return { type: 'reset' };
    // Company invite: clyzio://join/<token> or https://clyzio.com/join?token=<token>.
    if (head === 'join') {
      const token = tail && tail.length > 0
        ? tail
        : (typeof qp.token === 'string' ? qp.token : '');
      return token ? { type: 'join', token } : { type: 'unknown', url };
    }
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
    case 'ride':
      return `/trip/${t.id}`;
    case 'profile':
      return `/profile/${t.id}`;
    case 'invite':
      return `/(auth)/onboarding?ref=${encodeURIComponent(t.code)}`;
    case 'join':
      return `/join?token=${encodeURIComponent(t.token)}`;
    case 'reset':
      return `/reset-password`;
    default:
      return null;
  }
}

/**
 * Push-notification → route dispatch table.
 *
 * Notifications carry a `data` payload (set when scheduling on the server).
 * The `screen` field selects a destination; supplementary fields (rideId,
 * code, etc.) are interpolated into the route. Returns `null` for unknown
 * screens — the caller should log a Sentry breadcrumb so we can detect
 * server-side typos or out-of-date clients.
 *
 * Why a table instead of a switch: easier to extend and grep, and a single
 * source of truth shared by the cold-start + warm-start notification paths.
 */
export type NotificationData = Record<string, unknown> | null | undefined;

export function notificationToRoute(data: NotificationData): string | null {
  if (!data || typeof data !== 'object') return null;
  const screen = typeof (data as any).screen === 'string' ? (data as any).screen : null;
  if (!screen) return null;

  const rideId = typeof (data as any).rideId === 'string' ? (data as any).rideId : null;
  const code = typeof (data as any).code === 'string' ? (data as any).code : null;

  switch (screen) {
    case 'daily-commute':
      return '/daily-commute';
    case 'trip-match':
    case 'trip':
      return rideId ? `/trip/${rideId}` : null;
    case 'chat':
      return rideId ? `/trip/${rideId}?openChat=1` : null;
    case 'rating':
      return rideId ? `/trip/${rideId}?openRating=1` : null;
    case 'invite':
      return code ? `/(auth)/onboarding?ref=${encodeURIComponent(code)}` : null;
    case 'notifications':
      return '/notifications';
    default:
      return null;
  }
}

/**
 * Hand-off between the root deep-link handler and the reset-password screen.
 *
 * A warm-start recovery link fires Linking's `url` event before
 * /reset-password mounts, so the screen used to miss the tokens and fall back
 * to "any existing session" — which, for a user already signed in as A who
 * taps B's reset link, changed A's password. The root layout now stashes the
 * link here, and the screen only accepts a session that came from the link
 * itself or from a PASSWORD_RECOVERY auth event.
 *
 * Kept in memory only: the URL carries one-time tokens.
 */
let pendingUrl: string | null = null;
let recoveryEventSeen = false;

export function stashRecoveryUrl(url: string): void {
  pendingUrl = url;
}

export function takeRecoveryUrl(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}

export function markRecoveryEvent(): void {
  recoveryEventSeen = true;
}

export function consumeRecoveryEvent(): boolean {
  const seen = recoveryEventSeen;
  recoveryEventSeen = false;
  return seen;
}

/** Strip query + fragment (tokens) before a URL goes to logs or Sentry. */
export function redactUrl(url: string): string {
  return url.split(/[?#]/)[0];
}

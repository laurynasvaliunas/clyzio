import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // Session Replay is DISABLED for v1.0: the default capture mode records
    // TextInput contents (home/work addresses, emails, phones) without PII
    // masking, which would contradict our App Privacy nutrition label.
    // Re-enable with explicit masking (Sentry.Mask wrappers or
    // `_experiments.mobileReplay = { maskAllText: true, maskAllImages: true }`)
    // and a privacy-label update in v1.1+. See security audit C3.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: __DEV__,
    environment: __DEV__ ? "development" : "production",
  });
}

/** Attach user context after login. Never include PII beyond opaque ID. */
export function setSentryUser(userId: string) {
  Sentry.setUser({ id: userId });
}

/** Clear user context on logout. */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Capture a handled error with optional context tags.
 * Use for errors that are caught but still need visibility.
 *
 * Example: captureError(err, { feature: "submit-trip-intent" });
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export { Sentry };

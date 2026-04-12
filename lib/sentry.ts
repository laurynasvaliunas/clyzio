import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export function initSentry() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
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

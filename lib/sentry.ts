/**
 * Sentry error monitoring initialisation.
 *
 * SETUP STEPS (one-time):
 * 1. Install:  npx expo install @sentry/react-native
 * 2. Run wizard (sets up native files + sentry.properties):
 *              npx @sentry/wizard@latest -i reactNative
 * 3. Add your DSN to .env:  EXPO_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/yyy
 * 4. Add to eas.json production build env:
 *      "production": { "env": { "EXPO_PUBLIC_SENTRY_DSN": "..." }, ... }
 * 5. Wrap your root _layout.tsx with Sentry.wrap() — see bottom of this file.
 */

import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

export function initSentry() {
  if (!DSN) return; // Skip in local dev if DSN not set

  Sentry.init({
    dsn: DSN,
    // Performance monitoring — captures 20% of transactions in production
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // Session replay — 10% of sessions in production
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0, // Always capture replay on crash
    debug: __DEV__,
    environment: __DEV__ ? "development" : "production",
    // Attach user context after login — call setUser() separately
  });
}

/**
 * Call after successful login to attach user context to all future events.
 * Never include PII beyond an opaque user ID.
 */
export function setSentryUser(userId: string) {
  Sentry.setUser({ id: userId });
}

/**
 * Clear user context on logout.
 */
export function clearSentryUser() {
  Sentry.setUser(null);
}

/**
 * Manually capture a non-fatal error with optional context.
 * Use this for handled errors you still want visibility on.
 *
 * Example:
 *   captureError(err, { feature: "submit-trip-intent", userId });
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

/**
 * Wrap your root component in app/_layout.tsx:
 *
 *   import { Sentry } from "@sentry/react-native";
 *   export default Sentry.wrap(RootLayout);
 *
 * This enables automatic JS error boundaries + native crash reporting.
 */

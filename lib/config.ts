/**
 * Centralized app configuration
 * Reads from environment variables — define EXPO_PUBLIC_MAPBOX_TOKEN in .env
 */

// Mapbox — public token read from .env
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';

/**
 * Validates that the Mapbox token is present and well-formed.
 * Public Mapbox tokens always start with `pk.` (secret tokens start with `sk.`
 * and must never be embedded in the client bundle).
 */
export const IS_MAPBOX_TOKEN_VALID =
  typeof MAPBOX_TOKEN === 'string' &&
  MAPBOX_TOKEN.length > 0 &&
  MAPBOX_TOKEN.startsWith('pk.');

if (!IS_MAPBOX_TOKEN_VALID) {
  // In production: surface to Sentry via the boundary, do NOT crash silently.
  // In development: warn loudly so the developer notices missing .env.
  // eslint-disable-next-line no-console
  console.warn(
    '[config] EXPO_PUBLIC_MAPBOX_TOKEN missing or malformed — maps will fall back to a placeholder UI. ' +
      'Set EXPO_PUBLIC_MAPBOX_TOKEN to a valid pk.* token in your .env or EAS secrets.'
  );
}

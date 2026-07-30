/**
 * Runs before Jest loads any test code - sets up __ExpoImportMetaRegistry
 * to prevent Expo 54 winter runtime from crashing Jest
 */
if (typeof globalThis !== "undefined") {
  Object.defineProperty(globalThis, "__ExpoImportMetaRegistry", {
    value: { url: "http://test" },
    enumerable: false,
    writable: true,
  });
}

// Give lib/config.ts a well-formed public Mapbox token. Without it
// IS_MAPBOX_TOKEN_VALID is false and app/(tabs)/index.tsx early-returns its
// "Map unavailable" placeholder, so tests never exercise the real map UI.
// Must live in setupFiles (not setupFilesAfterEach) — lib/config reads
// process.env at import time.
process.env.EXPO_PUBLIC_MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN || "pk.test-token-for-jest";

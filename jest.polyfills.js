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

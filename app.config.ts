import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Dynamic Expo config.
 *
 * Replaces the previous `app.json` for two reasons:
 *   1. The Mapbox download token can no longer be hard-coded to `sk.placeholder`
 *      — it now reads from the `MAPBOX_DOWNLOAD_TOKEN` env var at build time.
 *      (Public / in-app Mapbox usage still uses `EXPO_PUBLIC_MAPBOX_TOKEN`.)
 *   2. Supabase / Sentry / analytics keys are injected via `extra` so native
 *      code has them at runtime without baking secrets into source control.
 *
 * Permission arrays are deduplicated — the previous file listed
 * `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` and `remote-notification`
 * twice which produced a build warning on Android.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Clyzio',
  slug: 'clyzio',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  scheme: 'clyzio',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#006064',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.clyzio.app',
    buildNumber: '3',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Clyzio uses your location to show your position on the map, plan routes, and match you with nearby commuters.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'Clyzio uses your location in the background to track active trips and notify you of nearby carpool matches.',
      NSPhotoLibraryUsageDescription:
        'Clyzio needs access to your photo library to let you choose a profile picture.',
      NSCameraUsageDescription:
        'Clyzio needs camera access to let you take a profile picture.',
      UIBackgroundModes: ['location', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#006064',
    },
    edgeToEdgeEnabled: true,
    package: 'com.clyzio.app',
    versionCode: 1,
    permissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.VIBRATE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.RECORD_AUDIO',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      '@rnmapbox/maps',
      {
        // Secret, build-time token used to fetch native SDK artefacts.
        // Must NOT be committed — expose via EAS secret `MAPBOX_DOWNLOAD_TOKEN`.
        RNMAPBOX_MAPS_DOWNLOAD_TOKEN:
          process.env.MAPBOX_DOWNLOAD_TOKEN ?? '',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Clyzio uses your location to show your position on the map, plan routes, and match you with nearby commuters.',
        locationAlwaysAndWhenInUsePermission:
          'Clyzio uses your location in the background to track active trips and notify you of nearby carpool matches.',
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Clyzio needs access to your photo library to let you choose a profile picture.',
        cameraPermission:
          'Clyzio needs camera access to let you take a profile picture.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#26C6DA',
      },
    ],
  ],
  updates: {
    url: 'https://u.expo.dev/565dc638-6385-4dcf-885d-8abd3f0d9c30',
    fallbackToCacheTimeout: 0,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    router: {},
    eas: {
      projectId: '565dc638-6385-4dcf-885d-8abd3f0d9c30',
    },
    privacyPolicyUrl: 'https://www.clyzio.com/privacy',
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    mapboxPublicToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY,
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  },
  owner: 'laurynas.valiunas',
});

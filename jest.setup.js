// Jest setup - runs before each test file
// Mock expo winter runtime deps - prevents "import outside of scope" in Jest
jest.mock("expo/src/winter/ImportMetaRegistry", () => ({
  ImportMetaRegistry: { get url() { return "http://test"; } },
}));
jest.mock("@ungap/structured-clone", () => ({ default: (obj) => JSON.parse(JSON.stringify(obj)) }));

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

// Mock lib/supabase (relative to project root = clyzio/)
jest.mock("./lib/supabase", () => ({
  supabase: {
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: jest.fn().mockResolvedValue({
      data: { user: { id: "test-user-id", email: "test@test.com" } },
      error: null,
    }),
      signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: jest.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: jest.fn().mockImplementation((table) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        not: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        order: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      if (table === "rides") {
        const rideRow = {
          id: "test-ride-id",
          status: "scheduled",
          driver_id: "driver-1",
          rider_id: "rider-1",
          origin_lat: 37.77,
          origin_long: -122.42,
          dest_lat: 37.78,
          dest_long: -122.43,
          origin_address: "123 Test St",
          dest_address: "456 Test Ave",
          waypoints: null,
          transport_mode: "car_gas",
          transport_label: "Car",
          co2_saved: 0,
          scheduled_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
          created_at: new Date().toISOString(),
        };
        chain.single = jest.fn().mockResolvedValue({ data: rideRow, error: null });
        chain.limit = jest.fn().mockResolvedValue({ data: [rideRow], error: null });
      }
      if (table === "profiles") {
        chain.single = jest.fn().mockResolvedValue({
          data: { id: "driver-1", first_name: "Test", last_name: "Partner", avatar_url: null },
          error: null,
        });
      }
      return chain;
    }),
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    storage: { from: jest.fn().mockReturnValue({ upload: jest.fn().mockResolvedValue({}), getPublicUrl: jest.fn().mockReturnValue({ publicUrl: "https://mock" }) }) },
  },
}));

// Mock expo-router
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(tabs)"],
  // No-op: running on every render caused infinite loops; no-op keeps smoke tests stable
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: "test-id" }),
  Redirect: ({ href }) => null,
  Stack: { Screen: ({ children }) => children },
}));

// Mock @rnmapbox/maps — the map library this app actually uses.
// This block previously mocked `react-native-maps` (and
// `react-native-maps-directions`), neither of which is a dependency, so
// jest.setup.js threw "Cannot find module" before any test could load and
// ALL 14 suites failed with 0 tests run.
jest.mock("@rnmapbox/maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  const passthrough = (testID) => (props) =>
    React.createElement(View, { ...props, testID });
  const MockMapView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      getPointInView: jest.fn(),
      getCoordinateFromView: jest.fn(),
    }));
    return React.createElement(View, { ...props, testID: "mock-map-view" });
  });
  const MockCamera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      setCamera: jest.fn(),
      fitBounds: jest.fn(),
    }));
    return React.createElement(View, { ...props, testID: "mock-camera" });
  });
  return {
    __esModule: true,
    default: {
      setAccessToken: jest.fn(),
      StyleURL: { Street: "street", Dark: "dark" },
    },
    MapView: MockMapView,
    Camera: MockCamera,
    PointAnnotation: passthrough("mock-point-annotation"),
    MarkerView: passthrough("mock-marker-view"),
    ShapeSource: passthrough("mock-shape-source"),
    LineLayer: passthrough("mock-line-layer"),
    UserLocation: passthrough("mock-user-location"),
  };
});

// Mock expo-location
jest.mock("expo-location", () => ({
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 37.77, longitude: -122.42 } }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  Accuracy: { Balanced: 3 },
}));

// Mock expo-linear-gradient
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: (props) => require("react").createElement(View, { ...props, testID: "linear-gradient" }) };
});

// Mock @react-navigation/native for useFocusEffect
jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb) => (typeof cb === "function" ? cb() : undefined),
}));

// Mock react-native-safe-area-context
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Mock expo-image-picker
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
  MediaTypeOptions: { Images: "Images" },
}));

// Mock DateTimePicker
jest.mock("@react-native-community/datetimepicker", () => ({ default: () => null }));

// Mock expo-haptics
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 1, Medium: 2 },
  NotificationFeedbackType: { Success: 0, Warning: 1, Error: 2 },
}));

// Mock AsyncStorage for ThemeContext
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-notifications
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: "denied" }),
  getExpoPushTokenAsync: jest.fn().mockRejectedValue(new Error("Not in Expo Go")),
}));

// Mock expo-device
jest.mock("expo-device", () => ({ isDevice: false }));

// (react-native-google-places-autocomplete was mocked here but is not a
// dependency — address entry uses the in-house components/AddressInput backed
// by the Mapbox geocoding API. Mocking a missing module threw at setup.)

// Mock the toast context so screen tests don't each need a ToastProvider
// wrapper. Screens call `useToast()` at the top level, which throws outside a
// provider — that was failing most suites once they started running again.
jest.mock("./contexts/ToastContext", () => {
  const React = require("react");
  return {
    __esModule: true,
    ToastProvider: ({ children }) => children,
    useToast: () => ({ showToast: jest.fn(), hideToast: jest.fn() }),
  };
});

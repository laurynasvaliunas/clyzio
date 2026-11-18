import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Bottom padding for a sheet or bar that sits on the bottom edge of a Modal.
 *
 * With edge-to-edge on (app.config.ts), React Native 0.81 draws every Android
 * Modal under the navigation bar, so a fixed padding leaves the sheet's last
 * row behind it: 48 dp with 3-button navigation, about 24 dp with gestures.
 * Android gets at least the bar's height plus `gap`; iOS keeps `base` as is.
 */
export function sheetBottomPadding(os: string, base: number, insetBottom: number, gap = 16): number {
  return os === "android" ? Math.max(base, insetBottom + gap) : base;
}

export function useSheetBottomPadding(base: number, gap = 16): number {
  const { bottom } = useSafeAreaInsets();
  return sheetBottomPadding(Platform.OS, base, bottom, gap);
}

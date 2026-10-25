import React, { forwardRef } from "react";
import type { ScrollView } from "react-native";
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewProps } from "react-native-keyboard-controller";

/**
 * The app's scroll container for any screen with text fields: the focused
 * field always scrolls into view above the keyboard (iOS and Android,
 * edge-to-edge included), taps on buttons still register while typing, and
 * dragging the content down tucks the keyboard away.
 *
 * Screens whose fields open a suggestion list underneath (addresses) pass a
 * larger `bottomOffset` — see ADDRESS_FIELD_OFFSET — so the list fits too.
 */

/** Room below a focused address field for its suggestion list (max ~200 pt). */
export const ADDRESS_FIELD_OFFSET = 240;

export const KeyboardScroll = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(function KeyboardScroll(
  { bottomOffset = 24, keyboardShouldPersistTaps = "handled", keyboardDismissMode = "interactive", ...rest },
  ref,
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      {...rest}
    />
  );
});

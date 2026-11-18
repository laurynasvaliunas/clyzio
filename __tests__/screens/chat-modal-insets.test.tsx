import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { render, screen } from "../utils/test-utils";
import ChatModal from "../../components/ChatModal";
import { supabase } from "../../lib/supabase";

// Android draws every Modal under the navigation bar (edge-to-edge), so the
// message box has to sit above it: a 3-button bar is 48 dp tall and used to
// cover most of the box. iOS keeps the 32 it always had.

const sb = supabase as any;
const keyboardState = useKeyboardState as jest.Mock;

beforeAll(() => {
  sb.channel = jest.fn(() => {
    const ch: Record<string, jest.Mock> = {};
    ch.on = jest.fn(() => ch);
    ch.subscribe = jest.fn(() => ch);
    return ch;
  });
  sb.removeChannel = jest.fn();
});

afterEach(() => {
  delete (globalThis as any).__safeAreaInsets;
});

function inputBarPadding(): number {
  render(<ChatModal visible onClose={jest.fn()} thread={{ rideId: "ride-1" }} currentUserId="me" partnerName="Rasa" />);
  return StyleSheet.flatten(screen.getByTestId("chat-input-bar").props.style).paddingBottom;
}

describe("Chat message box and the system bars", () => {
  it("keeps iOS at 32", () => {
    (globalThis as any).__safeAreaInsets = { bottom: 34 };
    expect(inputBarPadding()).toBe(32);
  });

  describe("on Android", () => {
    let os: jest.ReplaceProperty<typeof Platform.OS>;
    beforeEach(() => {
      os = jest.replaceProperty(Platform, "OS", "android");
    });
    afterEach(() => os.restore());

    it("sits above a 3-button navigation bar", () => {
      (globalThis as any).__safeAreaInsets = { bottom: 48 };
      expect(inputBarPadding()).toBe(56);
    });

    it("sits above the gesture bar", () => {
      (globalThis as any).__safeAreaInsets = { bottom: 24 };
      expect(inputBarPadding()).toBe(32);
    });

    it("drops the extra space while the keyboard is up (the keyboard already sits above the bar)", () => {
      (globalThis as any).__safeAreaInsets = { bottom: 48 };
      const state = { isVisible: true, height: 300 };
      keyboardState.mockImplementation((selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state));
      try {
        expect(inputBarPadding()).toBe(12);
      } finally {
        const closed = { isVisible: false, height: 0 };
        keyboardState.mockImplementation((selector?: (s: typeof closed) => unknown) => (selector ? selector(closed) : closed));
      }
    });
  });
});

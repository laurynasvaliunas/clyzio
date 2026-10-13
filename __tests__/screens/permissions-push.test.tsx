import React from "react";
import * as Notifications from "expo-notifications";
import { render, fireEvent, waitFor } from "../utils/test-utils";
import PermissionsScreen from "../../app/(auth)/permissions";
import { registerAndSavePushToken } from "../../lib/pushToken";

// The sign-in registration in the root layout runs before this screen grants
// notification permission, so the token must be saved here — otherwise no
// carpool push ever reaches the device.
jest.mock("../../lib/pushToken", () => ({
  registerAndSavePushToken: jest.fn().mockResolvedValue("ExponentPushToken[test]"),
}));

const requestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const register = registerAndSavePushToken as jest.Mock;

async function pressThroughToNotifications(screen: ReturnType<typeof render>) {
  // Step 1: location (mocked as granted) → advances to notifications.
  fireEvent.press(await screen.findByRole("button", { name: /Continue to the/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Continue to the/ })).toBeTruthy());
  // Step 2: notifications.
  fireEvent.press(screen.getByRole("button", { name: /Continue to the/ }));
}

describe("Permissions screen — push token", () => {
  beforeEach(() => {
    register.mockClear();
    requestPermissions.mockClear();
  });

  it("saves the push token right after notifications are allowed", async () => {
    requestPermissions.mockResolvedValueOnce({ granted: true, status: "granted" });
    const screen = render(<PermissionsScreen />);
    await pressThroughToNotifications(screen);
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
  });

  it("does not register when notifications are declined", async () => {
    requestPermissions.mockResolvedValueOnce({ granted: false, status: "denied" });
    const screen = render(<PermissionsScreen />);
    await pressThroughToNotifications(screen);
    await waitFor(() => expect(requestPermissions).toHaveBeenCalled());
    expect(register).not.toHaveBeenCalled();
  });
});

import React from "react";
import { render, fireEvent } from "../utils/test-utils";
import SettingsIndex from "../../app/settings/index";
import EditProfileScreen from "../../app/settings/edit-profile";

// Settings → My Places / My Garage open Profile at that section, and the
// account row (and the screen it opens) is called "Profile".

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ section: "garage" }),
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));

afterEach(() => mockPush.mockReset());

describe("Settings - profile sections", () => {
  it("opens My Places and My Garage at their sections", () => {
    const { getByLabelText } = render(<SettingsIndex />);

    fireEvent.press(getByLabelText("My Places - edit your home and work addresses"));
    expect(mockPush).toHaveBeenLastCalledWith("/settings/edit-profile?section=places");

    fireEvent.press(getByLabelText("My Garage - add or edit your vehicles"));
    expect(mockPush).toHaveBeenLastCalledWith("/settings/edit-profile?section=garage");
  });

  it("calls the account row and its screen Profile", () => {
    const { getByText, queryByText } = render(<SettingsIndex />);
    expect(getByText("Profile")).toBeTruthy();
    expect(queryByText("Edit Profile")).toBeNull();

    const screen = render(<EditProfileScreen />);
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.queryByText("Edit Profile")).toBeNull();
  });
});

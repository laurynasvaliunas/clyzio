import React from "react";
import { fireEvent, render, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(auth)"],
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
  Redirect: ({ href }: { href: string }) => null,
  Stack: { Screen: ({ children }: { children: React.ReactNode }) => children },
}));

import LoginScreen from "../../app/(auth)/login";

describe("Login Flow Integration", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
  });

  it("Login → navigates to tabs when sign-in succeeds and onboarding not needed", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: {
        session: { user: { id: "user-1", email: "test@corp.com" } },
        user: { id: "user-1", email: "test@corp.com" },
      },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { company_id: "c1", department_id: "d1", is_solo_user: false },
        error: null,
      }),
    });

    const { getByTestId, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId("login-email"), "test@corp.com");
    fireEvent.changeText(getByTestId("login-password"), "password123");
    fireEvent.press(getByText("Sign In"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
    });
  });

  it("Login → navigates to onboarding when corporate user has no department", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      data: {
        session: { user: { id: "user-2", email: "new@corp.com" } },
        user: { id: "user-2", email: "new@corp.com" },
      },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { company_id: "c1", department_id: null, is_solo_user: false },
        error: null,
      }),
    });

    const { getByTestId, getByText } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId("login-email"), "new@corp.com");
    fireEvent.changeText(getByTestId("login-password"), "password123");
    fireEvent.press(getByText("Sign In"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/onboarding");
    });
  });
});

import React from "react";
import { fireEvent, render, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import { PERMISSIONS_PRIMED_KEY } from "../../lib/permissionsPriming";

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

/**
 * These assert the real post-login routing chain in
 * lib/permissionsPriming.nextRouteAfterAuth(), which resolves the FIRST
 * unsatisfied step:
 *   1. corporate onboarding  (company, no department, not solo, not skipped)
 *   2. permission priming    (device-local flag in SecureStore)
 *   3. commute setup         (profiles.commute_setup_done)
 *   4. the Map
 *
 * The earlier version of this file predated steps 2-3 and asserted a straight
 * jump to /(tabs), so it failed once priming existed.
 */

/** Seed the profile row that nextRouteAfterAuth() reads. */
function mockProfile(row: Record<string, unknown>) {
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: row, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
  });
}

function mockSignInSuccess(id: string, email: string) {
  (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
    data: { session: { user: { id, email } }, user: { id, email } },
    error: null,
  });
}

function signIn(email: string) {
  const { getByTestId, getByText } = render(<LoginScreen />);
  fireEvent.changeText(getByTestId("login-email"), email);
  fireEvent.changeText(getByTestId("login-password"), "password123");
  fireEvent.press(getByText("Sign In"));
}

describe("Login Flow Integration", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    (globalThis as any).__secureStore?.clear();
  });

  it("routes a corporate user with no department to onboarding", async () => {
    // Step 1 wins even before priming.
    mockSignInSuccess("user-2", "new@corp.com");
    mockProfile({ company_id: "c1", department_id: null, is_solo_user: false });

    signIn("new@corp.com");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/onboarding");
    });
  });

  it("routes to permission priming on a fresh device", async () => {
    // Step 1 satisfied (has a department) → step 2 is the first gap.
    mockSignInSuccess("user-1", "test@corp.com");
    mockProfile({ company_id: "c1", department_id: "d1", is_solo_user: false });

    signIn("test@corp.com");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(auth)/permissions");
    });
  });

  it("routes to commute setup once permissions are primed but setup is unfinished", async () => {
    (globalThis as any).__secureStore.set(PERMISSIONS_PRIMED_KEY, "1");
    mockSignInSuccess("user-3", "setup@corp.com");
    mockProfile({
      company_id: "c1",
      department_id: "d1",
      is_solo_user: false,
      commute_setup_done: false,
    });

    signIn("setup@corp.com");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/setup/profile");
    });
  });

  it("routes straight to the tabs when every gate is satisfied", async () => {
    (globalThis as any).__secureStore.set(PERMISSIONS_PRIMED_KEY, "1");
    mockSignInSuccess("user-4", "done@corp.com");
    mockProfile({
      company_id: "c1",
      department_id: "d1",
      is_solo_user: false,
      commute_setup_done: true,
    });

    signIn("done@corp.com");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
    });
  });

  it("honours department_prompt_skipped so 'Skip for now' is not a dead end", async () => {
    // Regression guard: before migration 040 this state re-routed to
    // /(auth)/onboarding forever, making Skip a no-op for invited users.
    (globalThis as any).__secureStore.set(PERMISSIONS_PRIMED_KEY, "1");
    mockSignInSuccess("user-5", "skipped@corp.com");
    mockProfile({
      company_id: "c1",
      department_id: null,
      is_solo_user: false,
      department_prompt_skipped: true,
      commute_setup_done: true,
    });

    signIn("skipped@corp.com");

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
    });
  });
});

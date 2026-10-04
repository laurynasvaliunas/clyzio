import React from "react";
import { render, screen, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import { stashRecoveryUrl } from "../../lib/recoveryLink";
import ResetPasswordScreen from "../../app/reset-password";

jest.mock("expo-linking", () => ({
  getInitialURL: jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

/**
 * The reset screen used to accept ANY existing session: someone signed in as
 * A who opened B's reset link (or an expired one) was offered a password
 * change — for account A.
 */
describe("ResetPasswordScreen", () => {
  beforeEach(() => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "account-a" } } },
      error: null,
    });
    (supabase.auth as any).setSession = jest.fn().mockResolvedValue({ error: null });
  });

  it("does not treat an ordinary signed-in session as a password recovery", async () => {
    render(<ResetPasswordScreen />);

    await waitFor(() => {
      expect(screen.getByText(/This reset link is invalid or has expired/)).toBeTruthy();
    });
    expect(screen.queryByPlaceholderText("At least 6 characters")).toBeNull();
  });

  it("uses the link's own tokens even when another account is signed in", async () => {
    stashRecoveryUrl("clyzio://reset-password#access_token=tok-b&refresh_token=ref-b&type=recovery");

    render(<ResetPasswordScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("At least 6 characters")).toBeTruthy();
    });
    expect((supabase.auth as any).setSession).toHaveBeenCalledWith({
      access_token: "tok-b",
      refresh_token: "ref-b",
    });
  });
});

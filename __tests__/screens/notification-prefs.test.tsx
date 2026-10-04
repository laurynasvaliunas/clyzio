import React from "react";
import { render, screen, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import NotificationPrefsScreen from "../../app/settings/notifications";

/**
 * When the stored preferences fail to load, the toggles must not appear: they
 * used to show DEFAULTS, and the first tap wrote all of them over the user's
 * real choices.
 */
describe("NotificationPrefsScreen", () => {
  it("shows a retry instead of default toggles when the load fails", async () => {
    const update = jest.fn().mockReturnThis();
    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: self,
        update,
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: "offline" } }),
      });
      return chain;
    });

    render(<NotificationPrefsScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn.t load your notification settings/)).toBeTruthy();
    });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

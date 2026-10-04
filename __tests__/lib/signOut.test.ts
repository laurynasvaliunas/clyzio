import { supabase } from "../../lib/supabase";
import { rememberDevicePushToken, signOut } from "../../lib/signOut";

/**
 * Sign-out must detach this device from push. The token used to survive
 * sign-out, so the next person on the phone kept receiving the previous
 * user's carpool and chat notifications.
 */
describe("signOut", () => {
  let updates: Record<string, unknown>[];
  let eqs: [string, unknown][];

  beforeEach(() => {
    updates = [];
    eqs = [];
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });
    (supabase.auth.signOut as jest.Mock).mockClear();
    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.update = (payload: Record<string, unknown>) => {
        updates.push(payload);
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        eqs.push([col, val]);
        return chain;
      };
      return chain;
    });
  });

  it("clears this device's push token, then signs out", async () => {
    rememberDevicePushToken("ExponentPushToken[abc]");

    await signOut();

    expect(updates).toEqual([{ expo_push_token: null }]);
    // Scoped to this device's token so another phone's newer registration survives.
    expect(eqs).toEqual([
      ["id", "user-1"],
      ["expo_push_token", "ExponentPushToken[abc]"],
    ]);
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out when this device never registered a token", async () => {
    rememberDevicePushToken(null);

    await signOut();

    expect(updates).toEqual([]);
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out when clearing the token fails", async () => {
    rememberDevicePushToken("ExponentPushToken[abc]");
    (supabase.from as jest.Mock).mockImplementation(() => {
      throw new Error("offline");
    });

    await signOut();

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

import React from "react";
import { fireEvent, render, screen, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import MapScreen from "../../app/(tabs)";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(tabs)"],
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
  Stack: { Screen: ({ children }: { children: React.ReactNode }) => children },
}));

describe("Plan Trip Flow Integration", () => {
  beforeEach(() => {
    // The shared jest.setup mock returns a *scheduled* ride for the `rides`
    // table, which puts the Map into its active-trip state and unmounts the
    // idle CommuteHomeCard. This flow is about the idle state, so give the
    // screen a user with nothing planned.
    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        update: self,
        insert: self,
        delete: self,
        eq: self,
        in: self,
        or: self,
        gte: self,
        lte: self,
        neq: self,
        not: self,
        order: self,
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      });
      return chain;
    });
  });

  // The trigger moved: the old "Where to today?" search bar was replaced by
  // CommuteHomeCard, whose no-plan state offers "Plan your ride". The modal it
  // opens still titles itself "Plan your route".
  it("opens TripPlannerModal from the commute card CTA", async () => {
    render(<MapScreen />);

    const cta = await waitFor(() => screen.getByText("Plan your ride"));
    fireEvent.press(cta);

    await waitFor(() => {
      expect(screen.getByText("Plan your route")).toBeTruthy();
    });
  });
});

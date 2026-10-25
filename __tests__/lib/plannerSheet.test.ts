import { plannerSheetSize } from "../../components/TripPlannerModal";

// The Plan-your-route sheet used to keep its 85 % height with the keyboard up,
// which pushed the address fields under the status bar.
describe("plannerSheetSize", () => {
  it("uses 85 % of the window (max 92 %) without a keyboard", () => {
    expect(plannerSheetSize(800, 0, 47)).toEqual({ fixedHeight: 680, maxHeight: 736 });
  });

  it("fits between the status bar and the keyboard while typing", () => {
    // iPhone SE: 667 pt window, 260 pt keyboard, 20 pt status bar.
    const { fixedHeight, maxHeight } = plannerSheetSize(667, 260, 20);
    expect(maxHeight).toBe(667 - 260 - 20 - 8);
    expect(fixedHeight).toBe(maxHeight);
    expect(fixedHeight + 260 + 20).toBeLessThanOrEqual(667);
  });
});

import { sheetBottomPadding } from "../../lib/sheetInsets";

// Android draws every Modal under the navigation bar (edge-to-edge), so a
// sheet's bottom padding must clear the bar; iOS keeps what it had.
describe("sheetBottomPadding", () => {
  it("keeps iOS exactly as it was, home indicator or not", () => {
    expect(sheetBottomPadding("ios", 40, 34)).toBe(40);
    expect(sheetBottomPadding("ios", 24, 0)).toBe(24);
  });

  it("clears Android's 3-button navigation bar (48 dp)", () => {
    expect(sheetBottomPadding("android", 40, 48)).toBe(64);
    expect(sheetBottomPadding("android", 24, 48)).toBe(64);
  });

  it("keeps the sheet's own padding when it already clears gesture navigation", () => {
    expect(sheetBottomPadding("android", 40, 24)).toBe(40);
    expect(sheetBottomPadding("android", 24, 0)).toBe(24);
  });

  it("takes a custom gap", () => {
    expect(sheetBottomPadding("android", 12, 48, 8)).toBe(56);
  });
});

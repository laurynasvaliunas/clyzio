import { decodePolyline } from "../../lib/polyline";

describe("decodePolyline", () => {
  it("decodes Google's reference example, as [lng, lat]", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("decodes a short city hop with 5-decimal precision", () => {
    // Vilnius: 54.68720,25.27970 → 54.68890,25.27000.
    const line = decodePolyline("_bxlIcmhyCsIr{@");
    expect(line).toHaveLength(2);
    expect(line[0][0]).toBeCloseTo(25.2797, 5);
    expect(line[0][1]).toBeCloseTo(54.6872, 5);
    expect(line[1][0]).toBeCloseTo(25.27, 5);
    expect(line[1][1]).toBeCloseTo(54.6889, 5);
  });

  it("returns an empty line for missing or broken input", () => {
    expect(decodePolyline(null)).toEqual([]);
    expect(decodePolyline(undefined)).toEqual([]);
    expect(decodePolyline("")).toEqual([]);
    // Cut off in the middle of a number.
    expect(decodePolyline("_p~iF~ps|U_ulL")).toEqual([]);
    // Characters outside the format.
    expect(decodePolyline("not a polyline!")).toEqual([]);
  });
});

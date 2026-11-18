import {
  addressSearchUrl,
  getAddressSearchBias,
  rankAddressFeatures,
  searchAddresses,
  setAddressSearchBias,
} from "../../lib/addressSearch";

const VILNIUS = { lat: 54.6872, lng: 25.2797 };

/** A Mapbox geocoding feature, as the API returns it. */
function feature(placeName: string, lng: number, lat: number, relevance = 1, country = "lt") {
  return {
    id: `address.${placeName}`,
    place_name: placeName,
    relevance,
    center: [lng, lat],
    geometry: { type: "Point", coordinates: [lng, lat] },
    context: [{ id: "country.1", short_code: country }],
  };
}

// What Mapbox really answered for "Ozo 25" before this change (15 Nov 2026).
const OZO_WORLDWIDE = [
  feature("大蔵, 253-0104, 寒川町, 高座郡, Kanagawa, Japan", 139.38, 35.37, 1, "jp"),
  feature("Ozo 25, 6941 Durbuy, Luxembourg, Belgium", 5.52, 50.35, 1, "be"),
  feature("Ozo G. 25, Vilnius 07150, Lithuania", 25.26, 54.71),
  feature("Ozo G. 25, Domeikava 54340, Kaunas District, Lithuania", 23.93, 54.96),
  feature("Odo Xhacka 25, 7009 Devoll, Albania", 20.9, 40.6, 0.92, "al"),
];

describe("rankAddressFeatures", () => {
  it("drops namesakes on other continents when something nearby matches", () => {
    const rows = rankAddressFeatures(OZO_WORLDWIDE, VILNIUS);
    expect(rows.map((r) => r.place_name)).toEqual([
      "Ozo G. 25, Vilnius 07150, Lithuania",
      "Ozo G. 25, Domeikava 54340, Kaunas District, Lithuania",
    ]);
  });

  it("drops near-misses of a different street", () => {
    const rows = rankAddressFeatures(
      [
        feature("Ozo g. 25, Vilnius 07150, Lithuania", 25.26, 54.71, 1),
        feature("Oro Parko g. 25, Karmėlava 54462, Lithuania", 24.08, 54.97, 0.92),
        feature("Oto Bismarko g. 25, Rusnė 99346, Lithuania", 21.37, 55.3, 0.92),
      ],
      VILNIUS,
    );
    expect(rows.map((r) => r.title)).toEqual(["Ozo g. 25"]);
  });

  it("keeps the best matches when the text has a typo and nothing is exact", () => {
    const rows = rankAddressFeatures(
      [
        feature("Gedimino pr. 9, Vilnius 01103, Lithuania", 25.28, 54.69, 0.9),
        feature("Gedimino g. 9, Trakai 21110, Lithuania", 24.93, 54.64, 0.88),
        feature("Gedvydžių g. 9, Vilnius 06313, Lithuania", 25.21, 54.73, 0.6),
      ],
      VILNIUS,
    );
    expect(rows.map((r) => r.title)).toEqual(["Gedimino pr. 9", "Gedimino g. 9"]);
  });

  it("still offers far matches when nothing nearby matches", () => {
    const rows = rankAddressFeatures(
      [feature("Savannah, Georgia, United States", -81.09, 32.08, 1, "us")],
      VILNIUS,
    );
    expect(rows.map((r) => r.title)).toEqual(["Savannah"]);
  });

  it("without a known point, keeps the country most matches are in", () => {
    const rows = rankAddressFeatures(OZO_WORLDWIDE, null);
    expect(rows.map((r) => r.subtitle)).toEqual([
      "Vilnius 07150, Lithuania",
      "Domeikava 54340, Kaunas District, Lithuania",
    ]);
  });

  it("without a known point and no common country, keeps what there is", () => {
    const rows = rankAddressFeatures(
      [
        feature("Akropolis, 7008 Devoll, Albania", 20.9, 40.6, 1, "al"),
        feature("Akropolishof, 1448 GA Purmerend, Netherlands", 4.95, 52.5, 1, "nl"),
        feature("Ακρόπολις, Famagusta, Cyprus", 33.9, 35.1, 1, "cy"),
      ],
      null,
    );
    expect(rows).toHaveLength(3);
  });

  it("splits a row into street and town, removes repeats and shows five at most", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      feature(`Žalgirio g. 90, Town ${i} 0930${i}, Lithuania`, 25.2 + i * 0.01, 54.7));
    const rows = rankAddressFeatures(
      [feature("Vilnius, Lithuania", 25.28, 54.69), feature("vilnius, lithuania", 25.28, 54.69), ...many],
      VILNIUS,
    );
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ title: "Vilnius", subtitle: "Lithuania", coordinates: [25.28, 54.69] });
    expect(rows[1]).toMatchObject({ title: "Žalgirio g. 90", subtitle: "Town 0 09300, Lithuania" });
  });

  it("ignores broken features", () => {
    expect(rankAddressFeatures(null, VILNIUS)).toEqual([]);
    expect(rankAddressFeatures([{}, { place_name: "No coordinates" }, { place_name: "", center: [1, 1] }], VILNIUS)).toEqual([]);
  });
});

describe("addressSearchUrl", () => {
  it("asks only for matches around a known point, nearest first", () => {
    const url = addressSearchUrl("Ozo 25", VILNIUS, "local", "pk.test");
    expect(url).toContain("/mapbox.places/Ozo%2025.json");
    expect(url).toContain("types=address,place,locality,neighborhood");
    expect(url).toContain("proximity=25.28,54.69");
    const [w, s, e, n] = (/bbox=([^&]+)/.exec(url)?.[1] ?? "").split(",").map(Number);
    // Roughly 400 km each way: all of Lithuania, not the next continent.
    expect(w).toBeLessThan(21);
    expect(e).toBeGreaterThan(27);
    expect(s).toBeGreaterThan(50);
    expect(n).toBeLessThan(59);
  });

  it("sends the point rounded to about a kilometre, never the exact home", () => {
    const url = addressSearchUrl("Ozo", { lat: 54.687157, lng: 25.279652 }, "wide", "pk.test");
    expect(url).toContain("proximity=25.28,54.69");
    expect(url).not.toContain("54.687");
    expect(url).not.toContain("bbox");
  });

  it("falls back to the network location when no point is known", () => {
    const url = addressSearchUrl("Ozo", null, "wide", "pk.test");
    expect(url).toContain("proximity=ip");
    expect(url).not.toContain("bbox");
  });
});

describe("searchAddresses", () => {
  const fetchMock = jest.fn();
  const answer = (features: unknown[]) => Promise.resolve({ ok: true, json: () => Promise.resolve({ features }) });

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    setAddressSearchBias(null);
  });

  it("doesn't search for fewer than three characters", async () => {
    expect(await searchAddresses("Oz")).toEqual([]);
    expect(await searchAddresses("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches around the remembered home with one request", async () => {
    setAddressSearchBias(VILNIUS);
    fetchMock.mockReturnValueOnce(answer([feature("Ozo g. 25, Vilnius 07150, Lithuania", 25.26, 54.71)]));
    const rows = await searchAddresses("Ozo 25");
    expect(rows.map((r) => r.title)).toEqual(["Ozo g. 25"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("bbox=");
  });

  it("searches around the trip's other end when the field gives one", async () => {
    setAddressSearchBias(VILNIUS);
    fetchMock.mockReturnValueOnce(answer([feature("Laisvės al. 1, Kaunas 44238, Lithuania", 23.92, 54.9)]));
    await searchAddresses("Laisves", { near: { lat: 54.9, lng: 23.9 } });
    expect(fetchMock.mock.calls[0][0]).toContain("proximity=23.9,54.9");
  });

  it("widens the search when nothing nearby matches", async () => {
    setAddressSearchBias(VILNIUS);
    fetchMock
      .mockReturnValueOnce(answer([]))
      .mockReturnValueOnce(answer([feature("Berlin, Germany", 13.4, 52.52, 1, "de")]));
    const rows = await searchAddresses("Berlin");
    expect(rows.map((r) => r.place_name)).toEqual(["Berlin, Germany"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).not.toContain("bbox=");
    expect(fetchMock.mock.calls[1][0]).toContain("proximity=25.28,54.69");
  });

  it("uses the network location when nothing is remembered", async () => {
    fetchMock.mockReturnValueOnce(answer(OZO_WORLDWIDE));
    const rows = await searchAddresses("Ozo 25");
    expect(fetchMock.mock.calls[0][0]).toContain("proximity=ip");
    expect(rows).toHaveLength(2);
  });

  it("returns no suggestions when the request fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await searchAddresses("Ozo 25")).toEqual([]);
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, json: () => Promise.resolve({ message: "Not Authorized" }) }));
    expect(await searchAddresses("Ozo 25")).toEqual([]);
  });
});

describe("setAddressSearchBias", () => {
  beforeEach(() => setAddressSearchBias(null));

  it("keeps the saved home when a location fix arrives later", () => {
    setAddressSearchBias(VILNIUS);
    setAddressSearchBias({ lat: 40.7, lng: -74 }, { onlyIfUnset: true });
    expect(getAddressSearchBias()).toEqual(VILNIUS);
  });

  it("takes a location fix when nothing is known yet, and ignores unusable points", () => {
    setAddressSearchBias({ lat: Number.NaN, lng: 25 });
    setAddressSearchBias({ lat: 0, lng: 0 });
    expect(getAddressSearchBias()).toBeNull();
    setAddressSearchBias({ lat: 54.9, lng: 23.9 }, { onlyIfUnset: true });
    expect(getAddressSearchBias()).toEqual({ lat: 54.9, lng: 23.9 });
  });

  it("forgets the point on sign-out", () => {
    setAddressSearchBias(VILNIUS);
    setAddressSearchBias(null);
    expect(getAddressSearchBias()).toBeNull();
  });
});

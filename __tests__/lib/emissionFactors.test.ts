import { MODE_FACTORS, FUEL_FACTORS, modeKgPerKm } from "../../lib/emissionFactors";
import { FUEL_CO2_FACTORS, MODES, MOTO_CO2, ESCOOTER_CO2, TRANSIT_CO2_FACTORS, getTransitCO2 } from "../../lib/commuteUtils";
import { TRANSPORT_OPTIONS } from "../../components/CommuteMixEditor";

// One set of cited emission factors (migration 055): the app, the server's
// ride CO₂ (transport_mode_catalog / emission_factor) and clyzio.com's ESG
// inventory must use the same numbers. supabase/tests/app_web_alignment.sql
// checks the database side against these same values.

const CITED_MODES: Record<string, number> = {
  walking: 0,
  bike: 0,
  nomotor: 0,
  ebike: 0.005,
  public: 0.097,
  carpool: 0.096,
  wfh: 0,
  taxi: 0.12,
  moto: 0.103,
  my_car: 0.192,
};

const CITED_FUELS: Record<string, number> = {
  petrol: 0.192,
  diesel: 0.171,
  hybrid: 0.11,
  phev: 0.075,
  electric: 0.047,
  lpg: 0.162,
  hydrogen: 0.02,
  cng: 0.157,
};

describe("emission factors", () => {
  it("are the cited set the server and the website use", () => {
    expect(Object.fromEntries(Object.entries(MODE_FACTORS).map(([k, v]) => [k, v.kgPerKm]))).toEqual(CITED_MODES);
    expect(Object.fromEntries(Object.entries(FUEL_FACTORS).map(([k, v]) => [k, v.kgPerKm]))).toEqual(CITED_FUELS);
    for (const f of [...Object.values(MODE_FACTORS), ...Object.values(FUEL_FACTORS)]) {
      expect(f.source).toBeTruthy();
    }
  });

  it("are the only numbers the app's mode lists use", () => {
    expect(FUEL_CO2_FACTORS).toEqual(CITED_FUELS);
    expect(MOTO_CO2).toBe(modeKgPerKm("moto"));
    expect(ESCOOTER_CO2).toBe(modeKgPerKm("ebike"));
    for (const m of MODES) {
      expect(m.co2PerKm).toBe(CITED_MODES[m.id]);
    }
    const byId = Object.fromEntries(TRANSPORT_OPTIONS.map((o) => [o.id, o.co2]));
    expect(byId).toMatchObject({
      public: 0.097,
      car_gas: 0.192,
      car_diesel: 0.171,
      car_hybrid: 0.11,
      car_electric: 0.047,
      ebike: 0.005,
      taxi: 0.12,
      moto_gas: 0.103,
      walking: 0,
      bike: 0,
      nomotor: 0,
      wfh: 0,
    });
  });

  it("use the EEA 2023 transit values the server credits (migration 060)", () => {
    // Same numbers as supabase/functions/transit-routes/transit.ts and the
    // emission_factor rows; supabase/tests/transit_submode.sql checks those.
    expect(TRANSIT_CO2_FACTORS).toEqual({ bus: 0.097, trolleybus: 0.029, tram: 0.029, subway: 0.028, rail: 0.035 });
    expect(getTransitCO2("tram")).toBe(0.029);
    expect(getTransitCO2("ferry")).toBe(0.097);
    expect(getTransitCO2(null)).toBe(0.097);
  });
});

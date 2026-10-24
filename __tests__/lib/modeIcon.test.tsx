import { modeIconFor } from "../../components/ModeIcon";
import {
  BikeIcon,
  CarIcon,
  EbikeIcon,
  MotorcycleIcon,
  NoMotorIcon,
  PublicTransportIcon,
  TaxiIcon,
  WalkingIcon,
} from "../../components/icons/TransportIcons";

describe("modeIconFor", () => {
  it.each([
    // ride transport_mode values written by the trip planner
    ["public", PublicTransportIcon],
    ["my_car", CarIcon],
    ["bike", BikeIcon],
    ["ebike", EbikeIcon],
    ["walking", WalkingIcon],
    ["taxi", TaxiIcon],
    ["moto", MotorcycleIcon],
    ["nomotor", NoMotorIcon],
    // commute-mix ids
    ["car_gas", CarIcon],
    ["car_electric", CarIcon],
    ["moto_gas", MotorcycleIcon],
    // garage vehicle types
    ["bicycle", BikeIcon],
    ["escooter", EbikeIcon],
    ["motorcycle", MotorcycleIcon],
  ])("%s uses the designer pictogram", (mode, icon) => {
    expect(modeIconFor(mode)).toBe(icon);
  });

  it("falls back to a neutral icon for unknown modes", () => {
    const fallback = modeIconFor("hovercraft");
    expect(fallback).toBe(modeIconFor(null));
    expect([PublicTransportIcon, CarIcon, BikeIcon, NoMotorIcon]).not.toContain(fallback);
  });
});

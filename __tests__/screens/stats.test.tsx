import React from "react";
import { render } from "../utils/test-utils";
import StatsScreen from "../../app/(tabs)/stats";

describe("StatsScreen", () => {
  it("renders without crashing", () => {
    expect(() => render(<StatsScreen />)).not.toThrow();
  });
});

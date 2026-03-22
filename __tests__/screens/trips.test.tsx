import React from "react";
import { render } from "../utils/test-utils";
import TripsScreen from "../../app/(tabs)/trips";

describe("TripsScreen", () => {
  it("renders without crashing", () => {
    expect(() => render(<TripsScreen />)).not.toThrow();
  });
});

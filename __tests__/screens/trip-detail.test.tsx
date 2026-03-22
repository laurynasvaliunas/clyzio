import React from "react";
import { render } from "../utils/test-utils";
import TripScreen from "../../app/trip/[id]";

describe("TripScreen", () => {
  it("renders without crashing", () => {
    expect(() => render(<TripScreen />)).not.toThrow();
  });
});

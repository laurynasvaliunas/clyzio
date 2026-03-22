import React from "react";
import { render } from "../utils/test-utils";
import MapScreen from "../../app/(tabs)/index";

describe("MapScreen", () => {
  it("renders without crashing", () => {
    expect(() => render(<MapScreen />)).not.toThrow();
  });
});

import React from "react";
import { render } from "../utils/test-utils";
import ActivityScreen from "../../app/(tabs)/activity";

describe("ActivityScreen", () => {
  it("renders without crashing", () => {
    const { getByText } = render(<ActivityScreen />);
    expect(getByText("My Commutes")).toBeTruthy();
    expect(getByText("Upcoming")).toBeTruthy();
  });
});

import React from "react";
import { render } from "../utils/test-utils";
import ActivityScreen from "../../app/(tabs)/activity";

describe("ActivityScreen", () => {
  it("renders the header and both tabs", () => {
    const { getByText } = render(<ActivityScreen />);
    expect(getByText("Activity")).toBeTruthy();
    expect(getByText("Upcoming")).toBeTruthy();
    expect(getByText("History")).toBeTruthy();
  });
});

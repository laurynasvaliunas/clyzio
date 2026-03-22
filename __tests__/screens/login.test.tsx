import React from "react";
import { render, screen } from "../utils/test-utils";
import LoginScreen from "../../app/(auth)/login";

describe("LoginScreen", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<LoginScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it("shows corporate ride-sharing subtitle", () => {
    render(<LoginScreen />);
    expect(screen.getByText(/Corporate ride-sharing/)).toBeTruthy();
  });
});

import React from "react";
import { render, screen } from "../utils/test-utils";
import LoginScreen from "../../app/(auth)/login";

describe("LoginScreen", () => {
  it("renders without crashing", () => {
    const { toJSON } = render(<LoginScreen />);
    expect(toJSON()).toBeTruthy();
  });

  // Assert on the controls, not on marketing copy — the subtitle has already
  // been reworded twice and a copy edit shouldn't fail the suite.
  it("renders the sign-in form", () => {
    render(<LoginScreen />);
    expect(screen.getByTestId("login-email")).toBeTruthy();
    expect(screen.getByTestId("login-password")).toBeTruthy();
    expect(screen.getByText("Sign In")).toBeTruthy();
  });
});

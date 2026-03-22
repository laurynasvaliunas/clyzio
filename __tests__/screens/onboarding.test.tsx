import React from "react";
import { render } from "../utils/test-utils";
import OnboardingScreen from "../../app/(auth)/onboarding";

describe("OnboardingScreen", () => {
  it("renders without crashing", () => {
    expect(() => render(<OnboardingScreen />)).not.toThrow();
  });
});

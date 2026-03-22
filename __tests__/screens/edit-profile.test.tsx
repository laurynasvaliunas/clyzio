import React from "react";
import { render } from "../utils/test-utils";
import EditProfileScreen from "../../app/settings/edit-profile";

describe("EditProfileScreen", () => {
  it("renders without crashing", () => {
    expect(() => render(<EditProfileScreen />)).not.toThrow();
  });
});

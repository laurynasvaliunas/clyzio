import React from "react";
import { render } from "../utils/test-utils";
import SettingsIndex from "../../app/settings/index";

describe("SettingsIndex", () => {
  it("renders without crashing", () => {
    expect(() => render(<SettingsIndex />)).not.toThrow();
  });
});

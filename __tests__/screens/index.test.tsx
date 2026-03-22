import React from "react";
import { render } from "../utils/test-utils";
import Index from "../../app/index";

describe("Index (Redirect)", () => {
  it("renders without crashing", () => {
    expect(() => render(<Index />)).not.toThrow();
  });
});

import React, { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react-native";
import { ThemeProvider } from "../../contexts/ThemeContext";

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, {
    wrapper: AllTheProviders,
    ...options,
  });
}

export * from "@testing-library/react-native";
export { customRender as render };

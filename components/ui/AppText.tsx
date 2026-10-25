import React, { forwardRef } from "react";
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

/**
 * Drop-in `Text` / `TextInput` that set Clyzio's rounded font (Nunito).
 *
 * Custom fonts don't change weight through `fontWeight` (Android fakes bold,
 * iOS ignores it), so the weight a style asks for picks the matching Nunito
 * file instead. A style that sets its own `fontFamily` (e.g. monospace) is
 * left alone. Screens import these instead of react-native's — same props,
 * same refs, same types.
 */
const FAMILY: Record<string, string> = {
  "100": "Nunito_200ExtraLight",
  "200": "Nunito_200ExtraLight",
  "300": "Nunito_300Light",
  "400": "Nunito_400Regular",
  normal: "Nunito_400Regular",
  "500": "Nunito_500Medium",
  "600": "Nunito_600SemiBold",
  "700": "Nunito_700Bold",
  bold: "Nunito_700Bold",
  "800": "Nunito_800ExtraBold",
  "900": "Nunito_900Black",
};

export function withAppFont(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return style;
  const weight = String(flat.fontWeight ?? "400");
  const family =
    flat.fontStyle === "italic"
      ? // Only two italics ship: regular and semibold.
        Number(weight) >= 600 || weight === "bold"
        ? "Nunito_600SemiBold_Italic"
        : "Nunito_400Regular_Italic"
      : (FAMILY[weight] ?? FAMILY["400"]);
  return [
    style,
    {
      fontFamily: family,
      fontWeight: "normal",
      fontStyle: "normal",
    },
  ];
}

export const Text = forwardRef<RNText, TextProps>(function AppText({ style, ...rest }, ref) {
  return <RNText ref={ref} {...rest} style={withAppFont(style)} />;
});
export type Text = RNText;

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function AppTextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} {...rest} style={withAppFont(style)} />;
});
export type TextInput = RNTextInput;

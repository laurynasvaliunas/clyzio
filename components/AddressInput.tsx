import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform, Animated } from "react-native";
import { GooglePlacesAutocomplete } from "react-native-google-places-autocomplete";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";

const GOOGLE_MAPS_API_KEY = "AIzaSyAaQG2TsYZO_Ibp9sohoNS1XS-1DZ7UPwg";

const COLORS = {
  primary: "#26C6DA",  // Unified Cyan (Phase 27)
  accent: "#FDD835",
  accentDark: "#F9A825",
  dark: "#006064",
  white: "#FFFFFF",
  gray: "#90A4AE",
  grayLight: "#F1F5F9",
  grayDark: "#334155",
  slate800: "#1E293B",
  slate700: "#334155",
  red: "#EF4444",
};

interface AddressInputProps {
  placeholder: string;
  value?: string;
  onPress?: (data: any, details: any) => void;
  onClear?: () => void;
  isGoogle?: boolean;
  zIndex?: number;
  icon?: React.ReactNode;
  theme?: "default" | "accent";
  showClearButton?: boolean;
  isDark?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  listViewDisplayed?: boolean;
}

export default function AddressInput({
  placeholder,
  value,
  onPress,
  onClear,
  isGoogle = true,
  zIndex = 100,
  icon,
  theme = "default",
  showClearButton = false,
  isDark = false,
  onFocus,
  onBlur,
  listViewDisplayed,
}: AddressInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  // Theme-aware colors
  const bgColor = isDark
    ? theme === "accent"
      ? COLORS.accent + "15"
      : COLORS.slate700
    : theme === "accent"
    ? COLORS.accent + "15"
    : COLORS.grayLight;

  const textColor = isDark ? COLORS.white : COLORS.dark;
  const borderColor = theme === "accent" ? COLORS.accent : isFocused ? COLORS.primary : "transparent";

  const handleFocus = () => {
    setIsFocused(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onFocus) onFocus();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (onBlur) onBlur();
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onClear) onClear();
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  };

  const inputStyles = {
    container: { flex: 1, zIndex: zIndex },
    textInput: {
      height: 48,
      backgroundColor: bgColor,
      borderRadius: 12,
      paddingHorizontal: 16,
      fontSize: 15,
      color: textColor,
      borderWidth: isFocused ? 2 : 1,
      borderColor: borderColor,
      ...(isFocused && {
        shadowColor: COLORS.primary,
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        elevation: 4,
      }),
    },
    listView: {
      backgroundColor: isDark ? COLORS.slate800 : COLORS.white,
      borderRadius: 12,
      marginTop: 4,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 8,
      elevation: 8,
      position: "absolute" as const,
      top: 52,
      left: 0,
      right: 0,
      zIndex: zIndex + 9000,
      maxHeight: 250,
    },
    row: { paddingVertical: 12, paddingHorizontal: 16 },
    description: { fontSize: 14, color: textColor },
  };

  return (
    <Animated.View 
      style={[
        styles.container, 
        { zIndex, transform: [{ scale: scaleAnim }] }
      ]}
      onTouchStart={handlePressIn}
      onTouchEnd={handlePressOut}
    >
      {/* Icon */}
      {icon && <View style={styles.iconBox}>{icon}</View>}

      {/* Input */}
      {isGoogle ? (
        <GooglePlacesAutocomplete
          placeholder={placeholder}
          onPress={(data, details) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (onPress) onPress(data, details);
          }}
          query={{ key: GOOGLE_MAPS_API_KEY, language: "en" }}
          fetchDetails
          styles={inputStyles}
          textInputProps={{
            placeholderTextColor: COLORS.gray,
            returnKeyType: "next",
            value,
            onFocus: handleFocus,
            onBlur: handleBlur,
          }}
          enablePoweredByContainer={false}
          disableScroll={true}
          listViewDisplayed={listViewDisplayed}
        />
      ) : (
        <TextInput
          style={[
            styles.textInput, 
            { 
              backgroundColor: bgColor, 
              color: textColor,
              borderWidth: isFocused ? 2 : 1,
              borderColor: borderColor,
            }
          ]}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      )}

      {/* Clear Button */}
      {showClearButton && onClear && value && (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <X size={16} color={COLORS.gray} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.grayLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  clearBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.grayLight,
    borderRadius: 8,
    marginLeft: 8,
  },
});


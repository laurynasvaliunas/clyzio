import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
} from "react-native";
import { Text, TextInput } from "./ui/AppText";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { searchAddresses, type AddressSuggestion, type LatLng } from "../lib/addressSearch";
import { elevation as ELEVATION } from "../lib/theme/tokens";

const COLORS = {
  primary: "#007C89",
  accent: "#F59E0B",
  accentDark: "#F59E0B",
  dark: "#0B2540",
  white: "#FFFFFF",
  gray: "#8B989C",
  grayLight: "#EEF6F7",
  grayDark: "#5B6B7A",
  slate800: "#0B2540",
  slate700: "#5B6B7A",
  red: "#DC2626",
};

type Suggestion = AddressSuggestion;

interface AddressInputProps {
  placeholder: string;
  value?: string;
  onPress?: (data: any, details: any) => void;
  onChangeText?: (text: string) => void;
  onClear?: () => void;
  isGoogle?: boolean; // kept for API compat — ignored, always uses Mapbox
  zIndex?: number;
  icon?: React.ReactNode;
  theme?: "default" | "accent";
  showClearButton?: boolean;
  isDark?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  listViewDisplayed?: boolean;
  /** Search around this point (e.g. the trip's other end) instead of the saved home. */
  near?: LatLng | null;
}

export default function AddressInput({
  placeholder,
  value,
  onPress,
  onChangeText,
  onClear,
  zIndex = 100,
  icon,
  theme = "default",
  showClearButton = false,
  isDark = false,
  onFocus,
  onBlur,
  near,
}: AddressInputProps) {
  const [query, setQuery] = useState(value ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the latest search may fill the list: an answer for earlier text, or
  // one that arrives after a pick, a clear or leaving the field, is dropped.
  const searchSeq = useRef(0);
  const cancelSearch = () => {
    searchSeq.current += 1;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
  };
  useEffect(() => cancelSearch, []);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Keep the input in sync if the parent resets/loads `value` asynchronously
  // (e.g. profile finishes loading, or an external clear). Without this, the
  // input mirrors only the initial mount value and goes stale.
  useEffect(() => {
    if (value !== undefined && value !== query) setQuery(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const bgColor = isDark
    ? theme === "accent" ? COLORS.accent + "15" : COLORS.slate700
    : theme === "accent" ? COLORS.accent + "15" : COLORS.grayLight;

  const textColor = isDark ? COLORS.white : COLORS.dark;
  const borderColor = theme === "accent" ? COLORS.accent : isFocused ? COLORS.primary : "transparent";

  const fetchSuggestions = useCallback(async (text: string) => {
    const seq = ++searchSeq.current;
    const found = await searchAddresses(text, { near });
    if (seq === searchSeq.current) setSuggestions(found);
  }, [near]);

  const handleChangeText = (text: string) => {
    setQuery(text);
    // Surface every keystroke to the parent so typed addresses are captured
    // even when the user never selects a Mapbox suggestion. Without this,
    // plain typing stays trapped in local state and the parent saves null.
    onChangeText?.(text);
    cancelSearch();
    debounceTimer.current = setTimeout(() => fetchSuggestions(text), 350);
  };

  const handleSelect = (item: Suggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cancelSearch();
    setQuery(item.place_name);
    setSuggestions([]);
    if (onPress) {
      // Match shape expected by Google Places consumers: (data, details)
      onPress(
        { description: item.place_name },
        {
          geometry: {
            location: {
              lat: item.coordinates[1],
              lng: item.coordinates[0],
            },
          },
          formatted_address: item.place_name,
        }
      );
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onFocus) onFocus();
  };

  const handleBlur = () => {
    setIsFocused(false);
    cancelSearch();
    // Small delay so tap on suggestion registers before list hides
    setTimeout(() => setSuggestions([]), 150);
    if (onBlur) onBlur();
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    cancelSearch();
    setQuery("");
    setSuggestions([]);
    if (onClear) onClear();
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true, friction: 8 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  };

  return (
    <Animated.View
      style={[styles.container, { zIndex, transform: [{ scale: scaleAnim }] }]}
      onTouchStart={handlePressIn}
      onTouchEnd={handlePressOut}
    >
      {icon && <View style={styles.iconBox}>{icon}</View>}

      <View style={{ flex: 1 }}>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: bgColor,
              color: textColor,
              borderWidth: isFocused ? 2 : 1,
              borderColor,
              ...(isFocused && {
                boxShadow: ELEVATION.light.e3,
              }),
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray}
          value={query}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          returnKeyType="search"
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="fullStreetAddress"
          autoComplete="street-address"
        />

        {suggestions.length > 0 && (
          <ScrollView
            style={[styles.suggestionList, { zIndex: zIndex + 9000 }]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {suggestions.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.suggestionRow}
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={item.place_name}
              >
                <Text style={[styles.suggestionText, { color: COLORS.dark }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!!item.subtitle && (
                  <Text style={styles.suggestionSubtext} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {showClearButton && onClear && query.length > 0 && (
        <TouchableOpacity hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={styles.clearBtn} onPress={handleClear}>
          <X size={16} color={COLORS.gray} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.grayLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 6,
  },
  textInput: {
    height: 48,
    borderRadius: 15,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  suggestionList: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderRadius: 15,
    maxHeight: 250,
    boxShadow: ELEVATION.light.e2,
  },
  suggestionRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  suggestionText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  suggestionSubtext: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.grayDark,
    marginTop: 1,
  },
  clearBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.grayLight,
    borderRadius: 8,
    marginLeft: 8,
    marginTop: 8,
  },
});

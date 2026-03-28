import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Animated,
  ScrollView,
} from "react-native";
import { X } from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { MAPBOX_TOKEN } from "../lib/config";

const COLORS = {
  primary: "#26C6DA",
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

interface Suggestion {
  id: string;
  place_name: string;
  coordinates: [number, number]; // [lng, lat]
}

interface AddressInputProps {
  placeholder: string;
  value?: string;
  onPress?: (data: any, details: any) => void;
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
}

export default function AddressInput({
  placeholder,
  value,
  onPress,
  onClear,
  zIndex = 100,
  icon,
  theme = "default",
  showClearButton = false,
  isDark = false,
  onFocus,
  onBlur,
}: AddressInputProps) {
  const [query, setQuery] = useState(value ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const bgColor = isDark
    ? theme === "accent" ? COLORS.accent + "15" : COLORS.slate700
    : theme === "accent" ? COLORS.accent + "15" : COLORS.grayLight;

  const textColor = isDark ? COLORS.white : COLORS.dark;
  const borderColor = theme === "accent" ? COLORS.accent : isFocused ? COLORS.primary : "transparent";

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?access_token=${MAPBOX_TOKEN}&limit=5&types=address,place,locality,neighborhood`;
      const res = await fetch(url);
      const json = await res.json();
      setSuggestions(
        (json.features ?? []).map((f: any) => ({
          id: f.id,
          place_name: f.place_name,
          coordinates: f.geometry.coordinates as [number, number],
        }))
      );
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(text), 350);
  };

  const handleSelect = (item: Suggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    // Small delay so tap on suggestion registers before list hides
    setTimeout(() => setSuggestions([]), 150);
    if (onBlur) onBlur();
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                shadowColor: COLORS.primary,
                shadowOpacity: 0.2,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
                elevation: 4,
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
              >
                <Text
                  style={[styles.suggestionText, { color: isDark ? COLORS.white : textColor }]}
                  numberOfLines={2}
                >
                  {item.place_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {showClearButton && onClear && query.length > 0 && (
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
    alignItems: "flex-start",
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
    marginTop: 6,
  },
  textInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  suggestionList: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    maxHeight: 250,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
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

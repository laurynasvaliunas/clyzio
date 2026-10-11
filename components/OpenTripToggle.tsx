import { View, Text, Switch, StyleSheet } from "react-native";
import { Users } from "lucide-react-native";
import { brand, editorial } from "../lib/theme/tokens";

/**
 * Employees only: open this ride/drive to commuters outside their company
 * (trip_intents.open_to_independents, migration 045). Off by default — only
 * colleagues can match unless the employee turns this on for the trip.
 */
export default function OpenTripToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.card}>
      <Users size={22} color={brand.primary} />
      <View style={styles.text}>
        <Text style={styles.title}>Open to commuters outside my company</Text>
        <Text style={styles.body}>
          Independent Clyzio commuters on your route can match with this trip too.
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: editorial.paper2, true: brand.primary }}
        accessibilityLabel="Open to commuters outside my company"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: editorial.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: editorial.paper2,
    padding: 14,
    marginBottom: 14,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: editorial.ink,
  },
  body: {
    fontSize: 12,
    lineHeight: 16,
    color: editorial.ink3,
  },
});

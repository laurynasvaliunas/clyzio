import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingDown, Fuel, ParkingCircle, Leaf } from "lucide-react-native";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#00ACC1",
  dark: "#006064",
  white: "#FFFFFF",
  gray: "#90A4AE",
  green: "#4CAF50",
  accent: "#FDD835",
};

interface CostSavingsCardProps {
  totalCo2Saved: number;      // kg
  tripsCompleted: number;
  baselineCo2: number;        // kg/km — user's car baseline
  avgDistanceKm?: number;     // default 15km one-way
  workingDaysPerMonth?: number; // default 22
}

/**
 * Estimates monthly cost savings from green commuting.
 *
 * Methodology:
 *  - Fuel saved = km avoided × fuel consumption × fuel cost per litre
 *  - km avoided = trips where CO2 was saved vs driving alone
 *  - Parking saved = green commute days × avg daily parking cost
 */
export default function CostSavingsCard({
  totalCo2Saved,
  tripsCompleted,
  baselineCo2 = 0.192,
  avgDistanceKm = 15,
  workingDaysPerMonth = 22,
}: CostSavingsCardProps) {
  // Approximate km avoided based on CO2 saved vs baseline
  const kmAvoided = baselineCo2 > 0 ? totalCo2Saved / baselineCo2 : 0;

  // Fuel cost: avg EU ~1.80 EUR/L, avg consumption 7L/100km
  const fuelCostPerKm = 1.80 * 0.07;
  const fuelSavedTotal = kmAvoided * fuelCostPerKm;

  // Rough monthly estimate (assume trips_completed spreads over ~3 months)
  const monthsActive = Math.max(1, tripsCompleted / workingDaysPerMonth / 2);
  const fuelSavedMonthly = fuelSavedTotal / monthsActive;

  // Parking: assume ~40% of green trips replaced a car commute with parking
  const parkingCostPerDay = 8.0;
  const greenDaysPerMonth = (tripsCompleted / monthsActive) * 0.4;
  const parkingSavedMonthly = greenDaysPerMonth * parkingCostPerDay;

  const totalMonthlySaving = Math.round(fuelSavedMonthly + parkingSavedMonthly);
  const totalAllTimeSaving = Math.round(fuelSavedTotal + greenDaysPerMonth * monthsActive * parkingCostPerDay);

  if (tripsCompleted === 0 || totalCo2Saved === 0) return null;

  return (
    <LinearGradient
      colors={["#E8F5E9", "#C8E6C9"]}
      style={styles.card}
    >
      <View style={styles.header}>
        <TrendingDown size={20} color={COLORS.green} />
        <Text style={styles.title}>Your Green Savings</Text>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalValue}>~€{totalMonthlySaving}</Text>
        <Text style={styles.totalLabel}>estimated per month</Text>
      </View>

      <View style={styles.breakdownRow}>
        <View style={styles.breakdownItem}>
          <Fuel size={14} color={COLORS.green} />
          <Text style={styles.breakdownText}>
            €{Math.round(fuelSavedMonthly)} fuel
          </Text>
        </View>
        <View style={styles.breakdownItem}>
          <ParkingCircle size={14} color={COLORS.green} />
          <Text style={styles.breakdownText}>
            €{Math.round(parkingSavedMonthly)} parking
          </Text>
        </View>
      </View>

      <View style={styles.allTimeRow}>
        <Leaf size={13} color={COLORS.green} />
        <Text style={styles.allTimeText}>
          All-time estimated savings:{" "}
          <Text style={styles.allTimeHighlight}>~€{totalAllTimeSaving}</Text>
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.dark,
  },
  totalRow: {
    alignItems: "center",
    marginBottom: 14,
  },
  totalValue: {
    fontSize: 40,
    fontWeight: "900",
    color: COLORS.green,
  },
  totalLabel: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginBottom: 12,
  },
  breakdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  breakdownText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.dark,
  },
  allTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  allTimeText: {
    fontSize: 12,
    color: COLORS.gray,
  },
  allTimeHighlight: {
    fontWeight: "bold",
    color: COLORS.green,
  },
});

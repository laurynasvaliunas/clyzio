import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTripStore } from "../../store/useTripStore";

const COLORS = {
  background: "#F8FAFC",
  dark: "#1E293B",
  gray: "#64748B",
  greenLight: "#ECFDF5",
  greenDark: "#065F46",
  green: "#047857",
};

/**
 * ResultCard - Displays the latest CO2 calculation result
 */
interface ResultCardProps {
  distance: number;
  mode: string;
  co2Saved: number;
}

function ResultCard({ distance, mode, co2Saved }: ResultCardProps) {
  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>🌱 Latest Calculation</Text>
      <Text style={styles.resultText}>Distance: {distance} km</Text>
      <Text style={styles.resultText}>Mode: {mode}</Text>
      <Text style={styles.resultValue}>{co2Saved.toFixed(2)} kg CO₂ saved</Text>
    </View>
  );
}

/**
 * EmptyState - Displays empty or encouragement state
 */
interface EmptyStateProps {
  hasTrips: boolean;
}

function EmptyState({ hasTrips }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🚗</Text>
      <Text style={styles.emptyTitle}>
        {hasTrips ? "Keep going!" : "No trips yet"}
      </Text>
      <Text style={styles.emptySubtitle}>
        Plan rides from the Map tab to track your impact!
      </Text>
    </View>
  );
}

/**
 * TripsScreen - Displays trip history and CO2 savings
 * Shows latest calculation and encourages user to plan more trips
 */
export default function TripsScreen() {
  const { co2Saved, distance, selectedMode } = useTripStore();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Trips</Text>
        <Text style={styles.subtitle}>Your ride-share history</Text>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {co2Saved > 0 && (
          <ResultCard
            distance={distance}
            mode={selectedMode}
            co2Saved={co2Saved}
          />
        )}

        <EmptyState hasTrips={co2Saved > 0} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // ===== CONTAINER & HEADER =====
  container: { 
    flex: 1, 
    backgroundColor: COLORS.background, 
    paddingTop: 60 
  },
  header: { 
    paddingHorizontal: 24, 
    marginBottom: 20 
  },
  title: { 
    fontSize: 28, 
    fontWeight: "bold", 
    color: COLORS.dark 
  },
  subtitle: { 
    fontSize: 16, 
    color: COLORS.gray, 
    marginTop: 4 
  },
  
  // ===== CONTENT =====
  content: { 
    flex: 1, 
    paddingHorizontal: 16 
  },
  
  // ===== RESULT CARD =====
  resultCard: {
    backgroundColor: COLORS.greenLight,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  resultTitle: { 
    fontSize: 16, 
    fontWeight: "bold", 
    color: COLORS.greenDark, 
    marginBottom: 12 
  },
  resultText: { 
    fontSize: 14, 
    color: COLORS.green, 
    marginBottom: 4 
  },
  resultValue: { 
    fontSize: 20, 
    fontWeight: "bold", 
    color: COLORS.greenDark, 
    marginTop: 8 
  },
  
  // ===== EMPTY STATE =====
  emptyState: { 
    alignItems: "center", 
    paddingTop: 40 
  },
  emptyEmoji: { 
    fontSize: 64, 
    marginBottom: 16 
  },
  emptyTitle: { 
    fontSize: 20, 
    fontWeight: "bold", 
    color: COLORS.dark 
  },
  emptySubtitle: { 
    fontSize: 16, 
    color: COLORS.gray, 
    textAlign: "center", 
    marginTop: 8 
  },
});

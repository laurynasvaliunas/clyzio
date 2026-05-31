import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * CommuteCalendar — Stage 5 of the customer-journey PDF.
 *
 * A month grid where each day with a completed commute is colour-coded by its
 * dominant transport mode:
 *   green  = active / zero-emission (walk, bike, e-bike, scooter, WFH)
 *   yellow = public transport
 *   orange = car / taxi / motorbike / carpool
 *
 * Presentational — the Stats screen passes the user's completed rides.
 */

export interface CalendarRide {
  completed_at: string | null;
  transport_mode: string | null;
}

interface Props {
  rides: CalendarRide[];
  isDark?: boolean;
}

const COLORS = {
  surface: "#FAF7EF",
  surfaceDark: "#0E1F23",
  ink: "#0B1A1F",
  inkDark: "#FAF7EF",
  inkSoft: "#5A6A6F",
  inkSoftDark: "#8B989C",
  green: "#5B8F5B",
  yellow: "#F2C744",
  orange: "#C4623F",
  emptyCell: "#E8E3D7",
  emptyCellDark: "#1B2E33",
};

const GREEN_MODES = new Set(["walking", "bike", "ebike", "escooter", "scooter", "wfh"]);
const YELLOW_MODES = new Set(["public"]);
// everything else (my_car, car, taxi, moto, motorbike, carpool) → orange

function modeColor(mode: string | null): string | null {
  if (!mode) return null;
  if (GREEN_MODES.has(mode)) return COLORS.green;
  if (YELLOW_MODES.has(mode)) return COLORS.yellow;
  return COLORS.orange;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function CommuteCalendar({ rides, isDark = false }: Props) {
  const surface = isDark ? COLORS.surfaceDark : COLORS.surface;
  const ink = isDark ? COLORS.inkDark : COLORS.ink;
  const inkSoft = isDark ? COLORS.inkSoftDark : COLORS.inkSoft;
  const emptyCell = isDark ? COLORS.emptyCellDark : COLORS.emptyCell;

  // Build the current month grid + per-day dominant-mode colour.
  const { monthLabel, cells } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first offset (JS getDay: 0=Sun).
    const startOffset = (first.getDay() + 6) % 7;

    // Tally modes per day-of-month for the current month.
    const perDay: Record<number, Record<string, number>> = {};
    for (const r of rides) {
      if (!r.completed_at) continue;
      const d = new Date(r.completed_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      const mode = r.transport_mode ?? "unknown";
      perDay[day] = perDay[day] || {};
      perDay[day][mode] = (perDay[day][mode] ?? 0) + 1;
    }

    const dominantColor = (day: number): string | null => {
      const tally = perDay[day];
      if (!tally) return null;
      let best: string | null = null;
      let bestN = 0;
      for (const [mode, n] of Object.entries(tally)) {
        if (n > bestN) { best = mode; bestN = n; }
      }
      return modeColor(best);
    };

    const out: Array<{ key: string; day: number | null; color: string | null; today: boolean }> = [];
    for (let i = 0; i < startOffset; i++) out.push({ key: `pad-${i}`, day: null, color: null, today: false });
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({
        key: `d-${day}`,
        day,
        color: dominantColor(day),
        today: day === now.getDate(),
      });
    }

    return {
      monthLabel: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      cells: out,
    };
  }, [rides]);

  return (
    <View style={[styles.card, { backgroundColor: surface }]}>
      <Text style={[styles.title, { color: ink }]}>🗓️ Commute calendar</Text>
      <Text style={[styles.month, { color: inkSoft }]}>{monthLabel}</Text>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`wd-${i}`} style={[styles.weekday, { color: inkSoft }]}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((c) => (
          <View key={c.key} style={styles.cellWrap}>
            {c.day != null && (
              <View
                style={[
                  styles.cell,
                  { backgroundColor: c.color ?? emptyCell },
                  c.today && styles.cellToday,
                ]}
              >
                <Text style={[styles.cellText, { color: c.color ? "#fff" : inkSoft }]}>{c.day}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Legend color={COLORS.green} label="Walk / bike" />
        <Legend color={COLORS.yellow} label="Transit" />
        <Legend color={COLORS.orange} label="Car / taxi" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  title: { fontSize: 16, fontWeight: "700" },
  month: { fontSize: 12, marginTop: 2, marginBottom: 12 },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cellWrap: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  cell: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cellToday: {
    borderWidth: 2,
    borderColor: "#26C6DA",
  },
  cellText: { fontSize: 11, fontWeight: "600" },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 14,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: "#8B989C", fontWeight: "600" },
});

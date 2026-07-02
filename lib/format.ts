// Shared display formatters. Keep these the single source of truth so numbers
// look identical everywhere (M5: CO₂ was rendered with .toFixed(1) on some
// screens and .toFixed(2) on others, which undermined trust in the impact data).

/** Format a CO₂ amount in kilograms for display, e.g. `formatCO2(1.234)` → "1.2". */
export function formatCO2(kg: number | null | undefined): string {
  const v = Number(kg);
  if (!Number.isFinite(v)) return "0";
  return v.toFixed(1);
}

/** CO₂ with its unit, e.g. "1.2 kg". */
export function formatCO2kg(kg: number | null | undefined): string {
  return `${formatCO2(kg)} kg`;
}

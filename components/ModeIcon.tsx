import React from "react";
import {
  Bike,
  Bus,
  Car,
  CarFront,
  Compass,
  Footprints,
  Gauge,
  House,
  Users,
  Zap,
} from "lucide-react-native";

/**
 * One line icon per transport mode / vehicle type, used everywhere a mode is
 * shown. Replaces the emoji (🚶 🚲 🏍️ 🚗 …) that rendered differently on iOS
 * and Android, ignored the brand colour and clashed with the lucide icons used
 * in the rest of the UI.
 *
 * Accepts the ids used across the app: commute-mix ids (car_gas, moto_gas,
 * public, wfh…), ride transport_mode values (walking, bike, ebike…), garage
 * vehicle types (bicycle, motorcycle, scooter…).
 */
type IconComponent = typeof Car;

const ICONS: Record<string, IconComponent> = {
  walking: Footprints,
  walk: Footprints,
  bike: Bike,
  bicycle: Bike,
  cycling: Bike,
  ebike: Zap,
  escooter: Zap,
  scooter: Zap,
  moto_gas: Gauge,
  motorbike: Gauge,
  motorcycle: Gauge,
  public: Bus,
  bus: Bus,
  transit: Bus,
  carpool: Users,
  wfh: House,
  taxi: CarFront,
  car: Car,
  my_car: Car,
};

export function modeIconFor(mode: string | null | undefined): IconComponent {
  if (!mode) return Compass;
  if (ICONS[mode]) return ICONS[mode];
  if (mode.startsWith("car")) return Car; // car_gas, car_diesel, car_electric…
  return Compass;
}

interface ModeIconProps {
  mode: string | null | undefined;
  size?: number;
  color: string;
  strokeWidth?: number;
}

export default function ModeIcon({ mode, size = 20, color, strokeWidth = 2 }: ModeIconProps) {
  const Icon = modeIconFor(mode);
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

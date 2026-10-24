import React from "react";
import { Compass, House, Users } from "lucide-react-native";
import {
  BikeIcon,
  CarIcon,
  EbikeIcon,
  MotorcycleIcon,
  NoMotorIcon,
  PublicTransportIcon,
  TaxiIcon,
  WalkingIcon,
} from "./icons/TransportIcons";

/**
 * One line icon per transport mode / vehicle type, used everywhere a mode is
 * shown. Modes use Clyzio's own pictograms (components/icons/TransportIcons);
 * carpool and working-from-home, which have none, keep their lucide icons.
 *
 * Accepts the ids used across the app: commute-mix ids (car_gas, moto_gas,
 * public, wfh…), ride transport_mode values (walking, bike, ebike, moto,
 * nomotor…), garage vehicle types (bicycle, motorcycle, scooter…).
 */
export type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const ICONS: Record<string, IconComponent> = {
  public: PublicTransportIcon,
  bus: PublicTransportIcon,
  transit: PublicTransportIcon,
  car: CarIcon,
  my_car: CarIcon,
  bike: BikeIcon,
  bicycle: BikeIcon,
  cycling: BikeIcon,
  ebike: EbikeIcon,
  escooter: EbikeIcon,
  scooter: EbikeIcon,
  walking: WalkingIcon,
  walk: WalkingIcon,
  taxi: TaxiIcon,
  moto: MotorcycleIcon,
  moto_gas: MotorcycleIcon,
  motorbike: MotorcycleIcon,
  motorcycle: MotorcycleIcon,
  nomotor: NoMotorIcon,
  carpool: Users,
  wfh: House,
};

export function modeIconFor(mode: string | null | undefined): IconComponent {
  if (!mode) return Compass;
  if (ICONS[mode]) return ICONS[mode];
  if (mode.startsWith("car")) return CarIcon; // car_gas, car_diesel, car_electric…
  return Compass;
}

interface ModeIconProps {
  mode: string | null | undefined;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** Line weight of the pictogram set (1.6 on a 24-unit grid). */
const STROKE = 1.6;

export default function ModeIcon({ mode, size = 20, color, strokeWidth = STROKE }: ModeIconProps) {
  const Icon = modeIconFor(mode);
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

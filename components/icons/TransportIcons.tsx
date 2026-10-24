import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Clyzio's transport-mode pictograms (designer set "Clyzio piktogramos",
 * 2026-10), drawn from the original 24×24 SVGs. Same props as a lucide icon,
 * so they drop in wherever one is used. Display order across the app follows
 * the set's numbering: public transport, car, bike, e-bike / e-scooter,
 * walking, taxi, motorcycle / moped, other (no motor).
 */
export interface TransportIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function Glyph({
  size = 24,
  color = "#1F2A2E",
  strokeWidth = 1.6,
  children,
}: TransportIconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** 1 — Public transport */
export function PublicTransportIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Rect x={5} y={2.8} width={14} height={15.4} rx={2.6} />
      <Rect x={7} y={6} width={10} height={5} rx={1} />
      <Path d="M9 4.6h6" />
      <Circle cx={8.6} cy={14.4} r={1} />
      <Circle cx={15.4} cy={14.4} r={1} />
      <Path d="M7.5 18.2v2.3M16.5 18.2v2.3" />
    </Glyph>
  );
}

/** 2 — Car */
export function CarIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Path d="M5 16H2.8v-3.2L4.3 12l2.2-4h8l3.5 4h2a1.5 1.5 0 0 1 1.5 1.5V16H19M9 16h6" />
      <Circle cx={7} cy={16} r={2} />
      <Circle cx={17} cy={16} r={2} />
      <Path d="M4.3 12H18M11 8v4" />
    </Glyph>
  );
}

/** 3 — Bike */
export function BikeIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Circle cx={5.5} cy={16} r={3.5} />
      <Circle cx={18.5} cy={16} r={3.5} />
      <Path d="M5.5 16H11L9.5 10H16L11 16M5.5 16l4-6M16 10l2.5 6M8 9.5h3M16 10l-.6-2.6h2.2" />
    </Glyph>
  );
}

/** 4 — E-bike / E-scooter */
export function EbikeIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Circle cx={5} cy={18} r={2.2} />
      <Circle cx={19} cy={18} r={2.2} />
      <Path d="M7.2 18h9.6L19 18l-2.4-13M14.5 5h4.2" />
      <Path d="M9.2 3.5 6.2 9h3l-1 4.5 4-6.2h-3l1-3.8z" />
    </Glyph>
  );
}

/** 5 — Walking */
export function WalkingIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Circle cx={13.2} cy={4.3} r={1.8} />
      <Path d="M12.6 7.6 11 13M12.4 8.3 15 10.6l2 .6M12.4 8.3 9.6 10.2l-1 2.6M11 13l2.5 3.2.5 4.3M11 13l-1.5 4L7 20.2" />
    </Glyph>
  );
}

/** 6 — Taxi */
export function TaxiIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Rect x={9.5} y={3.3} width={5} height={2.9} rx={0.8} />
      <Path d="M5.6 10.2 7.4 6.2h9.2l1.8 4" />
      <Rect x={3.5} y={10.2} width={17} height={6.8} rx={2} />
      <Circle cx={7} cy={13.6} r={1.1} />
      <Circle cx={17} cy={13.6} r={1.1} />
      <Path d="M10 14h4M6 17v2.5M18 17v2.5" />
    </Glyph>
  );
}

/** 7 — Motorcycle / Moped */
export function MotorcycleIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Circle cx={5.5} cy={17.2} r={2.5} />
      <Circle cx={18.5} cy={17.2} r={2.5} />
      <Path d="M3 15.5C3 12.4 5 11.3 8 11.3h3.2l1.2 4.2H15.6L17.2 6.6M15.2 6.6h3.6M17 8.6l1.5 8.6M6.2 9.4h4.6" />
    </Glyph>
  );
}

/** 8 — Other, no motor (kick scooter, skateboard…) */
export function NoMotorIcon(props: TransportIconProps) {
  return (
    <Glyph {...props}>
      <Path d="M2.5 12.6c.8 1.6 2 2.4 3.8 2.4h11.4c1.8 0 3-.8 3.8-2.4" />
      <Path d="M7 15v1.5M17 15v1.5" />
      <Circle cx={7} cy={18.2} r={1.6} />
      <Circle cx={17} cy={18.2} r={1.6} />
    </Glyph>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, TextStyle } from "react-native";
import { Text } from "./AppText";
import { numeric } from '../../lib/theme/tokens';
import { useReducedMotion } from './useReducedMotion';

// Tests assert on rendered values; render them final instead of mid-count.
const IS_TEST = typeof process !== 'undefined' && process.env?.JEST_WORKER_ID != null;

export interface AnimatedNumberProps {
  value: number;
  /** Formats each frame's value (default: fixed `decimals`). */
  format?: (n: number) => string;
  decimals?: number;
  duration?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A number that counts up to its value (and re-counts from the previous value
 * when it changes). Tabular digits so the width doesn't jitter. Screen readers
 * get the final value, never the in-between frames.
 */
export function AnimatedNumber({
  value,
  format,
  decimals = 0,
  duration = 900,
  style,
  ...textProps
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const fmt = format ?? ((n: number) => n.toFixed(decimals));
  const target = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(IS_TEST ? target : 0);
  const from = useRef(IS_TEST ? target : 0);

  useEffect(() => {
    if (IS_TEST || reduce) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    let raf: number;
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / duration);
      const v = start + (target - start) * easeOutCubic(t);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce, duration]);

  return (
    <Text style={[numeric, style]} accessibilityLabel={fmt(target)} {...textProps}>
      {fmt(shown)}
    </Text>
  );
}

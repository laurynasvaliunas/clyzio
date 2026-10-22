import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system "Reduce Motion" setting, live. Every decorative animation and 3D
 * scene checks it: springs settle instantly, idle loops stop, scenes render a
 * still frame.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (alive) setReduced(!!v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => setReduced(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

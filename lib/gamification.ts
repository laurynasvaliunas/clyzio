/**
 * Clyzio gamification — single source of truth.
 *
 * The model is deliberately dead-simple so progress is obvious from day one:
 * every completed trip is worth a flat {@link XP_PER_TRIP}, and every
 * {@link TRIPS_PER_LEVEL} trips is one level. So a fresh user sees
 * "3 more shared trips to Level 2" — no abstract XP to decode.
 *
 * Referral bonuses ({@link REFERRAL_XP}) advance the exact same bar, so they
 * read naturally as "≈ 2–3 trips' worth".
 */

export const XP_PER_TRIP = 100;
export const TRIPS_PER_LEVEL = 3;
export const XP_PER_LEVEL = XP_PER_TRIP * TRIPS_PER_LEVEL; // 300
export const REFERRAL_XP = 250;
export const MAX_LEVEL = 10;

export const LEVEL_TITLES = [
  "Eco Beginner",
  "Green Starter",
  "Earth Ally",
  "Eco Warrior",
  "Planet Protector",
  "Green Champion",
  "Eco Master",
  "Climate Hero",
  "Earth Guardian",
  "Eco Legend",
] as const;

export interface LevelInfo {
  level: number;
  title: string;
  /** 0..1 fill of the current level's progress bar. */
  progress: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** XP remaining until the next level (0 at max level). */
  xpToNext: number;
  /** Whole trips remaining until the next level (0 at max level). */
  tripsToNext: number;
  /** Cumulative XP at the start of the current level. */
  min: number;
  /** Cumulative XP at the start of the next level. */
  max: number;
  /** True when the user has reached {@link MAX_LEVEL}. */
  atMax: boolean;
}

/**
 * Resolve level / progress from a cumulative XP total.
 * level = min(MAX_LEVEL, floor(xp / XP_PER_LEVEL) + 1)
 */
export function getLevelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  const rawLevel = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  const level = Math.min(MAX_LEVEL, rawLevel);
  const atMax = level >= MAX_LEVEL;

  const min = (level - 1) * XP_PER_LEVEL;
  const max = level * XP_PER_LEVEL;

  if (atMax) {
    return {
      level: MAX_LEVEL,
      title: LEVEL_TITLES[MAX_LEVEL - 1],
      progress: 1,
      xpIntoLevel: Math.max(0, safeXp - min),
      xpToNext: 0,
      tripsToNext: 0,
      min,
      max,
      atMax: true,
    };
  }

  const xpIntoLevel = safeXp - min;
  const xpToNext = max - safeXp;
  return {
    level,
    title: LEVEL_TITLES[level - 1],
    progress: Math.max(0, Math.min(1, xpIntoLevel / XP_PER_LEVEL)),
    xpIntoLevel,
    xpToNext,
    tripsToNext: Math.max(1, Math.ceil(xpToNext / XP_PER_TRIP)),
    min,
    max,
    atMax: false,
  };
}

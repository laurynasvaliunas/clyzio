import { create } from "zustand";

/**
 * What LiveLocationSharer is doing, for screens that show it (migration 052).
 */
interface LiveShareState {
  /** Rides this phone is currently sharing its position to. */
  sharingRideIds: string[];
  /** A ride's live window is open but location permission isn't granted. */
  needsPermission: boolean;
  /** Bump to make the sharer re-check now (e.g. right after granting permission). */
  nudge: number;
  setSharing: (sharingRideIds: string[], needsPermission: boolean) => void;
  poke: () => void;
}

export const useLiveShareStore = create<LiveShareState>((set) => ({
  sharingRideIds: [],
  needsPermission: false,
  nudge: 0,
  setSharing: (sharingRideIds, needsPermission) => set({ sharingRideIds, needsPermission }),
  poke: () => set((s) => ({ nudge: s.nudge + 1 })),
}));

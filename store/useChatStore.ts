import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Unread chat messages across the app (components/ChatWatcher fills it,
 * ChatModal clears it). A thread is a ride or a match (migration 051), keyed
 * `ride:<id>` / `match:<id>` — see `threadKeyOf`.
 *
 * Last-read times are kept per thread on the device, so unread counts survive
 * a restart: on launch the watcher counts messages newer than them.
 */

const LAST_READ_KEY = "clyzio.chatLastRead.v1";
/** When unread tracking started on this phone: a chat never opened here
 *  counts messages from then on (not its whole history). */
export const SINCE_KEY = "__since";

export type ThreadKey = `ride:${string}` | `match:${string}`;

/** Thread key for a message row (ride wins: 051 ties a match's messages to its ride). */
export function threadKeyOf(m: { ride_id?: string | null; match_id?: string | null }): ThreadKey | null {
  if (m.ride_id) return `ride:${m.ride_id}`;
  if (m.match_id) return `match:${m.match_id}`;
  return null;
}

interface ChatState {
  unread: Record<string, number>;
  /** Threads currently on screen in a ChatModal — their messages aren't unread. */
  openThreads: string[];
  lastRead: Record<string, string>;
  lastReadLoaded: boolean;

  loadLastRead: () => Promise<void>;
  addUnread: (key: ThreadKey, count?: number) => void;
  setUnread: (counts: Record<string, number>) => void;
  /** A chat opened: these threads are read now and stay read while open. */
  openChat: (keys: ThreadKey[]) => void;
  closeChat: (keys: ThreadKey[]) => void;
  isOpen: (key: ThreadKey) => boolean;
}

export const useChatStore = create<ChatState>((set, get) => ({
  unread: {},
  openThreads: [],
  lastRead: {},
  lastReadLoaded: false,

  loadLastRead: async () => {
    if (get().lastReadLoaded) return;
    try {
      const raw = await AsyncStorage.getItem(LAST_READ_KEY);
      const lastRead: Record<string, string> = raw ? JSON.parse(raw) : {};
      if (!lastRead[SINCE_KEY]) {
        lastRead[SINCE_KEY] = new Date().toISOString();
        AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(lastRead)).catch(() => undefined);
      }
      set({ lastRead, lastReadLoaded: true });
    } catch {
      set({ lastRead: { [SINCE_KEY]: new Date().toISOString() }, lastReadLoaded: true });
    }
  },

  addUnread: (key, count = 1) =>
    set((s) => ({ unread: { ...s.unread, [key]: (s.unread[key] ?? 0) + count } })),

  setUnread: (counts) => set({ unread: counts }),

  openChat: (keys) => {
    const now = new Date().toISOString();
    set((s) => {
      const unread = { ...s.unread };
      const lastRead = { ...s.lastRead };
      for (const k of keys) {
        delete unread[k];
        lastRead[k] = now;
      }
      return { unread, lastRead, openThreads: [...s.openThreads, ...keys] };
    });
    AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(get().lastRead)).catch(() => undefined);
  },

  closeChat: (keys) => {
    // Reading continues until the chat closes: stamp again on the way out.
    const now = new Date().toISOString();
    set((s) => {
      const lastRead = { ...s.lastRead };
      for (const k of keys) lastRead[k] = now;
      const openThreads = [...s.openThreads];
      for (const k of keys) {
        const i = openThreads.indexOf(k);
        if (i >= 0) openThreads.splice(i, 1);
      }
      return { lastRead, openThreads };
    });
    AsyncStorage.setItem(LAST_READ_KEY, JSON.stringify(get().lastRead)).catch(() => undefined);
  },

  isOpen: (key) => get().openThreads.includes(key),
}));

/** Total unread across all chats (tab badge). */
export const selectTotalUnread = (s: ChatState) => Object.values(s.unread).reduce((a, b) => a + b, 0);

/** Unread for any of these threads (a match and its ride count as one chat). */
export const selectUnreadFor = (keys: (ThreadKey | null)[]) => (s: ChatState) =>
  keys.reduce((sum, k) => sum + (k ? (s.unread[k] ?? 0) : 0), 0);

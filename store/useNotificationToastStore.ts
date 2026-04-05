import { create } from "zustand";

export type ToastType = "co2" | "trip" | "carpool" | "badge" | "reminder" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  body: string;
  screen?: string; // deep-link target on tap
  createdAt: number;
}

interface NotificationToastState {
  queue: ToastItem[];
  push: (item: Omit<ToastItem, "id" | "createdAt">) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

function inferType(title: string): ToastType {
  const t = title.toLowerCase();
  if (t.includes("co2") || t.includes("green") || t.includes("tip")) return "co2";
  if (t.includes("trip") || t.includes("commute") || t.includes("logged")) return "trip";
  if (t.includes("carpool") || t.includes("match") || t.includes("driver") || t.includes("ride confirmed")) return "carpool";
  if (t.includes("badge") || t.includes("level") || t.includes("week")) return "badge";
  if (t.includes("soon") || t.includes("reminder") || t.includes("starting")) return "reminder";
  return "info";
}

export const useNotificationToastStore = create<NotificationToastState>((set) => ({
  queue: [],

  push: (item) =>
    set((state) => ({
      queue: [
        ...state.queue,
        {
          ...item,
          type: item.type ?? inferType(item.title),
          id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
        },
      ].slice(-3), // max 3 queued at once
    })),

  dismiss: (id) =>
    set((state) => ({ queue: state.queue.filter((t) => t.id !== id) })),

  clear: () => set({ queue: [] }),
}));

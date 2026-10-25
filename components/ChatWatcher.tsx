import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "../lib/supabase";
import { useChatStore, threadKeyOf, SINCE_KEY, type ThreadKey } from "../store/useChatStore";
import { useNotificationToastStore } from "../store/useNotificationToastStore";

/**
 * Tells you about new chat messages wherever you are in the app.
 *
 * Listens to every new `messages` row while the app is open — Realtime only
 * delivers rows RLS lets you read, i.e. your own carpool chats — and, for a
 * message from someone else in a chat that isn't open on screen, raises its
 * unread count and shows a toast that opens the chat. On launch and resume it
 * also counts messages that arrived while the app was closed.
 *
 * Mounted once at the root; renders nothing.
 */

const PREVIEW_CHARS = 120;
const CATCH_UP_DAYS = 14;

interface MessageRow {
  id: number;
  ride_id: string | null;
  match_id?: string | null;
  sender_id: string;
  content: string;
  created_at: string;
}

/** Where a chat lives: a ride's on the trip screen, a match's on Daily Commute. */
export function chatRoute(m: Pick<MessageRow, "ride_id" | "match_id">): string | null {
  if (m.ride_id) return `/trip/${m.ride_id}?openChat=1`;
  if (m.match_id) return `/daily-commute?openChat=${encodeURIComponent(m.match_id)}`;
  return null;
}

const isForeground = (s: string | null | undefined) => s !== "background" && s !== "inactive";

export default function ChatWatcher() {
  const [userId, setUserId] = useState<string | null>(null);
  const [active, setActive] = useState(isForeground(AppState.currentState));
  const names = useRef(new Map<string, string>());
  const chatToasts = useRef(true);

  // Who's signed in (and follow sign-in / sign-out).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUserId(session?.user?.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(isForeground(s)));
    return () => sub.remove();
  }, []);

  // The "chat" notification setting also governs in-app toasts (unread
  // counts always update).
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        chatToasts.current = (data?.notification_prefs as { chat?: boolean } | null)?.chat ?? true;
      });
  }, [userId]);

  const senderName = async (id: string): Promise<string | null> => {
    if (names.current.has(id)) return names.current.get(id)!;
    const { data } = await supabase.rpc("get_public_profiles", { p_ids: [id] });
    const name = Array.isArray(data) && data[0]?.first_name ? (data[0].first_name as string) : null;
    if (name) names.current.set(id, name);
    return name;
  };

  // Catch up on open / resume: count what arrived since each chat was last read.
  useEffect(() => {
    if (!userId || !active) return;
    let cancelled = false;
    (async () => {
      const store = useChatStore.getState();
      await store.loadLastRead();
      const since = new Date(Date.now() - CATCH_UP_DAYS * 86_400_000).toISOString();
      const recent = (columns: string) =>
        supabase
          .from("messages")
          .select(columns)
          .neq("sender_id", userId)
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .limit(500);
      // match_id arrives with migration 051; before that, ride chats only.
      let { data, error } = await recent("id, ride_id, match_id, sender_id, created_at");
      if (error) ({ data } = await recent("id, ride_id, sender_id, created_at"));
      if (cancelled || !Array.isArray(data)) return;
      const { lastRead, openThreads } = useChatStore.getState();
      const counts: Record<string, number> = {};
      for (const m of data as unknown as MessageRow[]) {
        const key = threadKeyOf(m);
        if (!key || openThreads.includes(key)) continue;
        // Unread = newer than the last time this chat was open here (a chat
        // never opened on this phone: newer than when tracking started).
        const read =
          lastRead[key] ?? (m.match_id ? lastRead[`match:${m.match_id}`] : undefined) ?? lastRead[SINCE_KEY];
        if (read && m.created_at <= read) continue;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      const before = useChatStore.getState().unread;
      const fresh = Object.keys(counts).reduce((n, k) => n + Math.max(0, counts[k] - (before[k] ?? 0)), 0);
      useChatStore.getState().setUnread({ ...before, ...counts });
      if (fresh > 0 && chatToasts.current) {
        useNotificationToastStore.getState().push({
          type: "chat",
          title: fresh === 1 ? "1 new message" : `${fresh} new messages`,
          body: "Open your carpool chat to read it.",
        });
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, active]);

  // Live: every new message in your chats.
  useEffect(() => {
    if (!userId || !active) return;
    const channel = supabase
      .channel(`chat-watch:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: any) => {
        const m = payload.new as MessageRow;
        if (!m || m.sender_id === userId) return;
        const key = threadKeyOf(m);
        if (!key) return;
        const store = useChatStore.getState();
        // Open on screen: the chat shows it already.
        if (store.isOpen(key) || (m.match_id && store.isOpen(`match:${m.match_id}` as ThreadKey))) return;
        store.addUnread(key);
        if (!chatToasts.current) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        const preview = m.content.length > PREVIEW_CHARS ? `${m.content.slice(0, PREVIEW_CHARS - 1)}…` : m.content;
        senderName(m.sender_id)
          .catch(() => null)
          .then((name) => {
            useNotificationToastStore.getState().push({
              type: "chat",
              title: name ? `New message from ${name}` : "New message",
              body: preview,
              screen: chatRoute(m) ?? undefined,
            });
          });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, active]);

  return null;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
}

/**
 * Sends an Expo push notification with the production access token when
 * `EXPO_PUSH_ACCESS_TOKEN` is configured (required for rate-limit friendly
 * sends per Expo's production guidance).
 *
 * Fire-and-forget — errors are logged but never thrown so a push failure
 * cannot break an edge function's main flow.
 */
export async function sendPush(msg: PushMessage): Promise<void> {
  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sound: 'default', ...msg }),
    });
    if (!res.ok) {
      // Expo responds 400 with a structured body on invalid tokens etc. — log it.
      const detail = await res.text().catch(() => '<unreadable>');
      console.warn(`expo push non-2xx ${res.status}: ${detail.slice(0, 200)}`);
    }
  } catch (e) {
    console.error('expo push error:', e);
  }
}

export async function sendPushBatch(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(messages.map((m) => ({ sound: 'default', ...m }))),
    });
  } catch (e) {
    console.error('expo push batch error:', e);
  }
}

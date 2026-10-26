import AsyncStorage from "@react-native-async-storage/async-storage";
import { secureSessionStorage } from "../../lib/secureSessionStorage";

// The Supabase session is larger than SecureStore's ~2 KB per item (the QA run
// saw "Value being stored in SecureStore is larger than 2048 bytes" on every
// sign-in), so it's split into chunks.

const store = (globalThis as any).__secureStore as Map<string, string>;
const KEY = "sb-test-auth-token";
const session = JSON.stringify({ access_token: "a".repeat(1200), refresh_token: "r".repeat(40), user: { id: "u", meta: "m".repeat(2500) } });

beforeEach(async () => {
  store.clear();
  await AsyncStorage.removeItem(KEY);
});

describe("secureSessionStorage", () => {
  it("stores a large session in chunks under 2 KB and reads it back", async () => {
    await secureSessionStorage.setItem(KEY, session);
    expect(Number(store.get(`${KEY}.n`))).toBeGreaterThan(1);
    for (const [k, v] of store) {
      if (k.startsWith(KEY)) expect(v.length).toBeLessThanOrEqual(1800);
    }
    expect(await secureSessionStorage.getItem(KEY)).toBe(session);
  });

  it("reads a session saved whole by an earlier build, then replaces it", async () => {
    store.set(KEY, session);
    expect(await secureSessionStorage.getItem(KEY)).toBe(session);
    await secureSessionStorage.setItem(KEY, session);
    expect(store.has(KEY)).toBe(false);
    expect(await secureSessionStorage.getItem(KEY)).toBe(session);
  });

  it("treats a half-written session as signed out", async () => {
    await secureSessionStorage.setItem(KEY, session);
    store.delete(`${KEY}.1`);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it("shrinks cleanly and signs out completely", async () => {
    await secureSessionStorage.setItem(KEY, session);
    await secureSessionStorage.setItem(KEY, "short");
    expect(store.get(`${KEY}.n`)).toBe("1");
    expect(store.has(`${KEY}.2`)).toBe(false);
    expect(await secureSessionStorage.getItem(KEY)).toBe("short");
    await secureSessionStorage.removeItem(KEY);
    expect([...store.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });
});

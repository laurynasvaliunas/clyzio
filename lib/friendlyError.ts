/**
 * Turn an unknown error into a sentence fit for a toast.
 *
 * Database/API errors ("new row violates row-level security policy",
 * constraint names, PGRST codes) used to be shown verbatim. Those are hidden
 * behind the fallback; short human-readable messages (e.g. our own thrown
 * Errors) pass through.
 */
const TECHNICAL = /violates|row-level security|permission denied|constraint|relation |column |function |syntax|duplicate key|JWT|PGRST|schema cache|null value|invalid input|42501|23505|23514/i;
const NETWORK = /network request failed|failed to fetch|network error|timed? ?out|offline/i;

export function friendlyError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : typeof err === "string"
          ? err
          : "";
  const code =
    typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";

  if (!message) return fallback;
  if (NETWORK.test(message)) return "You seem to be offline. Check your connection and try again.";
  if (TECHNICAL.test(message) || /^\d{5}$/.test(code) || code.startsWith("PGRST")) return fallback;
  if (message.length > 140) return fallback;
  return message;
}

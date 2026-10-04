import { parseLink, toRoutePath } from "../lib/deepLinks";

/**
 * Rewrites incoming deep links / universal links to real routes before
 * expo-router navigates.
 *
 * The canonical link shapes (clyzio://ride/<id>, clyzio://join/<token>,
 * https://clyzio.com/invite/<code>, …) aren't file routes — the screens live
 * at /trip/[id], /join?token=, /(auth)/onboarding?ref=. Without this hook a
 * link that arrived while the app was running opened the Not Found screen,
 * because the root layout only routed the link it saw at launch.
 *
 * Runs for both cold-start and warm links. Anything we don't recognise
 * (dev-client URLs, plain route paths) is passed through untouched.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const route = toRoutePath(parseLink(path));
    if (route) return route;
  } catch {
    /* fall through to default handling */
  }
  return path;
}

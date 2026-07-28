# Prompts for the Lovable web app (clyzio.com)

Copy each block into Lovable as its own prompt. **Prompt 1 is launch-blocking**
for the mobile app's deep links — everything else is web polish.

Context Lovable needs: the mobile app is live on the same Supabase project
(`qvevbbqcrizfywqexlkw`). Do **not** change database schema, RLS policies, or
edge functions — the mobile app depends on them and they were just hardened in
a security audit. These are all web-side changes.

---

## Prompt 1 — Host the app-link association files (BLOCKING)

> The Clyzio mobile app declares universal links / App Links for `clyzio.com`.
> They only work once two files are served from the domain root. Please serve
> both as static files, with no redirects and no auth:
>
> **A. `https://clyzio.com/.well-known/apple-app-site-association`**
> - Served with `Content-Type: application/json`
> - **No `.json` file extension in the URL** (Apple requires the bare filename)
> - Must also resolve at `https://www.clyzio.com/.well-known/apple-app-site-association`
> - Contents:
> ```json
> {
>   "applinks": {
>     "apps": [],
>     "details": [
>       {
>         "appIDs": ["Q8P66YD7GQ.com.clyzio.app"],
>         "components": [
>           { "/": "/ride/*",    "comment": "Ride detail" },
>           { "/": "/profile/*", "comment": "Public profile" },
>           { "/": "/invite/*",  "comment": "Referral invite" },
>           { "/": "/join*",     "comment": "Company invite" }
>         ]
>       }
>     ]
>   }
> }
> ```
>
> **B. `https://clyzio.com/.well-known/assetlinks.json`**
> - Served with `Content-Type: application/json`
> - Contents (I will send you the real SHA-256 fingerprint to paste in):
> ```json
> [
>   {
>     "relation": ["delegate_permission/common.handle_all_urls"],
>     "target": {
>       "namespace": "android_app",
>       "package_name": "com.clyzio.app",
>       "sha256_cert_fingerprints": ["<SHA256_FINGERPRINT>"]
>     }
>   }
> ]
> ```
>
> Important: `.well-known` paths must not be rewritten by the SPA router or
> redirected to `index.html`. Please confirm both URLs return HTTP 200 with
> `application/json` when fetched directly.

*(You supply the fingerprint from `eas credentials --platform android` — see
`docs/android-launch.md` Step 3.)*

---

## Prompt 2 — Web routes that mobile links point at

> The mobile app generates shareable links in these shapes. Please make sure
> each has a real page (they currently 404 or fall through to the homepage):
>
> - `clyzio.com/join?token=<token>` — **company invite landing.** Look up the
>   invite with the existing `lookup_invite_by_token` Supabase RPC (it is
>   callable anonymously by design), show the company name and the invited
>   email, and offer "Get the app" (App Store / Play links) plus a "Sign up on
>   the web" path that pre-fills and locks that email address. If the token is
>   invalid or expired, say so plainly instead of erroring.
> - `clyzio.com/ride/<id>` — a shared ride. Non-authenticated visitors should
>   see a simple branded page: "Open this ride in the Clyzio app" + store
>   badges. Do not attempt to render private ride details to anonymous
>   visitors.
> - `clyzio.com/invite/<code>` — referral link. Same treatment: explain Clyzio,
>   store badges, and carry the code into signup.
> - `clyzio.com/profile/<id>` — a public profile. Keep it minimal (first name +
>   avatar only) or just redirect to the app-download page.
>
> These pages are mostly "open in app" landing pages — they don't need to
> replicate app functionality.

---

## Prompt 3 — Pilot / demo request form

> The pilot request form submits but gives no feedback. Please:
> - Show a clear **success state** after submitting ("Thanks — we'll be in
>   touch within one business day"), and clear the form.
> - Show a distinct **error state** if the request fails, with a retry.
> - Disable the submit button while in flight so it can't be double-submitted.
> - Keep the existing honeypot field — the backend relies on it for spam
>   filtering.

---

## Prompt 4 — CO₂ rendering + terminology

> Two consistency fixes across the whole site:
> - Render **CO₂** with a subscript 2 everywhere (currently some places show
>   "CO2"). Use the character `CO₂`.
> - Standardise the vocabulary to match the mobile app: say **trip** (not
>   "ride"/"journey" interchangeably), **passenger** (not "rider"), and
>   **commute** only when referring to the home↔work routine.

---

## Prompt 5 — Self-serve company onboarding + login entry point

> Two gaps in the marketing site:
> - There is **no visible login link**. Add "Log in" to the main navigation for
>   returning company admins.
> - Company signup is currently manual/sales-led. Add a self-serve path where a
>   company admin can create an account with their work email, verify their
>   domain, and invite colleagues. The Supabase edge functions
>   `admin-create-company`, `admin-invite-employee`, `admin-verify-domain` and
>   `verify-domain` already exist and are JWT-protected — call those rather
>   than writing new backend logic or touching the database directly.

---

## Prompt 6 — Signup edge case

> When a user signs up and email confirmation is required, Supabase returns a
> user with **no session**. The web app currently treats that as a failure or
> leaves the user on a blank state. Please handle it explicitly: show a
> "Check your inbox to confirm your email" screen with the address shown, plus
> a **Resend confirmation email** button (`supabase.auth.resend({ type:
> 'signup', email })`) and a "check your spam folder" hint.

---

## Do NOT change (mobile app depends on these)

> Please treat the Supabase backend as read-only from the web app's
> perspective:
> - Don't modify RLS policies, database functions, or table schemas — a
>   security audit just locked down a set of legacy functions, and reverting
>   any of it re-opens a data-exposure hole.
> - Don't change or redeploy edge functions.
> - Don't alter `profiles` columns or the `rides` / `trip_intents` tables.
>
> If something you need seems to require a backend change, flag it instead of
> making it, and it will be handled on the mobile/backend side.

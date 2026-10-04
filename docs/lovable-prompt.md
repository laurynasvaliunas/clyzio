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
> - (`www.clyzio.com` currently doesn't resolve and the app no longer declares
>   it, so only the apex domain is needed.)
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

## Prompt 7 — Privacy policy update (BLOCKING for store review)

> Update the privacy policy page at `https://clyzio.com/legal/privacy` so it
> matches the mobile app word for word (App Store and Play reviewers compare
> them). Set "Last updated" to 4 October 2026, version 1.1, and make these
> changes:
>
> **Section 2, Technical Data** — replace "Crash logs and error reports
> (anonymised)" with: "Crash logs and error reports, linked to a pseudonymous
> account ID (never your name or email)".
>
> **Section 3, Consent paragraph** — replace with: "AI-powered commute
> suggestions run only after you turn them on in the App, and marketing
> communications only with your agreement. You may withdraw consent at any time
> (for AI suggestions: Settings → AI suggestions) without affecting the
> lawfulness of prior processing."
>
> **Section 5, Data Sharing** — replace the whole section with:
>
> We do not sell your personal data. We share it only with the recipients below.
>
> *Other Clyzio Users* — To make carpooling work, people you can be matched
> with (normally colleagues at your company) can see your first name, profile
> photo, an approximate home area (never your exact address) and your planned
> trip times. Once you both agree to a carpool, your partner also sees your
> pickup point (unless you hide your pickup address) and, if you drive, your car
> details. You control your visibility in Profile → Privacy.
>
> *Your Employer (Corporate Users Only)* — (keep the existing paragraph.)
>
> *Service Providers (Data Processors)* — These companies process data on our
> behalf under data processing agreements:
> - Supabase: database, sign-in and file storage, hosted on Amazon Web Services in London, United Kingdom.
> - Anthropic (Claude AI): only if you turn on AI suggestions. We send your commute distance, usual transport modes and working days, departure time, car fuel type and CO₂ totals. We never send your name, your addresses or your exact location. For carpool ranking, only anonymous distance and timing figures are sent.
> - Mapbox: maps and address search. The text you search for and the map area you view are sent to Mapbox. Mapbox usage telemetry is switched off.
> - Google: public-transport route options. The start and end points of a route you look up are sent to Google.
> - Sentry: crash and error reports, linked to a pseudonymous account ID, stored in the EU (Germany).
> - Expo, Apple and Google: delivery of push notifications (your device's push token and the notification text).
> - Our email service provider: account and service emails (your email address).
>
> *Legal and Regulatory Authorities* — (keep the existing paragraph.)
>
> We do not share your personal data with anyone else.
>
> **Section 7** — change "End-to-end TLS encryption for all data in transit" to
> "TLS encryption for all data in transit".
>
> **Section 10, International Data Transfers** — replace with: "Your personal
> data is stored in the United Kingdom (London), which the European Commission
> recognises as providing an adequate level of data protection. Crash reports
> are stored in the EU (Germany). Some service providers process data in the
> United States: Anthropic (only if you turn on AI suggestions), Mapbox, Google
> and Expo. For these transfers we rely on the EU-U.S. Data Privacy Framework
> where the provider is certified, or on Standard Contractual Clauses approved
> by the European Commission."
>
> If the web app itself uses any other third-party service (analytics, chat
> widgets, fonts loaded from a CDN, etc.), list it in Section 5 too.

## Prompt 8 — Account deletion page (BLOCKING for Google Play)

> Google Play requires a public web page where people can request deletion of
> their Clyzio account and data without the app. Please add
> `https://clyzio.com/delete-account`:
>
> 1. Public (no login needed to read it). Title "Delete your Clyzio account".
> 2. Explain the in-app path: **Profile → Settings (gear icon) → Delete
>    account**.
> 3. For people without the app: a "Sign in to delete" button. After sign-in,
>    show a red "Permanently delete my account" button with a confirmation step,
>    which calls the existing Supabase edge function `delete-account` with the
>    signed-in user's session and body `{ "confirm": true }`
>    (`supabase.functions.invoke("delete-account", { body: { confirm: true } })`),
>    then signs out and shows "Your account has been deleted."
> 4. Also offer email: "Or email info@clyzio.com from the address on your
>    account and we'll delete it within 30 days."
> 5. State what is deleted (profile, trips, carpool history, messages, photo)
>    and what may be kept (anonymised, aggregated statistics that can't
>    identify you).
>
> Do not create new tables or functions for this — `delete-account` already
> exists and is what the mobile app uses.

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

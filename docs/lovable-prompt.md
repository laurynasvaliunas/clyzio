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

## Prompt 9 — Match the mobile app's design system

> The mobile app just had a full design pass. Please align the website with it
> so both feel like one product. Apply site-wide (marketing pages, dashboard,
> legal pages):
>
> **Colours** — one brand hue, used sparingly:
> - Brand teal `#00565A` (hover/pressed `#003D40`, darkest `#002B2E`). Accent amber `#F59E0B` only for small highlights.
> - Status: success `#059669`, warning `#D97706`, danger `#DC2626`. Light tints for banners/pills: success `#ECFDF5` (border `#D1FAE5`, text `#047857`), warning `#FFFBEB` (text `#92400E`), danger `#FEF2F2` (border `#FECACA`, text `#B91C1C`).
> - Page background `#F7F9FA`, cards `#FFFFFF`, borders `#EDF1F2`. Text `#0B1A1F`, secondary text `#5A6A6F`. Never use `#8B989C` for text (it fails contrast) — placeholders and disabled states only.
> - Remove any other hues (purples, extra greens/blues, Tailwind defaults). Don't give each transport mode its own colour: mode icons are all brand teal, and CO₂ impact is shown with a small dot (green low, amber medium, red high).
>
> **Typography** — the system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`); weight carries hierarchy. Page titles 40px/48px bold with -0.8px letter-spacing (32px on mobile), section titles 18px bold, body 15–16px. No text smaller than 12px (11px only inside small badges).
>
> **Buttons** — primary: teal, fully rounded (pill), 56px tall on mobile / 48px on desktop, 17px bold white label. Secondary: white with teal border and teal label. Destructive: red. One primary button per view.
>
> **Icons** — line icons only from `lucide-react` (2px stroke). Replace every emoji used as an icon or decoration (🚗 🚲 🌱 🎉 👋 ⚡ etc.) and every text glyph used as an icon (✕ ← › ⊙). Transport modes: walking `Footprints`, bike `Bike`, e-bike/e-scooter `Zap`, motorbike `Gauge`, car `Car`, public transport `Bus`, carpool `Users`, working from home `House`.
>
> **Layout** — cards: 16px radius, 1px `#EDF1F2` border, very soft shadow. 16px side padding on mobile. Back buttons: 44px round, light `#F7F9FA` background, chevron-left icon. Every icon-only button needs an `aria-label`; visible focus rings; all text ≥ 4.5:1 contrast.
>
> **Wording** — "CO₂" with the subscript ₂ (never "CO2"), "Petrol" (not "Gasoline"), "Public transport", "Working from home". No emoji in headings or body copy.

## Prompt 10 — Backend rules that changed (the website shares this database)

> The shared Supabase backend was hardened in October 2026. Do **not** change
> the schema, RLS policies, functions or edge functions — but check the website
> still works with these rules, and handle the new errors gracefully:
>
> 1. `get_company_stats(p_company_id)` now only answers for a **manager or
>    company admin of that company**; anyone else gets error `42501`
>    ("forbidden"). Show "You don't have access to this company's dashboard"
>    instead of an error page.
> 2. `get_department_leaderboard(user_uuid)` and `get_company_breakdown(user_uuid)`
>    must be called with the **signed-in user's own id** (or a colleague in the
>    same company); other ids return `42501`.
> 3. **Rides**: a signed-in user can only insert a ride with `status = 'scheduled'`
>    where they are the only participant, and can only change an existing ride's
>    status to `'cancelled'`. Completing a trip must go through the
>    `complete-trip` edge function. Never update `rides` columns directly otherwise.
> 4. **Carpool matches** (`trip_intent_matches`): no direct updates from the
>    client. Approve, decline or withdraw through the `respond-to-match` edge
>    function (`{ match_id, accepted: true | false }`).
> 5. `profiles.baseline_co2` must be between 0 and 0.3 (kg CO₂ per km).
> 6. **AI features**: the AI edge functions now require the user's opt-in
>    (`profiles.ai_consent_at`). If the website offers AI suggestions to a user,
>    first show this text and set `ai_consent_at = now()` on agreement: *"Personalised
>    tips are written by Claude, an AI model made by Anthropic. To do that we send
>    Anthropic your commute distance, usual transport modes and working days,
>    departure time, car fuel type and CO₂ totals. We never send your name, your
>    addresses or your exact location. You can turn this off anytime in Settings."*
>    Without consent the functions return HTTP 403 with code `ai_consent_required`.
>
> Search the web codebase for every `.rpc(`, `.from('rides')`,
> `.from('trip_intent_matches')` and `functions.invoke(` call and confirm each
> one fits these rules. Tell me which ones you changed.

## Prompt 11 — Fixes after the 9 October 2026 check

> I checked clyzio.com against prompts 1, 7, 8, 9 and 10. Most of it is right —
> thank you. Please fix these remaining items:
>
> **1. Dashboard → Settings → Team is broken (most important).** It calls
> `supabase.rpc("get_company_employees", { admin_user_id })`, but that function
> was deliberately removed from the database in a security fix (it leaked
> employee data for any company ID). Do **not** recreate it. Instead read the
> members directly; the existing row-level security already lets managers read
> profiles in their own company:
> ```ts
> supabase.from("profiles")
>   .select("id, first_name, last_name, email, avatar_url, department_id, is_manager, created_at")
>   .eq("company_id", companyId)
>   .order("first_name")
> ```
> Non-managers get an empty list — show "Only managers can see the team list"
> instead of an error.
>
> **2. Delete-account sign-in should come back to the page.** "Sign in to
> delete" on `/delete-account` links to `/auth`, and after signing in the auth
> page always sends people to `/dashboard`. Link to
> `/auth?redirect=/delete-account` instead, and after sign-in (including via
> `/auth/callback`) go to `redirect` when it is present. Only accept values that
> start with a single `/` (reject `//…` and full URLs) so it can't be used as an
> open redirect. Default stays `/dashboard`.
>
> **3. Privacy policy page (`/legal/privacy`):**
> - The header still says "Version 1.0 · 24 March 2026" above "Last updated: 4
>   October 2026 · Version 1.1". Show only "Version 1.1 · 4 October 2026".
> - Replace the 🇪🇺 emoji in the "GDPR Compliant" box with the lucide
>   `ShieldCheck` icon in brand teal (the app now does the same).
> - Match the app word for word in these five places:
>   - Section 2: "Password (stored as a cryptographic hash; we never store plaintext passwords)"
>   - Section 2: "Vehicle details (make, model, fuel type; optional)"
>   - Section 3: "…necessary to provide the core services of the App, including trip tracking, CO₂ calculations, carpool matching, and AI-powered suggestions."
>   - Section 4: "Generating AI-powered commute suggestions tailored to your habits (only if you turn them on)"
>   - Section 12: add before the address: "For any privacy-related questions, requests to exercise your rights, or concerns, please contact our data protection point of contact:"
> - Section 5, Service Providers: the website itself loads Lovable's analytics
>   (`/~flock.js`, `/__l5e/events…js`) and sets a `session-id` cookie. Add a
>   bullet that accurately describes this — what it collects (pages viewed,
>   referring site, browser type and language, session ID) and where it is
>   stored — and add that location to Section 10 if it's outside the EU/UK.
>   Tell me whether the `session-id` cookie can be turned off, because if it is
>   used for analytics it may need a cookie-consent banner.
>
> **4. Design (prompt 9) leftovers:**
> - 14 places use `text-[10px]`, which is below the 12px minimum: the dashboard
>   stat labels ("kg CO₂", "Employees", "Avg/person"), timestamps, the "Loading
>   employees…" hint and secondary lines. Raise them to 12px. The small
>   uppercase badges ("Manager", "You", "Joined") may use 11px.
> - The app-store buttons fake the official badges with 10px text ("Download on
>   the", "GET IT ON"). Use the official Apple App Store and Google Play badge
>   images instead.
> - The floating ✦ "Ask about Scope 3" button has no accessible name. Add
>   `aria-label="Ask about Scope 3"`.
> - Leave the `"Car (Gasoline)": "my_car"` mapping alone: it is a lookup key for
>   old stored trip data, not on-screen text.

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

# Prompts for the Lovable web app (clyzio.com)

Copy each block into Lovable as its own prompt. **Prompt 1 is launch-blocking**
for the mobile app's deep links — everything else is web polish.

**Status (checked against the live site, 26 October 2026):** Prompts 1–13 are
live on clyzio.com, except Prompt 13's edge-function and header items, which
are repeated in **Prompt 14** (still to send).

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
> - The header shows two version lines ("Version 1.0 · 24 March 2026" and
>   "Last updated: 4 October 2026 · Version 1.1"). Keep only one; Prompt 12
>   sets its value.
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

## Prompt 12 — Independent users (personal email) on the website

> Clyzio now supports **independent users**: people who sign up with a personal
> email (Gmail, Yahoo, …) or whose company isn't registered. In the shared
> database they are profiles with `company_id IS NULL`. They use the **mobile
> app**; the website dashboard stays for companies. Today the sign-in wrapper
> on protected routes sends every signed-in user without a company to
> `/onboarding/company`, so independents get stuck on "create your company".
> Please:
>
> 1. **New page `/account`** (signed-in users only):
>    - Heading "Your Clyzio account is ready".
>    - Text: "Clyzio for individual commuters works in the mobile app. Sign in
>      there with the same email and password."
>    - The official App Store and Google Play badges, using the same store
>      links as the rest of the site.
>    - Links: Privacy policy (`/legal/privacy`), Delete account
>      (`/delete-account`), and Sign out.
>    - Only when the email domain is NOT a personal-mail domain (a company
>      domain that isn't registered yet): a secondary link "Register your
>      company" to `/onboarding/company`.
> 2. **Routing:**
>    - In the protected-route wrapper, when the signed-in profile has
>      `company_id IS NULL`, redirect to `/account` instead of
>      `/onboarding/company` (except on `/account` and `/onboarding/company`
>      themselves).
>    - After sign-in on `/auth` and `/auth/callback`, send independents to
>      `/account` and company users to `/dashboard`. A valid `redirect`
>      parameter (Prompt 11) still wins.
>    - The mobile app's email-confirmation links also open clyzio.com, so a
>      just-confirmed independent should land on `/account` too.
> 3. **Cross-company toggle copy** (Dashboard → Settings,
>    `allow_cross_org_visibility`): describe it as "Let employees match with
>    employees of other companies that also allow this." It does **not** cover
>    independent users; employees open individual trips to them in the app.
> 4. **Privacy policy** (`/legal/privacy`), Section 5, *Other Clyzio Users*:
>    replace "(normally colleagues at your company)" with "(colleagues at your
>    company, or other independent commuters if you don't belong to a company
>    or you open a trip to people outside it)". Show "Version 1.2 · 11 October
>    2026" and "Last updated: 11 October 2026" (this replaces the version line
>    from Prompt 11; keep only one).
>
> No database, RLS or edge-function changes are needed for this.

## Prompt 13 — Same numbers and the same words as the app (26 October 2026 QA)

*Send it as four messages, in this order (Lovable keeps the context between
them): **1.** the opening paragraph plus items 10 and 1 (security and privacy,
blocking) · **2.** items 2–6 (same numbers as the app) · **3.** item 7 (privacy
policy 1.3) · **4.** items 8 and 9 (headers and small fixes).*

> A QA pass compared clyzio.com with the mobile app on the same accounts. The
> database functions the website reads have been corrected on the backend side
> (migration 055); please align the website with them. **Do not change any
> database function, policy or table** — only the website code.
>
> **1. Team list → `get_company_members` (blocking for a privacy fix).**
> Dashboard → Settings → Team reads `profiles` directly (Prompt 11). Managers
> could read colleagues' whole profile rows that way, including home and work
> coordinates, which the privacy policy says employers don't get. Read the team
> through the new function instead — same fields, no locations:
> ```ts
> supabase.rpc("get_company_members", { p_company_id: companyId })
> // → id, first_name, last_name, email, avatar_url, department_id, is_manager, created_at
> ```
> Non-managers get an empty list: keep the "Only managers can see the team
> list" message. Tell me when this is live — direct profile access for managers
> is then switched off.
>
> **2. CO₂ per employee: stop summing rides yourself.** One screen reads
> `supabase.from("rides").select("co2_saved, completed_at").in("rider_id", …)`
> and adds up `co2_saved`. That counts a carpool's full CO₂ for the passenger and
> nothing for the driver, so it disagrees with the app (e.g. 7.69 kg on the web
> vs 5.07 kg in the app for the same person). Use
> `get_employee_coverage(p_company_id, p_period_start, p_period_end)` everywhere
> a per-employee or per-period CO₂ figure is shown — its `primary_kg` is now the
> person's credited CO₂ **saved** (a carpool counts half for each of the two),
> exactly what the app shows. Label it "CO₂ saved".
>
> **3. ESG inventory (`get_company_inventory`) — labels.**
> - `gross_kg`, `by_mode[].kg` and `by_department[].gross_kg` are **emissions**
>   (what was emitted), now consistent with each other. Label them "Emitted".
> - `by_department[].saved_kg` is new: the department's CO₂ **saved**. If the
>   department table showed `gross_kg` as savings before, switch that column to
>   `saved_kg`.
> - Show the factor table from the response (`factor_table[]`: mode,
>   `factor_kg_per_km`, `source`, `source_year`) on the Methodology page instead
>   of any hard-coded factors. The factors are now one cited set (DEFRA 2024 /
>   EEA 2023 / IPCC AR6) used identically by the app and the website.
>
> **4. Departments.** `get_company_breakdown` now groups by department (id and
> name) and includes an "Unassigned" row — the same grouping the app's manager
> dashboard uses. Show the "Unassigned" row instead of dropping it, so the
> department totals add up to the company total.
>
> **5. Transport mode names.** Show mode names from `transport_mode_catalog.label`
> (active rows only) — they now match the app ("Bike", "Public transport",
> "E-bike / E-scooter", "Motorcycle / Moped", "Car"). Don't hard-code mode names
> or factors.
>
> **6. Company settings.** The green score, CO₂ total, employee count and the
> company domain are now computed or verified by the server only; the database
> refuses direct edits. Make sure Settings never tries to update those columns
> (name, logo, colour and the cross-company toggle stay editable). The domain
> changes only through the existing verification flow.
>
> **7. Privacy policy (`/legal/privacy`) — match the app word for word, version
> "Version 1.3 · 26 October 2026" and "Last updated: 26 October 2026"** (keep one
> version line):
> - Section 2, after "Real-time device location when actively logging a trip":
>   "Your live position during a confirmed carpool, shared only with your carpool
>   partner and only from 15 minutes before pickup while the App is open"
> - Section 2, after "Trip history and completion status": "Ratings you give and
>   receive after a carpool", then a new group **Carpool Messages** with
>   "Messages you send to people you are matched with (in-app chat)".
> - Section 4: replace "Matching you with carpool partners at your company" with
>   "Matching you with carpool partners: colleagues at your company, and other
>   independent commuters if you don't belong to a company or you open a trip to
>   people outside it", and add "Delivering chat messages between matched
>   commuters and, during a carpool, sharing live positions between the two
>   people in it".
> - Section 5, *Other Clyzio Users*: after the first paragraph add "On the map,
>   other commuters' trips are only shown approximately (about 300 m)." and a
>   new paragraph: "When you are matched, the other person sees the proposed
>   pickup and drop-off: a point on the driver's route near you, or your door if
>   the driver offers to come to it (door pickups are only offered when you share
>   your pickup address). Matched people can send each other messages. During a
>   confirmed carpool, from 15 minutes before pickup and while the App is open,
>   you and your partner see each other's live position; positions are deleted
>   when the trip ends. After a carpool you can rate each other; a rating is
>   visible only to the two of you. You control your visibility in Profile →
>   Privacy." (This replaces the sentence starting "Once you both agree to a
>   carpool…".)
> - Section 6, after "Trip and location data…": "Carpool messages: Retained with
>   the carpool they belong to and deleted with your account" and "Live carpool
>   positions: Deleted as soon as the carpool trip is completed or cancelled".
>
> **8. Security headers.** The site sends no `Content-Security-Policy` and no
> `X-Frame-Options`, so any site can embed clyzio.com (including the dashboard
> and `/delete-account`) in an invisible frame (clickjacking). Please send
> `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`
> as **response headers** (a `<meta>` tag can't set either). If Lovable hosting
> can't add custom headers, tell me — it can be done in Cloudflare instead.
>
> **9. Smaller items.**
> - `https://www.clyzio.com` fails with a TLS error; redirect `www` to
>   `https://clyzio.com` (or say if that's a DNS change on my side).
> - The `twitter:image` meta tag points at an old Lovable preview screenshot
>   (`…lovable.app-…png`). Use a proper share image and add matching
>   `og:image` / `og:title` / `og:description` tags.
> - The `verify-domain` function answers a GET with HTTP 500; for anything but
>   POST it should return 405. (It's the website's own function; change only
>   that, nothing else on the backend.)
>
> **10. Domain verification runs only on the server (security, blocking).** A
> company admin could mark any domain verified without the DNS record: by
> inserting the `company_domains` row with `verified_at` set, by updating
> `verified_at`, or by calling `verify_company_domain` with the token the page
> shows. New sign-ups from that domain then joined their company. The database
> now refuses all three (migration 058): rows added from the browser are always
> unverified, and `verify_company_domain` / `backfill_company_domain` can only
> be called with the **service role**. Please make sure the `admin-verify-domain`
> edge function does exactly this:
> 1. Read the caller from the request's JWT and check they are an admin of the
>    domain's company (`is_company_admin`); otherwise 403.
> 2. Look up the TXT records of the domain and require one that equals
>    `clyzio-verify=<verification_token>`; otherwise return
>    `{ ok: false, error: "DNS TXT record not found yet" }`.
> 3. Only then, **with a service-role client**, call
>    `rpc("verify_company_domain", { _domain_id, _token })` and
>    `rpc("backfill_company_domain", { _domain_id })`, and return
>    `{ ok: true, backfilled: <number> }`.
> The browser keeps inserting domains as now (`company_id`, `domain` only),
> reading `verification_token`, and deleting domains. Also check that
> `admin-create-company` creates the company's domain **unverified** — the
> admin verifies it through DNS like any other domain.
>
> Apart from items 9 and 10 (the website's own edge functions), no database, RLS
> or edge-function changes are needed from your side.

## Prompt 14 — Prompt 13 leftovers (checked 26 October 2026, after publishing)

> Thanks — items 1–7 of the last prompt are live and correct. Three things are
> still open:
>
> **1. Domain verification (item 10).** The `admin-verify-domain`,
> `verify-domain` and `admin-create-company` edge functions were not redeployed —
> they are still the June versions. Please paste the full current code of
> `supabase/functions/admin-verify-domain/index.ts` here, then make it do exactly
> this: check the caller is an admin of the domain's company; require a TXT
> record `clyzio-verify=<verification_token>` on the domain; only then, **with a
> service-role client**, call `rpc("verify_company_domain", { _domain_id, _token })`
> and `rpc("backfill_company_domain", { _domain_id })` and return
> `{ ok: true, backfilled }`. The database no longer lets the browser or a
> user-JWT client mark a domain verified. In `admin-create-company`, create the
> company's domain unverified. In `verify-domain`, answer anything but POST
> with 405. Deploy all three.
>
> **2. Clickjacking protection.** clyzio.com still sends no `X-Frame-Options`
> or `Content-Security-Policy: frame-ancestors`. If Lovable hosting supports a
> `public/_headers` file (or any way to set response headers), add for all
> paths: `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.
> If it doesn't, tell me, and instead make the app refuse to render when it is
> inside a frame (`window.self !== window.top` → show only a link "Open
> clyzio.com"), at least on `/dashboard*`, `/delete-account` and `/auth*`.
>
> **3. Team page.** Changing a colleague's department or manager role shows
> "saved" but changes nothing (the database only lets people update their own
> profile). Don't fix it in the browser yet — a server function for it is
> coming; until then, hide or disable those two controls.

## Prompt 15 — Deploy the domain-verification functions (reviewed 26 October 2026)

> I reviewed the three files. You may change and deploy **exactly these edge
> functions**; the rule stays for everything else (no changes to database
> tables, policies, database functions or any other edge function).
>
> 1. **`admin-verify-domain`** — deploy your proposed replacement with two small
>    changes:
>    - Pass the token explicitly when reading the user:
>      `const token = authHeader.slice(7); const { data: u } = await userClient.auth.getUser(token);`
>    - Trim each TXT answer before comparing (some DNS providers add spaces):
>      add `.trim()` at the end of the `answers` mapping.
> 2. **`verify-domain`** — neither the website nor the mobile app calls it any
>    more (the website uses `admin-verify-domain`). Delete it: remove
>    `supabase/functions/verify-domain` and undeploy the function. If you can't
>    undeploy it, tell me and the backend owner will.
> 3. **`admin-create-company`** — no change needed: the database creates the
>    domain row unverified by default.
>
> Tell me when `admin-verify-domain` is deployed.

## Prompt 16 — Team page controls and domain claims (backend migration 059, 26 October 2026)

> The backend now has what the Team page and company sign-up need. Please make
> these website changes. You may change and deploy **exactly two edge
> functions**, `admin-create-company` and `admin-verify-domain`; the rule stays
> for everything else (no changes to database tables, policies, database
> functions or any other edge function).
>
> **1. Team page — bring back the two controls you hid**, calling these
> functions instead of updating `profiles`:
> ```ts
> supabase.rpc("set_member_department", { p_user_id: memberId, p_department_id: deptId /* or null */ })
> supabase.rpc("set_member_manager", { p_user_id: memberId, p_is_manager: true /* or false */ })
> ```
> - The department picker: for company admins and managers.
> - The manager button: for company admins only, and never on the admin's own
>   row.
> - Errors to show as a toast: `not_authorized` ("You can't change this
>   person"), `department_not_in_company`, `cannot_change_own_role` ("You can't
>   change your own role"). On success, refetch the team list
>   (`get_company_members`).
>
> **2. `admin-create-company` — only a verified domain is taken.** The database
> now lets several companies claim the same domain until one proves it through
> DNS; the one that verifies first keeps it and the other claims are removed.
> So replace the two duplicate checks (`companies.domain` and
> `company_domains.domain`) with one that only refuses a domain another company
> has **verified**:
> ```ts
> const { data: taken } = await admin.from("company_domains").select("id")
>   .eq("domain", domain).not("verified_at", "is", null).maybeSingle();
> if (taken) return json(409, { error: "This domain is already registered by a verified company" });
> ```
> Also, if inserting the `company_domains` row fails, delete the company you
> just created before returning the error, so no half-created company is left.
>
> **3. `admin-verify-domain` — a clear message when someone was faster.** If
> `verify_company_domain` returns an error whose message contains
> `domain_already_verified`, return
> `{ ok: false, error: "Another company has already verified this domain" }`
> (status 200) instead of the generic 500.
>
> Tell me when both functions are deployed and the site is published.

## Prompt 17 — send-email: own secret and abuse limits (26 October 2026)

> Thanks, `send-email` not being the Auth hook is right. Two hardening changes
> (you may change and deploy `send-email`, `request-demo` and
> `admin-invite-employee` only):
>
> 1. **Its own secret.** `send-email` accepts `CRON_SHARED_SECRET`, which also
>    triggers the carpool matcher and the stale-ride job. Give it a separate
>    secret, `EMAIL_SHARED_SECRET` (tell me its name once added; don't show the
>    value), used only by `send-email` and its two callers.
> 2. **No spam relay.** `request-demo` is public and now emails whatever
>    address is typed in; `admin-invite-employee` emails addresses chosen by any
>    company admin, with a company name that admin chose. Please make sure:
>    - the "We received your request" email contains **no text the visitor
>      typed** (no name, company or message) and no links;
>    - `request-demo` sends at most 3 emails per email address and 10 per IP
>      address per hour (count from `demo_requests`), and silently skips the
>      auto-reply above that;
>    - invites: at most 50 per company per day, and the company name is escaped
>      and shown as plain text, never as a link.
>
> Then send **one** test invitation email to my own address so I can check
> delivery and that its link opens the app.

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

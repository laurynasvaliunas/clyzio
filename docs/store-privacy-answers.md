# Store privacy forms — what to answer

Matches the app as of October 2026 (privacy policy v1.1). If a feature changes
what data leaves the app, update this file, the in-app policy
(`app/legal/privacy.tsx`) and the web policy together.

Facts these answers rest on:
- No ads, no ad SDKs, no cross-app tracking, no data sold. **Tracking: No.**
- Processors: Supabase (UK), Sentry (EU), Mapbox, Google Directions, Expo/APNs/FCM push, SMTP email, Anthropic (only after the in-app AI opt-in, minimised).
- Sentry reports carry a pseudonymous user ID → diagnostics are **linked** to the user.
- Deletion: in-app (Profile → Settings → Delete account) and web (`https://clyzio.com/delete-account`, see Lovable Prompt 8).

---

## Apple — App Store Connect → App Privacy

"Do you or your third-party partners collect data from this app?" → **Yes**.
For every type below: **Linked to the user: Yes**, **Used for tracking: No**.

| Category | Data type | Purposes |
|---|---|---|
| Contact Info | Name | App Functionality |
| Contact Info | Email Address | App Functionality |
| Contact Info | Phone Number (optional field) | App Functionality |
| Location | Precise Location | App Functionality |
| Location | Coarse Location | App Functionality |
| User Content | Photos or Videos (profile photo) | App Functionality |
| User Content | Other User Content (carpool chat messages) | App Functionality |
| Identifiers | User ID | App Functionality |
| Identifiers | Device ID (push token) | App Functionality |
| Usage Data | Product Interaction (trips completed, XP, badges) | App Functionality |
| Diagnostics | Crash Data | App Functionality |
| Diagnostics | Other Diagnostic Data (error reports) | App Functionality |
| Other Data | Commute data (transport modes, schedule, vehicle) | App Functionality |

Do **not** tick: Health, Financial, Contacts, Browsing/Search History,
Purchases, Sensitive Info, Audio, Advertising Data, Third-Party Advertising,
Developer's Advertising, Analytics, Product Personalisation.

**App Review notes** (paste into "Notes" under App Review Information):
> AI commute suggestions are optional and off by default. The user turns them
> on from the AI Planner card, which states that Anthropic (Claude) receives
> only commute distance, transport modes, working days, departure time, fuel
> type and CO₂ totals — never name, addresses or exact location. Consent can
> be withdrawn in Settings → AI suggestions. Location is used only while the
> app is in use. Demo account: <email> / <password> (has home/work set and a
> completed trip).

---

## Google — Play Console → App content → Data safety

- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes**
- Do you provide a way for users to request that their data is deleted? **Yes**
  → Delete account URL: `https://clyzio.com/delete-account`

For every type below: **Collected: Yes · Shared: No** (service providers and
user-initiated carpool sharing are exempt from "sharing" under Play's
definitions) · **Processed ephemerally: No** · **Required or optional** as noted
· **Purpose: App functionality** (plus Account management where shown).

| Data type | Required? | Purposes |
|---|---|---|
| Location → Approximate location | Optional (app works without it) | App functionality |
| Location → Precise location | Optional | App functionality |
| Personal info → Name | Required | App functionality, Account management |
| Personal info → Email address | Required | App functionality, Account management |
| Personal info → Phone number | Optional | App functionality |
| Personal info → User IDs | Required | App functionality, Account management |
| Photos and videos → Photos | Optional | App functionality |
| Messages → Other in-app messages | Optional | App functionality |
| App activity → Other actions (trips, XP) | Required | App functionality |
| App info and performance → Crash logs | Required | App functionality |
| App info and performance → Diagnostics | Required | App functionality |
| Device or other IDs → Device or other IDs (push token) | Optional | App functionality |

Not collected: Financial info, Health and fitness, Contacts, Calendar, Audio,
Files and docs, Web browsing, Installed apps, Emails/SMS.

**Other Play declarations**
- Ads: **No ads**.
- Target audience: **18+**.
- Location permissions: foreground only — no background-location declaration
  needed (ACCESS_BACKGROUND_LOCATION is blocked in `app.config.ts`).
- App access: provide the demo account above under "All or some functionality
  is restricted".

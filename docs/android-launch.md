# Android / Google Play — step-by-step launch prep

Everything the code needs is already committed. What remains is account-side
setup only you can do (Google/Play logins, signing keys).

**Your identifiers** — keep these handy:

| Thing | Value |
|---|---|
| Android package name | `com.clyzio.app` |
| App version / versionCode | `1.0.0` / `6` (auto-increments from now on) |
| EAS project id | `565dc638-6385-4dcf-885d-8abd3f0d9c30` |
| EAS account / slug | `laurynas.valiunas` / `clyzio` |
| Supabase project | `qvevbbqcrizfywqexlkw` |

---

## ⚠️ First: three different Google JSON files

This is the #1 thing people get wrong. You will end up with **three separate
JSON files that all look alike**. They are not interchangeable:

| # | File | Comes from | Used for | Where it goes |
|---|---|---|---|---|
| 1 | `google-services.json` | Firebase → Android app | Lets the **app** talk to FCM | EAS env var `GOOGLE_SERVICES_JSON` (build-time) |
| 2 | Firebase **service account** key | Firebase → Project settings → Service accounts | Lets **Expo's servers send** your push notifications | `eas credentials` → FCM V1 |
| 3 | Google Play **service account** key | Google Cloud → IAM, linked to Play Console | Lets `eas submit` **upload builds** to Play | saved locally as `google-service-account.json` |

Files 1 and 2 are Firebase. File 3 is Play Console. You need all three.
All three are gitignored — never commit them.

---

## Step 1 — Firebase project + the app config file (#1)

1. Go to <https://console.firebase.google.com> → **Create a project** (name it
   "Clyzio"). Google Analytics is optional — skip it if unsure.
2. In the project, click the **Android** icon to add an app.
3. **Android package name** must be exactly:
   ```
   com.clyzio.app
   ```
   Nickname and debug SHA-1 can be left blank.
4. Download **`google-services.json`**.
5. Register it with EAS as a *file*-type secret:
   ```bash
   eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production
   ```
   `app.config.ts` already reads this and wires it into the build.

> **Why it matters:** without this the Android build still *succeeds*, but push
> notifications are silently dead. Since carpool requests, match approvals and
> the nightly nudge are all push-driven, the app looks broken with no error.

## Step 2 — FCM credentials so Expo can actually send pushes (#2)

1. Firebase → ⚙️ **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → downloads a JSON file.
3. Upload it to EAS:
   ```bash
   eas credentials --platform android
   ```
   Choose: **production** → **Push Notifications: Manage your FCM V1 service
   account key** → **Upload a new service account key** → point at the file.

Verify it took:
```bash
eas credentials --platform android
```
It should now list an FCM V1 key.

## Step 3 — Signing key + the fingerprint you need for deep links

EAS generates and stores your upload keystore automatically on first build. To
see it (and get the SHA-256 you need in Step 6):

```bash
eas credentials --platform android
```
→ **production** → **Keystore: Manage everything needed to build your project**
→ copy the **SHA-256 Certificate Fingerprint** (format `AA:BB:CC:…`).

> Keep this keystore. If you lose it you cannot ship updates to the same Play
> listing. EAS stores it for you — don't opt into "local credentials" unless you
> have your own backup.

## Step 4 — First build + install on a real device

```bash
eas build --profile preview --platform android
```

`preview` produces an installable APK. Download it from the build page (or scan
the QR), install on any Android phone, and walk the golden path:

- Sign up → confirm email → 5-step setup (name/photo → places → garage →
  weekly mix → done)
- Map loads, tab icons look right
- Submit a carpool intent
- **Push notification actually arrives** ← this is what Steps 1–2 buy you
- Complete a trip, check Impact updates
- Tap a password-reset link from your email with the app killed

If push doesn't arrive, it's almost always Step 1 or 2.

## Step 5 — Play Console setup

1. <https://play.google.com/console> → **Create app** (one-time US$25 developer
   fee if you don't have an account).
2. App name "Clyzio", language, **App** (not Game), **Free**.
3. Work through **Set up your app**:
   - **App access** — if reviewers need a login, give them a demo account
     (create a real Clyzio account with home/work set and a completed trip).
   - **Ads** — declare none (the app has none).
   - **Content rating** — fill the questionnaire (Everyone).
   - **Target audience** — 18+ is simplest for a commuting app.
   - **Data safety** — declare honestly. Based on the current code you collect:
     - *Location (approximate + precise)* — app functionality; **not** shared;
       collected. Say it is **not** used for tracking/ads.
     - *Personal info*: name, email address, phone (optional), photo — account
       management + app functionality.
     - *App activity*: your trips/commutes — app functionality.
     - Data is **encrypted in transit**, and users **can request deletion**
       in-app (Settings → Delete account) — you can tick both.
   - **Privacy policy URL**: `https://clyzio.com/legal/privacy`
4. **Store listing**: title, short + full description, feature graphic
   (1024×500), and at least 2 phone screenshots. Take screenshots from the
   preview build (Map, Impact, Activity work well).

> **Good news on permissions:** the app now requests only location + vibrate.
> Background location was removed, so you do **not** need the background-location
> declaration form or the demo video Google requires for it. Camera and
> microphone are gone too.

## Step 6 — Android App Links (so shared links open the app)

`app.config.ts` already declares the intent filters. They only activate once a
file is hosted at your domain root:

1. Open `docs/well-known/assetlinks.json`.
2. Replace `REPLACE_WITH_SHA256_FROM_eas_credentials` with the SHA-256 from
   **Step 3**.
3. Have it served at exactly:
   ```
   https://clyzio.com/.well-known/assetlinks.json
   ```
   with `Content-Type: application/json` (this is a Lovable task — see
   `docs/lovable-prompt.md`).
4. Verify: <https://developers.google.com/digital-asset-links/tools/generator>

Until this is live, shared `https://clyzio.com/ride/…` links open the website
instead of the app. Nothing breaks — it just degrades.

## Step 7 — Production build + submit

Get the Play upload service account (#3):

1. Play Console → **Setup → API access** → link a Google Cloud project →
   **Create service account** → in Google Cloud grant it a role, then back in
   Play Console grant it **Release manager** (or Admin) permissions.
2. Download its JSON key and save it at the repo root as
   `google-service-account.json` (already gitignored, and `eas.json` already
   points at it).

Then:
```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

`autoIncrement` is now on, so versionCode bumps itself on every build — you can
resubmit after a rejection without editing anything.

3. In Play Console, promote the release: **Internal testing** first (fastest
   review, invite yourself), then **Production** once you're happy.

---

## Quick pre-flight

```bash
eas env:list --environment production
```
You want to see **`GOOGLE_SERVICES_JSON`** and **`MAPBOX_DOWNLOAD_TOKEN`**.
Both fail silently if missing: no Google file → dead push; no Mapbox token →
a confusing native-SDK fetch error during the build.

| ✅ | Item |
|---|---|
| ☐ | Firebase project created, `google-services.json` → `GOOGLE_SERVICES_JSON` |
| ☐ | FCM V1 service account key uploaded via `eas credentials` |
| ☐ | `MAPBOX_DOWNLOAD_TOKEN` present (secret `sk.` token, Downloads:Read scope) |
| ☐ | Preview build installed; **push notification received on a real device** |
| ☐ | Play Console app created, data safety + content rating done |
| ☐ | `assetlinks.json` hosted with the real SHA-256 |
| ☐ | Play service account JSON at `./google-service-account.json` |
| ☐ | `eas build --profile production --platform android` → `eas submit` |
